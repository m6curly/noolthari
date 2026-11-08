# NOOLTHARI Final UI and Admin Fixes — 8 November 2026

## Included
- Admin product list reads protected product data through the admin-only `public.admin_products` view.
- The live-project SQL patch rebuilds the view and grants admin writes through RLS without granting customers private purchase-cost or vendor fields.
- Removed Fabric, Pattern / border, Occasion, Offer Price, Saree Length, Blouse Length and Care Instructions from the product model/UI and public storefront query fields.
- A single Poppins typography system, consistent numeric lining/tabular figures, larger readable controls, and responsive admin/storefront CSS for desktop, tablets and phones.
- Repeated centered, low-contrast grey `NOOLTHARI™` watermark tiles on every product image uploaded through the admin uploader.
- Finance page now contains only investment/capital, business expenses, P&L, balance summary and the unified transaction ledger. The three requested entry panels and their JavaScript handlers are removed.
- Vendor and first-stock purchase are recorded from Add Product. Further stock receipts are available within that product's Edit page, not Finance.
- Corrected product editing so the regular selling price can be updated.

## Existing Supabase project
Run `NOOLTHARI_SUPABASE_PRODUCT_PERMISSION_FIX.sql` once in the existing project's SQL Editor. It is re-runnable and does not reset customers, orders, products or finance rows. It drops only obsolete product fields and rebuilds the admin product view.

## Fresh Supabase project
`supabase/master.sql` is the complete fresh-project bootstrap. Do not run it over the existing live project.

## Validation
The static preflight checks HTML references, page titles, viewport tags, duplicate IDs, JavaScript syntax, configuration, secret patterns, all-page stylesheet inclusion, admin products data path, removed product fields and removed Finance forms. A live login/payment test and physical-device browser test must still be performed against the actual Supabase/Razorpay accounts.
