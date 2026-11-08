# NOOLTHARI™ — 8 November 2026 update notes

## Product admin
- Reorganised the product add/edit screen into photos, product information, pricing/stock and store settings.
- Added an optional Instagram Reel/video URL with HTTPS/host validation.
- Added care instructions, automatic SKU generation when blank and a live estimated gross-margin preview.
- Kept purchase price and reserved stock behind the protected admin product view; the customer product query does not request purchase price.
- Product page shows the Instagram link only when supplied and includes care instructions only when supplied.

## Product photos
- Correctly decodes image orientation where supported before drawing the watermark.
- Adds one restrained `NOOLTHARI™` watermark at 22% opacity, using light/dark contrast based on the image area.
- Shows a watermarked preview, caps each photo at 15 MB and each product at eight photos, and reports upload failures so the admin can retry.
- Existing image records are not removed by this update.

## Dashboard and order safety
- Dashboard includes quick links and recent orders, plus clear notes for finance figures.
- Paid order value is explicitly not represented as bank balance or Razorpay settlement.
- Admin fulfilment status moves forward only for verified paid orders. Payment capture remains with the existing Razorpay verify/webhook functions; the fulfilment screen cannot set `paid`, `cancelled` or `refunded`.

## Required Supabase migration
Before deploying this frontend, apply `supabase/migrations/20261108_product_instagram_and_fulfilment.sql` once in the current Supabase project after backup and after the earlier migrations have been applied. The migration adds one nullable column, adds a narrow public read grant, refreshes the protected `admin_products` view and tightens the fulfilment RPC. It does not drop/reset users, products, carts, orders, payments, stock or financial records.

Never run `supabase/master.sql` against the existing live database. It is for a brand-new empty project only.

## Unchanged integrations
- `js/config.js`, Supabase project URL/publishable key, Razorpay Key ID, Razorpay payment Edge Function sources, Supabase project reference and Vercel project metadata remain unchanged.
- No Razorpay payment/refund function is newly deployed or modified by this update.

## Verification boundary
`npm run check` passed after the changes. It checks static project structure, local references, JavaScript syntax, JSON configuration and secret patterns. The new SQL was reviewed but not executed on the owner's database. Live Supabase RLS, Razorpay transactions/webhooks, production Vercel deployment, and physical PC/Android/iPhone/tablet tests require owner credentials and devices and are not claimed as completed.
