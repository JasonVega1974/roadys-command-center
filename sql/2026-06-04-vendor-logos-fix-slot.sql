-- 2026-06-04 - Fix vendor-logo slot_key collision (Entegra hijacking cover page)
--
-- Bug: the previous vendor-logo upsert (2026-06-04-vendor-logos.sql) inserted
-- every vendor card with slot_key = 'logo'. brLogoSrc() at gs-command-center
-- line 9803 calls gallerySrc({ slot: 'logo' }) to fetch the ROADY'S LOGO that
-- renders on every Business Review page header + cover slide. Because
-- galleryLoad orders rows by updated_at DESC, the most recently inserted
-- vendor row (Entegra) won every lookup and started showing up as the
-- Roady's logo everywhere.
--
-- Two-part fix:
--   1. DELETE the Entegra row entirely (user's explicit request: "reverse
--      all entegra logos you put").
--   2. Set slot_key = NULL on the remaining 6 vendor logos so they only
--      match via vendor_id (Slide 10) and never via the generic 'logo' slot.
--      Without this, deleting Entegra just promotes Coca-Cola or Farmer
--      Brothers into the same bug.
--
-- Idempotent. After this runs, brLogoSrc() falls back to its next option
-- (per-deck override > shared gallery > brLoadGlobal > assets/roadys-logo.png).
-- Slide 10 vendor cards still match by vendor_id and render the 6 remaining
-- logos correctly.

BEGIN;

-- 1. Drop the Entegra row entirely
DELETE FROM public.deck_gallery
 WHERE id = 'g_vendor_V00040_logo'
    OR vendor_id = 'V00040';

-- 2. Null out the generic 'logo' slot_key on the other vendor cards so
--    they only resolve via the vendor_id path.
UPDATE public.deck_gallery
   SET slot_key   = NULL,
       updated_at = now()
 WHERE vendor_id IN ('V00002','V00005','V00010','V00022','V00033','V00036')
   AND slot_key = 'logo';

COMMIT;

-- Verify Entegra is gone:
--   SELECT * FROM public.deck_gallery WHERE vendor_id = 'V00040';
--   -- Expect: 0 rows.
--
-- Verify the other six no longer collide with the generic 'logo' slot:
--   SELECT id, label, vendor_id, slot_key
--     FROM public.deck_gallery
--    WHERE vendor_id IN ('V00002','V00005','V00010','V00022','V00033','V00036')
--    ORDER BY vendor_id;
--   -- Expect: 6 rows, every slot_key = NULL.
--
-- Verify nothing in deck_gallery still claims slot_key = 'logo' unintentionally:
--   SELECT id, label, vendor_id FROM public.deck_gallery WHERE slot_key = 'logo';
--   -- Expect: 0 rows (unless you've manually uploaded a Roady's logo via the
--   --         Gallery UI, in which case its category='hero' and slot='logo'
--   --         and it SHOULD still match here -- check the label before
--   --         deleting).
