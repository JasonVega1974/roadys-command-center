-- 2026-05-27 — Supabase hardening: enable RLS on tables with policies,
-- pin function search_path on the two triggers flagged by `supabase lint`.
--
-- Run order: this file first, then 2026-05-27-grant-anon-authenticated.sql.
-- Both are idempotent and safe to re-run.

BEGIN;

-- ─── 1. Enable Row Level Security ─────────────────────────────────────────
-- Both tables already have policies attached; without RLS enabled, the
-- policies are inert and every anon/authenticated query bypasses them.

ALTER TABLE public.geo_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.value_props ENABLE ROW LEVEL SECURITY;

-- ─── 2. Pin function search_path ──────────────────────────────────────────
-- Supabase's "Function Search Path Mutable" lint warning flags any
-- SECURITY DEFINER or trigger function that doesn't pin search_path.
-- 'public, pg_temp' is the conservative fix: schema-qualified references
-- inside the function body still resolve, and pg_temp is appended last so
-- a malicious user can't shadow built-ins via a temp object.

ALTER FUNCTION public.touch_updated_at()              SET search_path = public, pg_temp;
ALTER FUNCTION public.deck_gallery_touch_updated_at() SET search_path = public, pg_temp;

COMMIT;

-- ─── Verification ─────────────────────────────────────────────────────────
-- After running, confirm each fix:
--
--   SELECT relname, relrowsecurity
--     FROM pg_class
--     WHERE relname IN ('geo_cache','value_props');
--   -- Expect: relrowsecurity = true for both rows.
--
--   SELECT proname, proconfig
--     FROM pg_proc
--     WHERE proname IN ('touch_updated_at','deck_gallery_touch_updated_at');
--   -- Expect: proconfig contains 'search_path=public, pg_temp' for both.
