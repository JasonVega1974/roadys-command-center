begin;

create table if not exists public.crm_booking_offers (
  token          uuid primary key default gen_random_uuid(),
  lead_id        text not null,
  company        text,
  owner          text,
  prospect_email text,
  offered_slots  jsonb not null,          -- array of ISO 8601 timestamptz strings
  status         text not null default 'open',   -- open | booked | expired
  chosen_slot    timestamptz,
  created_at     timestamptz default now(),
  expires_at     timestamptz not null default (now() + interval '14 days')
);

alter table public.crm_booking_offers enable row level security;
-- NO anon/authenticated grants: this table is reached only via the
-- service-role edge function and the SECURITY DEFINER RPCs below.
-- (RLS on + zero policies = locked to definer/service paths.)

-- resolve: public page fetches offer details by token
create or replace function public.resolve_booking_offer(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare rec public.crm_booking_offers;
begin
  select * into rec from public.crm_booking_offers where token = p_token;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if rec.expires_at < now() and rec.status = 'open' then
    update public.crm_booking_offers set status='expired' where token = p_token;
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if rec.status <> 'open' then
    return jsonb_build_object('ok',false,'reason',rec.status);
  end if;
  return jsonb_build_object('ok',true,'company',rec.company,'owner',rec.owner,'slots',rec.offered_slots);
end $$;

-- submit: prospect picks a slot; creates the scheduled call
create or replace function public.submit_booking_choice(p_token uuid, p_slot timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare rec public.crm_booking_offers; v_call_id text;
begin
  select * into rec from public.crm_booking_offers where token = p_token for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if rec.expires_at < now() and rec.status = 'open' then
    update public.crm_booking_offers set status='expired' where token = p_token;
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if rec.status <> 'open' then
    return jsonb_build_object('ok',false,'reason',rec.status);
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(rec.offered_slots) s
    where s::timestamptz = p_slot
  ) then
    return jsonb_build_object('ok',false,'reason','bad_slot');
  end if;

  v_call_id := 'call_' || (extract(epoch from clock_timestamp())*1000)::bigint;
  insert into public.crm_scheduled_calls
    (id, lead_id, company, owner, call_type, scheduled_at, status, source, note)
  values
    (v_call_id, rec.lead_id, rec.company, rec.owner, 'Initial Call', p_slot,
     'scheduled', 'prospect', 'Booked by prospect via availability link');

  update public.crm_booking_offers
     set status='booked', chosen_slot=p_slot where token = p_token;

  return jsonb_build_object('ok',true,'call_id',v_call_id,'scheduled_at',p_slot,
                            'company',rec.company,'owner',rec.owner,
                            'prospect_email',rec.prospect_email);
end $$;

-- list open offers for the CRM "awaiting response" badge (safe columns only)
create or replace function public.list_open_offers()
returns table(token uuid, lead_id text, company text, owner text,
              offered_slots jsonb, status text, created_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select token, lead_id, company, owner, offered_slots, status, created_at
  from public.crm_booking_offers
  where status = 'open' and expires_at > now()
  order by created_at desc;
$$;

grant execute on function public.resolve_booking_offer(uuid)            to anon, authenticated;
grant execute on function public.submit_booking_choice(uuid, timestamptz) to anon, authenticated;
grant execute on function public.list_open_offers()                     to anon, authenticated;

commit;

-- Verify:
-- select public.resolve_booking_offer('00000000-0000-0000-0000-000000000000'::uuid);
