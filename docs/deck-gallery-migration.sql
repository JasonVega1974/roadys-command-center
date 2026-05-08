-- ─────────────────────────────────────────────────────────────────────
-- deck_gallery — shared image library for the Business Review deck.
-- Run this once in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/yyhnnalsqzyghjqtfisy/sql/new
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deck_gallery (
  id           text PRIMARY KEY,
  slot_key     text,                                  -- 'logo', 's7-shot', 's10-cocacola', etc. (optional)
  label        text NOT NULL,                         -- human-readable name in the UI
  category     text NOT NULL DEFAULT 'other',         -- 'logo' | 'vendor' | 'screenshot' | 'photo' | 'other'
  vendor_id    text,                                  -- matches vp_enroll.vendor_id when category='vendor'
  data_url     text NOT NULL,                         -- base64 data URL, resized client-side to ≤1500px
  width        integer,
  height       integer,
  size_bytes   integer,
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deck_gallery_slot_idx     ON public.deck_gallery(slot_key);
CREATE INDEX IF NOT EXISTS deck_gallery_vendor_idx   ON public.deck_gallery(vendor_id);
CREATE INDEX IF NOT EXISTS deck_gallery_category_idx ON public.deck_gallery(category);

-- Table-level privileges. Tables created via the SQL Editor do NOT inherit
-- the auto-grants the Supabase Dashboard table builder applies, so we have
-- to grant explicitly to anon / authenticated. Without this, every write
-- fails with "permission denied for table deck_gallery" before RLS even runs.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_gallery TO anon, authenticated;

-- Row-level security: anon role can read & write. Write authority is gated
-- in the app layer by the master PIN, matching the existing patterns for
-- vp_enroll, impl_sites and pnl_notes.
ALTER TABLE public.deck_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_gallery anon read"  ON public.deck_gallery;
DROP POLICY IF EXISTS "deck_gallery anon write" ON public.deck_gallery;

CREATE POLICY "deck_gallery anon read"
  ON public.deck_gallery FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "deck_gallery anon write"
  ON public.deck_gallery FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- updated_at auto-bump on UPDATE
CREATE OR REPLACE FUNCTION public.deck_gallery_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS deck_gallery_touch_trigger ON public.deck_gallery;
CREATE TRIGGER deck_gallery_touch_trigger
  BEFORE UPDATE ON public.deck_gallery
  FOR EACH ROW EXECUTE FUNCTION public.deck_gallery_touch_updated_at();
