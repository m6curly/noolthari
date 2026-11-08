# NOOLTHARI final product/admin correction

## What changed
- Admin Products list now reads protected fields from `public.admin_products`, not directly from `public.products`.
- Product table grants are split: the public site reads store-safe columns; authenticated writes are guarded by the `products_admin` RLS policy.
- Fabric, Pattern / border and Occasion are removed from the product form, catalogue filters, product-detail specs, browser queries and the current database schema.
- Product photos receive repeated, centred, low-opacity grey `NOOLTHARI™` marks before upload. The source is not upscaled and is resized only when its longest edge exceeds 3000 px; JPEG output quality is 95%.
- The Finance screen now contains only investment, expense, summary and ledger sections. The three stock/vendor-payment/Razorpay-payout forms and their UI handlers are removed.
- New stock for an existing saree can be recorded from that saree's Edit Product page using the existing `admin_receive_stock` RPC. Initial stock/vendor purchase is still recorded while adding a product.
- A single last-loaded responsive CSS layer sets Poppins consistently across public, customer and admin screens, including number/stat text, and normalises form/table sizes for desktop, tablet and mobile.

## Existing Supabase project – run once
1. Open the existing Supabase project SQL Editor.
2. Paste and run `NOOLTHARI_SUPABASE_PRODUCT_PERMISSION_FIX.sql`.
3. It is re-runnable and does not reset business records or customer accounts. It removes the retired product fields (including Fabric, Pattern / border, Occasion, Offer Price, Saree Length, Blouse Length and Care Instructions) and rebuilds the Admin-only view/grants. It does not reset product/order/customer/finance rows.
4. Do not run `supabase/master.sql` against the existing live project. That file is a full fresh-project bootstrap.

## Local website update
1. Back up the current `D:\noolthari` folder.
2. Extract the updated ZIP over `D:\noolthari`, replacing files. Keep `.env` and local-only secrets untouched if present.
3. Run `npm.cmd run check`.
4. Run `npm.cmd run update` and use `https://github.com/m6curly/noolthari.git` when prompted.
5. Confirm GitHub push succeeds. Vercel should automatically deploy from `main`. If it does not, run `npm.cmd run deploy` from the project folder.

## Important test limitation
Static checks cover HTML references, duplicate IDs and JavaScript syntax. A real customer/admin login, photo upload, order checkout and Razorpay capture still require testing in the live browser because these depend on the actual Supabase session, storage permissions, Edge Function secrets and Razorpay account.
