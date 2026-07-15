BEGIN;

-- ── crm_lead_notes ────────────────────────────────────────────────────
-- Rich-text notes archive backing the Notes tab in CRM.html. company/state/
-- stage are denormalized snapshots (not live-joined to crm_leads) so a
-- note stays meaningful for filtering/export even if the lead's info
-- later changes or the lead itself gets soft-deleted.
CREATE TABLE IF NOT EXISTS public.crm_lead_notes (
  id         text primary key,
  lead_id    text not null,
  company    text not null default '',
  state      text not null default '',
  stage      text not null default '',
  owner      text not null default '',
  body       text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.crm_lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_notes_read   ON public.crm_lead_notes FOR SELECT USING (true);
CREATE POLICY crm_notes_insert ON public.crm_lead_notes FOR INSERT WITH CHECK (true);
CREATE POLICY crm_notes_update ON public.crm_lead_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY crm_notes_delete ON public.crm_lead_notes FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_notes TO anon, authenticated;

CREATE INDEX IF NOT EXISTS crm_lead_notes_lead_id ON public.crm_lead_notes (lead_id);
CREATE INDEX IF NOT EXISTS crm_lead_notes_state    ON public.crm_lead_notes (state);
CREATE INDEX IF NOT EXISTS crm_lead_notes_stage    ON public.crm_lead_notes (stage);

-- reuse the existing search-path-pinned trigger fn touch_updated_at()
CREATE TRIGGER crm_notes_touch BEFORE UPDATE ON public.crm_lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────
-- select id, lead_id, company, state, stage, owner, created_at
-- from public.crm_lead_notes order by created_at desc limit 20;
