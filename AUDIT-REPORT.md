# NOOLTHARI™ — source audit and verification report

**Scope:** the supplied website ZIP, including storefront pages, admin pages, JavaScript, CSS, Supabase SQL/migrations, Storage policies and Razorpay Edge Function source. The working copy retains the existing Supabase and Vercel project configuration. No production deployment or live database modification was performed during this edit.

## Changes made

### Storefront and responsive design
- Added `css/unified.css` to all 30 HTML pages to standardise typography, line-height, field sizing, button sizes, administrative spacing and mobile layouts.
- Poppins is used for body/interface text and Cormorant Garamond for headings. Base text and interactive controls were increased for readability.
- Kept the existing visual identity, page routes, storefront structure and local assets.

### Admin
- Removed the standalone Activity and Categories pages and the corresponding browser scripts.
- The migration drops the old admin activity log table and trigger function/feature.
- Categories are still stored as catalogue data, but new categories are created inside the product form. The category selector remains required.
- Kept one Products page/add button and one shared add/edit form.
- Kept Orders, Customers, Returns, Messages, Finance, dashboard/store view, account and sign out.
- Dashboard has a single current banner editor backed by `store_settings` and the `store-assets` bucket.

### Product management
- Removed `saree_length`, `blouse_length`, `care_instructions` and `sale_price` from the active product editor and the latest database schema.
- Added vendor selection and inline vendor creation. Product purchase cost remains private.
- Opening stock creates a purchase, purchase item, vendor payment if paid, stock movement and ledger outflow. Partial payment leaves an explicit vendor due.
- Replenishment is recorded from Finance rather than overwriting product stock in the editor.
- Preserved watermark processing: EXIF-aware orientation where supported, one subtle watermark at 22% opacity, preview, file validation, image limits and upload error handling.

### Orders and payment safety
- Online and manually recorded sales share `orders` and `order_items` with a unique order number and linked shipment.
- Manual orders store customer name/phone/email snapshots; linking a registered customer account is optional.
- Customers now combines registered profiles and no-login manual buyers in one admin directory, with order count, paid order value and last activity.
- Manual channels include offline, Instagram, WhatsApp, gift and collaboration. Gifts/collabs can be recorded at ₹0 while stock and cost are accounted for.
- Manual unpaid sales are receivables until the admin records actual payment.
- Customer/admin deletion RPCs are restricted to cancelled orders with no authorised/captured payment and no refund record.
- Failed/unpaid reservation expiry excludes authorised/captured payments. Checkout failure does not clear the customer's cart.
- Razorpay payment creation and verification source remains in place. The webhook failure handler is guarded from downgrading authorised/captured payments.

### Finance
- Added the single `business_ledger_entries` register and `vendor_purchase_payments` table.
- Capital, purchase payments, expenses, paid order receipts, refunds, gateway fees and Razorpay settlement transfers have ledger entries.
- Finance shows selected-period P&L estimate and lifetime account balances, unsettled Razorpay funds, stock inventory value, vendor dues and customer receivables.
- Inventory cost uses a weighted-average purchase cost and becomes COGS when a saree is sold or gifted. Capital is not revenue. Stock purchase is not an immediate expense.
- Settlement entry requires gross = actual bank credit + fee and checks the available unsettled Razorpay balance.

## Static verification performed

Command:

```bash
npm run check
```

Result: **PASSED**

- 30 HTML pages scanned.
- 31 JavaScript files passed Node syntax checks.
- Local HTML links/assets checked.
- Page titles and viewport meta tags checked.
- Duplicate HTML IDs checked.
- JSON configuration parsed.
- Secret-pattern scan passed.

## Not verified in this environment

- SQL migration execution against the owner's actual Supabase database, existing table variants, constraints and RLS policies.
- Live Supabase Auth/admin permissions and real customer wishlist/session flows.
- Real Razorpay Test/Live payment capture, retry, webhook delivery, settlement/refund or bank payout.
- Actual Vercel production deployment, custom-domain DNS/HTTPS and live caching.
- Physical browser tests on the owner's PC, iPhone/iPad, Android phone/tablet. Chromium headless could not be launched reliably in the available execution environment, so no visual screenshot/device test is claimed.

## Important operational caveats

- Back up Supabase before applying the new migration or optional clean-start SQL.
- Never run `supabase/master.sql` on the existing live project. Use it only for a brand-new project.
- `supabase/reset_business_data.sql` is destructive to business/catalogue data but preserves `auth.users` and `public.profiles`; run only after upgrade and backup.
- Storage files are deleted through Supabase Storage UI/API, not by deleting `storage.objects` rows in SQL. Keep the `store-assets` bucket to preserve the banner.
- Finance is a manually maintained management ledger, not a bank connector, accounting audit, GST return or tax filing. Record all off-platform sales, cash movements, expenses and settlements accurately and consult an accountant for tax treatment.
