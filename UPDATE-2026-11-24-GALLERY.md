NOOLTHARI update 2026-11-24

Changes:
- Added admin gallery manager at admin/gallery.html.
- Homepage carousel uses active store_gallery photos and rotates every five seconds.
- Gallery uploads use existing public product-images bucket.
- Product cards: remove in-image out-of-stock label; image is softly dimmed and existing below-image stock status remains.
- Existing product editor has guarded description preservation logic; retained and verified during source review.

Before deployment: run supabase/20261124_home_gallery.sql in Supabase SQL Editor.
