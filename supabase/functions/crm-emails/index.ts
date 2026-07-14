// Supabase Edge Function: crm-emails
// Actions: reminder_1h | reminder_dod | send_availability | send_confirmation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL   = Deno.env.get("SUPABASE_URL")!;
const SB_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND   = Deno.env.get("RESEND_API_KEY")!;
const FROM     = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const BASE     = Deno.env.get("APP_BASE_URL") ?? "";
const CRON_SEC = Deno.env.get("CRON_SECRET") ?? "";

const sb = createClient(SB_URL, SB_KEY);
const CORS = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c] as string));
}
async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ownerEmail(owner: string | null): Promise<string | null> {
  if (!owner) return null;
  const { data } = await sb.from("crm_owner_emails").select("email").eq("owner", owner).maybeSingle();
  return data?.email ?? null;
}
const callLink = (leadId: string) => `${BASE}/CRM.html?lead=${encodeURIComponent(leadId)}&call=1`;
const TZ = "America/Denver"; // both current CRM owners (Robert Watson, Angel Long) are Mountain time
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US",
  { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

// Returns the [start, end) instants (as Date objects, true UTC) for "today" in TZ,
// computed from TZ's actual current UTC offset (handles MST/MDT correctly) rather
// than the edge function runtime's local time (which is UTC, not TZ).
function tzDayBoundsUTC(tz: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now).map(p => [p.type, p.value])
  );
  const asIfUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asIfUTC - now.getTime(); // tz's current offset from UTC
  const localMidnightAsUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, 0, 0);
  const start = new Date(localMidnightAsUTC - offsetMs);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    // ---- cron-only actions require the shared secret ----
    if (action === "reminder_1h" || action === "reminder_dod") {
      if (req.headers.get("x-cron-secret") !== CRON_SEC) return json({ error: "unauthorized" }, 401);
    }

    if (action === "reminder_1h") {
      const now = Date.now(), hi = new Date(now + 60 * 60 * 1000).toISOString();
      const { data: calls } = await sb.from("crm_scheduled_calls").select("*")
        .eq("status", "scheduled").eq("reminder_1h_sent", false)
        .gte("scheduled_at", new Date(now).toISOString()).lte("scheduled_at", hi);
      let sent = 0;
      for (const c of calls ?? []) {
        const to = await ownerEmail(c.owner); if (!to) continue;
        const { data: lead } = await sb.from("crm_leads").select("phone").eq("id", c.lead_id).maybeSingle();
        await sendEmail(to, `CRM Call Reminder — ${c.company ?? c.lead_id}`,
          `<h2>Call coming up</h2><p><b>${esc(c.company)}</b><br>Type: ${c.call_type}<br>
           Time: ${fmt(c.scheduled_at)}<br>Phone: ${lead?.phone ?? "—"}</p>
           <p><a href="${callLink(c.lead_id)}">Open in CRM →</a></p>`);
        await sb.from("crm_scheduled_calls").update({ reminder_1h_sent: true }).eq("id", c.id);
        sent++;
      }
      return json({ ok: true, sent });
    }

    if (action === "reminder_dod") {
      const { start, end } = tzDayBoundsUTC(TZ);
      const { data: calls } = await sb.from("crm_scheduled_calls").select("*")
        .eq("status","scheduled").eq("reminder_dod_sent", false)
        .gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString());
      // group by owner
      const byOwner: Record<string, any[]> = {};
      for (const c of calls ?? []) (byOwner[c.owner ?? ""] ??= []).push(c);
      let digests = 0;
      for (const [owner, list] of Object.entries(byOwner)) {
        const to = await ownerEmail(owner); if (!to) continue;
        const rows = list.sort((a,b)=>a.scheduled_at<b.scheduled_at?-1:1)
          .map(c=>`<li>${fmt(c.scheduled_at)} — <b>${esc(c.company)}</b> (${c.call_type})
                   — <a href="${callLink(c.lead_id)}">open</a></li>`).join("");
        await sendEmail(to, `CRM Call Reminder — ${list.length} call(s) today`,
          `<h2>Today's scheduled calls</h2><ul>${rows}</ul>`);
        for (const c of list) await sb.from("crm_scheduled_calls").update({ reminder_dod_sent: true }).eq("id", c.id);
        digests++;
      }
      return json({ ok: true, digests });
    }

    if (action === "send_availability") {
      const { lead_id, prospect_email, slots } = body;
      if (!lead_id || !prospect_email || !Array.isArray(slots) || !slots.length || slots.length > 6)
        return json({ error: "bad_request" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prospect_email)) return json({ error: "bad_email" }, 400);
      const { data: lead } = await sb.from("crm_leads").select("id,company,owner").eq("id", lead_id).maybeSingle();
      if (!lead) return json({ error: "lead_not_found" }, 404);
      const { data: offer, error } = await sb.from("crm_booking_offers").insert({
        lead_id, company: lead.company, owner: lead.owner, prospect_email, offered_slots: slots,
      }).select("token").single();
      if (error) throw error;
      const link = `${BASE}/call-booking.html?token=${offer.token}`;
      const reply = await ownerEmail(lead.owner) ?? undefined;
      await sendEmail(prospect_email, `Let's find a time to talk — ${lead.company ?? "Roady's"}`,
        `<p>Hi,</p><p>Please pick a time that works for a quick call:</p>
         <p><a href="${link}">Choose a time →</a></p>`, reply);
      return json({ ok: true, token: offer.token });
    }

    if (action === "send_confirmation") {
      const { token } = body;
      const { data: offer } = await sb.from("crm_booking_offers").select("*").eq("token", token).maybeSingle();
      if (!offer || offer.status !== "booked" || !offer.chosen_slot) return json({ error: "not_booked" }, 400);
      const reply = await ownerEmail(offer.owner) ?? undefined;
      await sendEmail(offer.prospect_email, `Your call is scheduled — ${fmt(offer.chosen_slot)}`,
        `<p>You're all set for <b>${fmt(offer.chosen_slot)}</b>. We look forward to speaking with you.</p>`, reply);
      const to = await ownerEmail(offer.owner);
      if (to) await sendEmail(to, `CRM Call Reminder — new booking (${offer.company ?? ""})`,
        `<p>${esc(offer.prospect_email)} booked <b>${fmt(offer.chosen_slot)}</b> — ${esc(offer.company)}.</p>
         <p><a href="${callLink(offer.lead_id)}">Open in CRM →</a></p>`);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
