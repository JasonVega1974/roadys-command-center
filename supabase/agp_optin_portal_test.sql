-- =====================================================================
-- submit_optin security-boundary tests
-- =====================================================================
-- Run in the Supabase SQL editor AFTER Phase A1 of agp_optin_portal.sql
-- (the functions must exist; no grant/token-lock needed). The whole script
-- is wrapped in BEGIN … ROLLBACK: every fixture below is created INSIDE the
-- transaction and removed by the final ROLLBACK, so it can never leave test
-- rows in agp_locations / agp_optins / agp_aggregators. Nothing persists.
--
-- Expected result: "NOTICE: ALL submit_optin boundary cases PASSED".
-- Any "CASE… FAIL" raises an exception → fix submit_optin in
-- agp_optin_portal.sql, re-apply the function, re-run. Do not proceed to the
-- page code until this is green.
-- =====================================================================
begin;

-- ---- fixtures (created here; rolled back at the end) ----------------
insert into public.agp_aggregators (id, name, show_on_form, discount_type, discount_value)
  values ('t_pub',   'TestPub',   true,  'R-', '12'),
         ('t_unpub', 'TestUnpub', false, 'C+', '10');

insert into public.agp_locations (id, name, code, optin_token)
  values ('t_locA', 'Stop A', 'TA', 'tok_AAA_' || public.gen_optin_token()),
         ('t_locB', 'Stop B', 'TB', 'tok_BBB_' || public.gen_optin_token());

-- ---- boundary assertions -------------------------------------------
do $$
declare
  tokA text; tokB text;
  n_before int; n_after int;
  v_status text; v_type text; v_val text;
begin
  select optin_token into tokA from public.agp_locations where id = 't_locA';
  select optin_token into tokB from public.agp_locations where id = 't_locB';

  -- CASE 1: invalid/unresolvable token -> rejected, ZERO writes
  select count(*) into n_before from public.agp_optins;
  begin
    perform public.submit_optin('definitely-not-a-real-token',
      '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
    raise exception 'CASE1 FAIL: invalid token did not raise';
  exception
    when sqlstate '28000' then null;   -- expected: invalid-token error
  end;
  select count(*) into n_after from public.agp_optins;
  if n_after <> n_before then
    raise exception 'CASE1 FAIL: invalid token wrote % rows', n_after - n_before;
  end if;

  -- CASE 2: choice naming a NON-show_on_form aggregator -> entry skipped (no row)
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_unpub","status":"Yes","discount_type":"C+","cost_plus":"10"}]'::jsonb);
  if exists (select 1 from public.agp_optins where aggregator_id = 't_unpub' and location_id = 't_locA') then
    raise exception 'CASE2 FAIL: wrote a row for an unpublished aggregator';
  end if;

  -- CASE 3: re-submit writes ONLY the token's own stop, never another stop's rows
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_pub","status":"No","discount_type":"R-","retail_minus":"8"}]'::jsonb);
  perform public.submit_optin(tokA,   -- re-submit; latest wins for stop A
    '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
  if exists (select 1 from public.agp_optins where location_id = 't_locB') then
    raise exception 'CASE3 FAIL: stop A submit wrote stop B rows';
  end if;
  select status into v_status from public.agp_optins where aggregator_id = 't_pub' and location_id = 't_locA';
  if v_status <> 'Yes' then
    raise exception 'CASE3 FAIL: re-submit did not update own row (got %)', v_status;
  end if;

  -- CASE 4: out-of-range status + discount values -> clamped
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_pub","status":"MAYBE","discount_type":"WAT","retail_minus":"999","cost_plus":"abc"}]'::jsonb);
  select status, discount_type, retail_minus
    into v_status, v_type, v_val
    from public.agp_optins where aggregator_id = 't_pub' and location_id = 't_locA';
  if v_status <> 'No Response' then raise exception 'CASE4 FAIL: status not clamped (got %)', v_status; end if;
  if v_type   <> ''            then raise exception 'CASE4 FAIL: type not clamped (got %)', v_type;   end if;
  if v_val    <> ''            then raise exception 'CASE4 FAIL: value not clamped (got %)', v_val;   end if;

  raise notice 'ALL submit_optin boundary cases PASSED';
end $$;

rollback;
