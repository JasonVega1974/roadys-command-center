-- 2026-06-04 — Create public.pnl_notes
--
-- Fixes: "Could not find the table 'public.pnl_notes' in the schema cache".
-- index.html calls sb.from('pnl_notes').select/upsert/delete and subscribes
-- to realtime on this table — without it, the P&L Notes feature 4xxs on
-- every read. Schema mirrored from how the JS uses the columns:
--   * id            — text primary key, generated client-side as a uuid-ish
--                     string; pnlNoteSaveToSupabase uses onConflict:'id'
--   * note_date     — YYYY-MM-DD ("date" works; "text" is also fine because
--                     the renderer treats it as a string)
--   * card_section  — defaults to 'N/A'
--   * card_title    — defaults to 'N/A'
--   * line_item     — free text (the specific P&L row the note hangs off of)
--   * notes         — the note body itself
--   * created_at    — defaults to now()
--   * updated_at    — pnlNoteSaveToSupabase always passes this explicitly
--
-- Follows the CLAUDE.md new-table rules: RLS on, GRANT to anon+authenticated,
-- realtime publication enabled. The trigger function pins search_path so the
-- function_search_path_mutable lint stays green.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pnl_notes (
  id           text        PRIMARY KEY,
  note_date    date,
  card_section text        NOT NULL DEFAULT 'N/A',
  card_title   text        NOT NULL DEFAULT 'N/A',
  line_item    text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Useful indexes — the loader orders by note_date desc, the renderer sorts
-- by section + date, and realtime payloads filter implicitly by table.
CREATE INDEX IF NOT EXISTS pnl_notes_note_date_idx    ON public.pnl_notes (note_date DESC);
CREATE INDEX IF NOT EXISTS pnl_notes_card_section_idx ON public.pnl_notes (card_section);

-- Auto-bump updated_at on UPDATE. Most callers also set it explicitly, but
-- this catches any direct SQL-Editor edits.
CREATE OR REPLACE FUNCTION public.pnl_notes_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pnl_notes_touch_updated_at ON public.pnl_notes;
CREATE TRIGGER trg_pnl_notes_touch_updated_at
  BEFORE UPDATE ON public.pnl_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.pnl_notes_touch_updated_at();

-- ─── RLS + GRANTs (CLAUDE.md rule) ────────────────────────────────────────
ALTER TABLE public.pnl_notes ENABLE ROW LEVEL SECURITY;

-- Pattern matches pnl_notes / impl_sites / sd_tickets / crm_leads:
-- everyone can read, insert, update; no anon DELETE policy means the
-- table can only be wiped from the dashboard. delete() calls from the
-- browser require a DELETE policy though — add one because the JS at
-- pnlNoteDeleteFromSupabase relies on it.
DROP POLICY IF EXISTS pnl_notes_read   ON public.pnl_notes;
DROP POLICY IF EXISTS pnl_notes_insert ON public.pnl_notes;
DROP POLICY IF EXISTS pnl_notes_update ON public.pnl_notes;
DROP POLICY IF EXISTS pnl_notes_delete ON public.pnl_notes;

CREATE POLICY pnl_notes_read   ON public.pnl_notes FOR SELECT USING (true);
CREATE POLICY pnl_notes_insert ON public.pnl_notes FOR INSERT WITH CHECK (true);
CREATE POLICY pnl_notes_update ON public.pnl_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY pnl_notes_delete ON public.pnl_notes FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnl_notes TO anon, authenticated;

-- ─── Realtime publication ────────────────────────────────────────────────
-- index.html subscribes via sb.channel('pnl_notes_changes').on('postgres_changes', ...)
-- That requires the table to be in supabase_realtime. Guarded so re-running
-- the migration doesn't error if the table is already published.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'pnl_notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pnl_notes';
  END IF;
END $$;

COMMIT;

-- ─── Verification ─────────────────────────────────────────────────────────
-- After running, confirm:
--
--   SELECT relname, relrowsecurity
--     FROM pg_class WHERE relname = 'pnl_notes';
--   -- Expect: relrowsecurity = true
--
--   SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='pnl_notes'
--      AND grantee IN ('anon','authenticated')
--    GROUP BY grantee;
--   -- Expect: each role with privs = "DELETE, INSERT, SELECT, UPDATE"
--
--   SELECT proname, proconfig FROM pg_proc WHERE proname='pnl_notes_touch_updated_at';
--   -- Expect: proconfig contains 'search_path=public, pg_temp'
--
--   SELECT * FROM pg_publication_tables
--    WHERE pubname='supabase_realtime' AND tablename='pnl_notes';
--   -- Expect: one row
--
--   -- Round trip from the browser (replace the test id afterwards):
--   --   await sb.from('pnl_notes').insert({id:'test', note_date:'2026-06-04',
--   --                                       card_section:'Test', card_title:'Test',
--   --                                       line_item:'x', notes:'hello'});
--   --   await sb.from('pnl_notes').select('*').eq('id','test');
--   --   await sb.from('pnl_notes').delete().eq('id','test');
