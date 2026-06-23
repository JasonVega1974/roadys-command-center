-- =====================================================================
-- submit_optin security-boundary tests
-- =====================================================================
-- Run in the Supabase SQL editor AFTER Phase A1 of agp_optin_portal.sql
-- (the functions must exist; no grant/token-lock needed). The whole script
-- is wrapped in BEGIN … ROLLBACK: every fixture below is created INSIDE the
-- transaction and removed by the final ROLLBACK, so it can never leave test
-- rows in agp_locations / agp_optins / agp_aggregators. Nothing persists.
--
-- Expected result: TWO notices —
--   "ALL submit_optin boundary cases PASSED"  (token entry point)
--   "ALL submit_optin_by_code boundary cases PASSED"  (code+name fallback)
-- Any "CASE… FAIL" raises an exception → fix the relevant function in
-- agp_optin_portal.sql, re-apply it, re-run. Do not wire the page's submit()
-- until this is green.
-- =====================================================================
begin;

-- ---- fixtures (created here; rolled back at the end) ----------------
insert into public.agp_aggregators (id, name, show_on_form, discount_type, discount_value)
  values ('t_pub',   'TestPub',   true,  'R-', '12'),
         ('t_unpub', 'TestUnpub', false, 'C+', '10');

insert into public.agp_locations (id, name, code, optin_token)
  values ('t_locA',  'Stop A', 'TA', 'tok_AAA_' || public.gen_optin_token()),
         ('t_locB',  'Stop B', 'TB', 'tok_BBB_' || public.gen_optin_token()),
         ('t_locC',  'Stop C', 'TC', 'tok_CCC_' || public.gen_optin_token()),   -- by-code happy path
         ('t_locD1', 'Stop D', 'TD', 'tok_DD1_' || public.gen_optin_token()),   -- duplicate code+name
         ('t_locD2', 'Stop D', 'TD', 'tok_DD2_' || public.gen_optin_token());   --   -> ambiguous

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

-- ---- submit_optin_by_code (lost-link fallback) boundary assertions --
-- Same guarantees as submit_optin, reached through the code+name entry point,
-- which must resolve to EXACTLY ONE stop or reject (no partial/ambiguous match).
do $$
declare n_before int; n_after int; v_status text; v_type text; v_val text;
begin
  -- CASE 5: code+name that doesn't resolve -> rejected, ZERO writes
  select count(*) into n_before from public.agp_optins;
  begin
    perform public.submit_optin_by_code('NOPE', 'Nobody',
      '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
    raise exception 'CASE5 FAIL: non-matching code+name did not raise';
  exception when sqlstate '28000' then null; end;
  select count(*) into n_after from public.agp_optins;
  if n_after <> n_before then raise exception 'CASE5 FAIL: no-match wrote % rows', n_after - n_before; end if;

  -- CASE 6: ambiguous (code TD + name "Stop D" matches 2) -> rejected, ZERO writes
  select count(*) into n_before from public.agp_optins;
  begin
    perform public.submit_optin_by_code('TD', 'Stop D',
      '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
    raise exception 'CASE6 FAIL: ambiguous match did not raise';
  exception when sqlstate '28000' then null; end;
  select count(*) into n_after from public.agp_optins;
  if n_after <> n_before then raise exception 'CASE6 FAIL: ambiguous wrote % rows', n_after - n_before; end if;

  -- CASE 7: partial/fuzzy must NOT match (exact only): right code, partial name -> reject
  begin
    perform public.submit_optin_by_code('TC', 'Stop',   -- real name is 'Stop C'
      '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
    raise exception 'CASE7 FAIL: partial name matched';
  exception when sqlstate '28000' then null; end;

  -- CASE 8: happy path (case-insensitive exact) writes ONLY t_locC, with the
  --   show_on_form filter + clamping enforced through the by-code entry point.
  perform public.submit_optin_by_code('tc', 'stop c',
    '[{"aggregator_id":"t_pub","status":"MAYBE","discount_type":"WAT","retail_minus":"999","cost_plus":"abc"},{"aggregator_id":"t_unpub","status":"Yes","discount_type":"C+","cost_plus":"10"}]'::jsonb);
  -- 8a: unpublished aggregator skipped
  if exists (select 1 from public.agp_optins where aggregator_id = 't_unpub' and location_id = 't_locC') then
    raise exception 'CASE8 FAIL: by_code wrote a row for an unpublished aggregator';
  end if;
  -- 8b: clamping applied through this path
  select status, discount_type, retail_minus into v_status, v_type, v_val
    from public.agp_optins where aggregator_id = 't_pub' and location_id = 't_locC';
  if v_status is null      then raise exception 'CASE8 FAIL: by_code did not write the published row'; end if;
  if v_status <> 'No Response' then raise exception 'CASE8 FAIL: status not clamped (got %)', v_status; end if;
  if v_type   <> ''        then raise exception 'CASE8 FAIL: type not clamped (got %)', v_type; end if;
  if v_val    <> ''        then raise exception 'CASE8 FAIL: value not clamped (got %)', v_val; end if;
  -- 8c: own-stop only — neither ambiguous stop nor the token-path stop B was touched
  if exists (select 1 from public.agp_optins where location_id in ('t_locD1','t_locD2','t_locB')) then
    raise exception 'CASE8 FAIL: by_code wrote another stop''s rows';
  end if;

  raise notice 'ALL submit_optin_by_code boundary cases PASSED';
end $$;

rollback;
