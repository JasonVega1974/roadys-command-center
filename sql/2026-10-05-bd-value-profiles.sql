BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- bd_value_profiles — a Bus Dev Potential Gallons value profile, optionally
-- linked to a CRM lead. Drafts and finals share the table; `status` tells
-- them apart. The full breakdown lives in inputs/results jsonb; the columns
-- beside them are the fields CRM.html renders and aggregates, promoted out
-- of jsonb so the Lead Table, CSV and leaderboard need no extraction and
-- SUM(final_gallons) works directly.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bd_value_profiles (
  id                text        PRIMARY KEY,
  -- SET NULL, not CASCADE: a lead row vanishing must orphan the profile,
  -- never destroy it.
  lead_id           text        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','final')),
  prospect_name     text        NOT NULL DEFAULT '',
  city              text        NOT NULL DEFAULT '',
  state_code        text        NOT NULL DEFAULT '',
  location_type     text        NOT NULL DEFAULT '',
  region            text        NOT NULL DEFAULT '',
  profile           text        NOT NULL DEFAULT '',
  roadway           text        NOT NULL DEFAULT '',
  inputs            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  results           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  official_subtotal integer,
  final_gallons     integer,
  recommendation    text        NOT NULL DEFAULT '',
  -- Provenance, mirroring the stamps the tool already keeps: the region % and
  -- baseline the stored gallons were computed on, so a figure can be told
  -- apart from one computed on today's scale.
  region_pct_stamp  text        NOT NULL DEFAULT '',
  baseline_stamp    text        NOT NULL DEFAULT '',
  author            text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS bd_value_profiles_lead_id
  ON public.bd_value_profiles (lead_id);
CREATE INDEX IF NOT EXISTS bd_value_profiles_status
  ON public.bd_value_profiles (status);
CREATE INDEX IF NOT EXISTS bd_value_profiles_deleted_at
  ON public.bd_value_profiles (deleted_at);

-- One FINAL profile per lead, so a lead card never has two numbers to choose
-- between.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_final_per_lead
  ON public.bd_value_profiles (lead_id)
  WHERE status = 'final' AND deleted_at IS NULL AND lead_id IS NOT NULL;

-- One DRAFT per lead, for the same reason: drafts are shared between owners,
-- so two drafts for one lead would be two answers to the same question.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_draft_per_lead
  ON public.bd_value_profiles (lead_id)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NOT NULL;

-- A draft not yet linked to a lead has lead_id IS NULL and cannot be
-- constrained that way, so those are keyed per author — Robert's unlinked
-- draft and Angel's must never collide.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_unlinked_draft_per_author
  ON public.bd_value_profiles (author)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NULL;

-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
CREATE OR REPLACE FUNCTION public.touch_bd_value_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS bd_value_profiles_touch_updated_at ON public.bd_value_profiles;
CREATE TRIGGER bd_value_profiles_touch_updated_at
  BEFORE UPDATE ON public.bd_value_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_bd_value_profiles_updated_at();

-- ── RLS: authenticated only ─────────────────────────────────────────────
-- The anon key is published in this repo's HTML on GitHub Pages, so anon is
-- granted nothing at all here. A signed-in session is the only way in.
ALTER TABLE public.bd_value_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bd_value_profiles_read   ON public.bd_value_profiles;
DROP POLICY IF EXISTS bd_value_profiles_insert ON public.bd_value_profiles;
DROP POLICY IF EXISTS bd_value_profiles_update ON public.bd_value_profiles;

CREATE POLICY bd_value_profiles_read   ON public.bd_value_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY bd_value_profiles_insert ON public.bd_value_profiles
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bd_value_profiles_update ON public.bd_value_profiles
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- No DELETE policy: removal is a soft delete (deleted_at), same as crm_leads.

GRANT SELECT, INSERT, UPDATE ON public.bd_value_profiles TO authenticated;
REVOKE ALL ON public.bd_value_profiles FROM anon;

-- ── crm_leads: index + a real updated_at trigger ────────────────────────
-- updated_at is currently set by CRM.html on every upsert, so a row written
-- by any other path keeps a stale value. The trigger makes it true regardless
-- of who writes.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS crm_leads_stage ON public.crm_leads (stage);

CREATE OR REPLACE FUNCTION public.touch_crm_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_touch_updated_at ON public.crm_leads;
CREATE TRIGGER crm_leads_touch_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_crm_leads_updated_at();

COMMIT;

-- ── Verification (run manually in the SQL editor after applying) ────────
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='bd_value_profiles'
--   order by ordinal_position;
-- select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='bd_value_profiles';
-- select indexname from pg_indexes
--   where schemaname='public' and tablename='bd_value_profiles';
-- -- must return 0 rows (anon holds no grant):
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='bd_value_profiles' and grantee='anon';
