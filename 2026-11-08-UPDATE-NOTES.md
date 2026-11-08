# NOOLTHARI™ — 8 November 2026 update notes

## Admin structure and consistent design
- Unified typography, responsive spacing, forms, buttons and larger base text across all 30 HTML pages. Uses Poppins for body text and Cormorant Garamond for headings.
- Dashboard focuses on products, orders, customers and returns, recent orders and the editable home banner.
- Removed Activity and its front-end logic/database audit feature. Removed the separate Categories admin page; categories are created inside the Product form.
- Removed duplicate Add product/Add saree entry points. Products has one add button and a shared add/edit form.
- Finance is one page only; the former duplicate account/transaction and legacy P&L functions are dropped by the new migration.

## Product and images
- Product editor removes Saree length, Blouse piece length, Care instructions and Offer price.
- Added optional vendor selection and inline Add vendor, plus inline Add category.
- Opening stock is recorded as a supplier purchase with quantity, unit cost, amount paid now, payment account and vendor due.
- Purchase price and reserved quantity remain protected from customer queries.
- Product photos are orientation-corrected where supported and watermarked once with a subtle NOOLTHARI™ mark (22% opacity). Preview, file size and maximum-photo checks remain.

## Orders, customers and storefront
- One order record supports online, offline, Instagram, WhatsApp, gifts and collaborations.
- Manual sale records buyer details even when the buyer has no NOOLTHARI login; optional account linking remains available.
- Stock is deducted for each manual sale/gift/collaboration. Free gifts have zero revenue but their cost remains in COGS.
- Manual unpaid sales remain receivables until the admin records money actually received.
- Customers/admin can remove only cancelled failed orders without captured/authorised payment. Payment records with captured/authorised state are protected.
- Wishlist table/RLS is included in the new migration.
- Admin can replace the home banner from Dashboard without editing source files.

## Finance and accounting logic
- Single ledger for owner capital, paid stock purchases, vendor payments, expenses, sale receipts, refunds, Razorpay settlement transfers and gateway fees.
- Displays period P&L estimate and lifetime cash/bank/UPI/other balances, Razorpay unsettled funds, inventory value, vendor due and customer due.
- Uses weighted-average inventory cost. Stock purchase is inventory, not immediate loss; COGS is counted as units are sold or gifted.
- Razorpay settlement must balance as bank credit + fee = gross and cannot exceed recorded unsettled balance.

## Required database work
- Existing project: apply any missing prior migrations, then `supabase/migrations/20261108_business_workflow_reset.sql` once after backup.
- Only when ready to clear business records: run `supabase/reset_business_data.sql` separately. It preserves Auth users and all profile/customer accounts, but clears products/sales/expenses/inventory etc.
- Never run `supabase/master.sql` on the existing live project.
- After upgrade, deploy the changed `razorpay-webhook` Edge Function. Keep existing Razorpay key IDs/secrets and webhook URL/events.

## Verification boundary
`npm run check` passes: 30 HTML pages and 31 JavaScript files checked for syntax, local references, titles, viewport tags, duplicate IDs, JSON config and secret-pattern issues. This is a static preflight only. The SQL was reviewed but not executed in the owner's Supabase project; no live Razorpay transaction/webhook, production Vercel deployment or physical PC/tablet/iPhone/Android device test is claimed.
