begin;

-- ── crm_email_templates ──────────────────────────────────────────────
-- Shared library of canned outreach copy per pipeline stage, used by the
-- Email Templates tab in CRM.html. Previously localStorage-only (per
-- browser); this table makes edits visible to both owners.
create table if not exists public.crm_email_templates (
  id         text primary key,
  name       text not null,
  stage      text not null,
  subject    text not null default '',
  body       text not null default '',
  updated_at timestamptz default now()
);

alter table public.crm_email_templates enable row level security;

create policy crm_tmpl_read   on public.crm_email_templates for select using (true);
create policy crm_tmpl_insert on public.crm_email_templates for insert with check (true);
create policy crm_tmpl_update on public.crm_email_templates for update using (true) with check (true);
create policy crm_tmpl_delete on public.crm_email_templates for delete using (true);

grant select, insert, update, delete on public.crm_email_templates to anon, authenticated;

-- reuse the existing search-path-pinned trigger fn touch_updated_at()
create trigger crm_tmpl_touch before update on public.crm_email_templates
  for each row execute function public.touch_updated_at();

-- Seed the 8 default templates (one per pipeline stage). on conflict do
-- nothing so re-running this file, or running it after someone has already
-- customized a template, never clobbers real edits.
insert into public.crm_email_templates (id, name, stage, subject, body) values
('intro', 'Initial Outreach', 'Prospect',
'Roady''s Rewards - Grow Your Fuel Volume',
'Hi {{contact}},

My name is {{owner}} with Roady''s Truck Stop Network. I wanted to reach out about {{company}}.

We help independent truck stops compete with national chains through our Roady''s Rewards driver loyalty program, fuel aggregator discounts, and vendor programs. Operators with {{locations}} location(s) typically see meaningful fuel volume growth within 60 days.

Would you be open to a 15-minute call this week?

Best,
{{owner}}'),

('qualified', 'Ready to Schedule', 'Qualified',
'Let''s find 15 minutes - Roady''s Rewards for {{company}}',
'Hi {{contact}},

Based on what we''ve discussed, {{company}} looks like a great fit for the Roady''s Rewards network. I''d like to walk you through the numbers and next steps.

I can send over a few time slots this week, or if it''s easier, just reply with a day/time that works and I''ll build around it.

Talk soon,
{{owner}}'),

('followup', 'Follow-Up (No Response)', 'Contacted',
'Quick follow-up - Roady''s Rewards for {{company}}',
'Hi {{contact}},

Just following up on my last message. We have helped several operators in {{state}} grow their fuel volume through the Roady''s Rewards network.

Would 15 minutes this week work?

{{owner}}'),

('meeting_reminder', 'Meeting Reminder', 'Meeting Scheduled',
'Looking forward to our meeting - {{company}}',
'Hi {{contact}},

Just confirming our upcoming meeting to discuss Roady''s Rewards for {{company}}.

I''ll cover:
- How the Rewards loyalty program works
- Fuel aggregator discounts
- Vendor programs and additional revenue
- Onboarding timeline

Looking forward to it!
{{owner}}'),

('proposal_followup', 'Proposal Follow-Up', 'Proposal Sent',
'Checking in on our proposal - {{company}}',
'Hi {{contact}},

Just checking in on the proposal I sent over. Happy to answer any questions about pricing, onboarding, or how the rewards program works.

Looking forward to hearing from you,
{{owner}}'),

('negotiation', 'Negotiation Check-In', 'Negotiation',
'Next steps for {{company}} partnership',
'Hi {{contact}},

Wanted to touch base as we finalize details for {{company}}. If anything is holding things up, let us talk it through.

Can we schedule a quick call this week?

{{owner}}'),

('won', 'Welcome / Closed Won', 'Closed Won',
'Welcome to Roady''s - {{company}} is in the network!',
'Hi {{contact}},

Welcome! We are thrilled to have {{company}} as part of the Roady''s network.

Next steps:
1. Onboarding team will reach out within 48 hours
2. Your location(s) configured in the Rewards system
3. You will receive driver-facing materials and POS guide
4. Test transaction together

Let''s grow some volume!

{{owner}}
Roady''s Truck Stop Network'),

('closed_lost', 'Keeping the Door Open', 'Closed Lost',
'No pressure - here if things change, {{company}}',
'Hi {{contact}},

Thanks for taking the time to talk through Roady''s Rewards for {{company}}. I understand the timing isn''t right, and I don''t want to be a bother.

If anything changes down the road - a new location, a fuel program up for renewal, or you just want to revisit the numbers - I''m happy to pick the conversation back up.

Wishing you and the team well,
{{owner}}')

on conflict (id) do nothing;

commit;

-- ── Verify ──────────────────────────────────────────────────────────
-- select id, name, stage from public.crm_email_templates order by stage;
-- (expect 8 rows: Prospect, Qualified, Contacted, Meeting Scheduled,
--  Proposal Sent, Negotiation, Closed Won, Closed Lost)
