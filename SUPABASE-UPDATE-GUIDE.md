# NOOLTHARI — Supabase upgrade and clean-start guide

This guide is for the existing live project connected in `js/config.js`. It is deliberately split into an **upgrade** and a separate optional **business-data reset**. Do not combine them into one step.

## 1. Back up first

In Supabase Dashboard, open the existing NOOLTHARI project and take a database backup. Keep a copy of the current website folder and current ZIP as well. Do not change the project URL, anon/publishable key, service keys or Vercel domain.

The existing project reference in the supplied config is `moptzrldmubkfteemyql`. Confirm that the Supabase Dashboard you open is the same project before running SQL.

## 2. Upgrade the existing database

Open **Supabase → SQL Editor**. Apply only migrations that are missing from your existing project, in this order:

1. `supabase/migrations/20261031_security_integrity_and_contact.sql`
2. `supabase/migrations/20261101_v2_wishlist_admin_audit.sql`
3. `supabase/migrations/20261108_product_instagram_and_fulfilment.sql`
4. `supabase/migrations/20261108_business_workflow_reset.sql` **(new migration for this package)**

The first three are already part of the earlier project setup. Check your existing database before running them; never re-run a migration that has already been applied merely because its file is present. The newest business-workflow migration should be run once after the earlier schema is present. It creates/updates wishlist, vendor/product linkage, a combined customer directory (registered accounts plus offline/Instagram buyers), the single business ledger, banner settings, manual-sale functions, failed-order cleanup protections and the new finance summary. It drops the unused Activity log machinery and obsolete finance tables/functions. It removes the unused product fields `saree_length`, `blouse_length`, `care_instructions` and `sale_price`.

**Do not run `supabase/master.sql` on this live database.** The master file is an all-in-one baseline for a completely new Supabase project. It is not a production upgrade script.

After the SQL completes, check that these objects exist:

- `public.wishlist_items`
- `public.business_ledger_entries`
- `public.vendor_purchase_payments`
- `public.store_settings`
- `public.admin_products` and `public.admin_customer_directory` admin-only views
- RPCs `admin_receive_stock`, `admin_record_manual_sale`, `admin_business_summary`, `delete_own_failed_order`, `admin_delete_failed_order`

Check that your owner account is still an admin (read-only verification):

```sql
select email, role
from public.profiles
where lower(email) = lower('noolthari6@gmail.com');
```

The expected role is `admin`. The migration does not change or delete Auth users or profile roles.

## 3. Optional: start the business records from zero

Only do this after step 2, after you have a backup, and when you are ready to remove existing business/catalogue records. Open `supabase/reset_business_data.sql` in SQL Editor and run it once.

It clears products, product-image metadata, categories, vendors, stock movements, purchase records, orders, order items, payment/shipments, returns/refunds, wishlist entries, cart line items, notifications, guest-cart import history, expenses, financial ledger and contact enquiries.

It deliberately **preserves**:

- Supabase Auth accounts in `auth.users`.
- `public.profiles`, including `noolthari6@gmail.com` and every customer profile.
- Saved customer addresses and cart containers (their cart contents are cleared).
- `store_settings`, so the current home-page banner setting is retained.

### Remove old product image files too

The reset SQL deletes product/return image database rows, but Storage files should be removed through the Storage service rather than deleting `storage.objects` rows directly. After the reset, open **Supabase → Storage** and delete the contents of `product-images` and, if you want all old return photos gone, `return-evidence`. Keep `store-assets` so the banner is retained. Do not delete the buckets themselves.

## 4. Storage and browser configuration

The migration creates or updates the public `store-assets` bucket for the admin-managed banner. Existing buckets used by the store are `product-images` (public product photos) and `return-evidence` (private return evidence).

Keep `js/config.js` unchanged for the existing Supabase URL, public publishable/anon key and Razorpay Key ID. The browser must never contain `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or a Supabase service/secret key.

## 5. Edge Function update for Razorpay

The payment creation and signature-verification functions are retained. This package changes only the webhook's failure-state guard, so deploy the updated `razorpay-webhook` function to the same Supabase project. With Supabase CLI already available and linked, run:

```bash
supabase functions deploy razorpay-webhook --project-ref moptzrldmubkfteemyql
```

Do not rotate or replace your live Razorpay keys for this website update. Keep the existing Supabase Function secrets and confirm they are present:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `ALLOWED_ORIGINS` — comma-separated exact HTTPS origins for the live site and any required preview site
- Supabase server secret (`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`)
- `CRON_SECRET` for the existing reservation-expiry function

In the Razorpay Dashboard, retain the current webhook URL:

`https://moptzrldmubkfteemyql.supabase.co/functions/v1/razorpay-webhook`

Keep the existing webhook secret and subscribed events `payment.captured`, `payment.failed` and `order.paid`. Do not create a second webhook or change the website's live Key ID. Test the payment flow in a controlled Test Mode/staging setup before accepting live orders; do not use a real order merely as a test.

## 6. What happens to Vercel and GitHub?

No database SQL is executed by Vercel. Apply the Supabase migration separately first. The website source keeps the current Vercel project link and domain configuration. Push the repaired files to the same GitHub repository/production branch; Vercel should deploy automatically if that repository is linked to the existing `noolthari` Vercel project. Alternatively run `npm run deploy` from this project folder after confirming Vercel CLI is logged in and the existing project link is selected.

Do not change DNS, custom domain settings, Vercel project name or the Supabase URL for this update.

## 7. Final checks after migration and deployment

1. Sign in with `noolthari6@gmail.com`; verify Admin access.
2. Sign in with an existing customer account; verify the account still exists.
3. Add a category and vendor inside Product → Add product.
4. Add a test saree and a watermarked product photo; check the public product page and wishlist.
5. Record a small manual sale in an offline/test workflow; check that the order appears in Admin Orders and stock reduces exactly once.
6. Record capital, a sample expense and an additional stock purchase; verify Finance balances and vendor due.
7. Use Razorpay Test Mode for a successful capture and a failed attempt; confirm captured payment cannot be deleted and a failed/cancelled order can be removed.
8. Change the banner from Dashboard and confirm the home page updates.

The ZIP passes static code checks, but the real Supabase SQL, Row Level Security, live Razorpay capture/webhook, Vercel production deployment and physical device testing still need to be completed against your own project.
