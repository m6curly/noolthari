# NOOLTHARI Supabase source and update guide

This project ZIP contains the complete Supabase source under `supabase/`:

- `supabase/master.sql` — original first-time database setup script.
- `supabase/migrations/20261031_security_integrity_and_contact.sql` — security/contact/return/payment-reservation migration already present in the original upload.
- `supabase/migrations/20261101_v2_wishlist_admin_audit.sql` — additive V2 migration for wishlist, admin activity logging, contact rate limiting, notification queue, guest-cart import and protected product reads.
- `supabase/migrations/20261108_product_instagram_and_fulfilment.sql` — additive product Instagram-link column and protected admin fulfilment update function.
- `supabase/functions/` — the existing Razorpay/payment functions plus `send-order-notifications/index.ts`.
- `supabase/config.toml` — keeps the existing Supabase project reference and function settings; V2 adds the notification function configuration.

## Important: the latest V2.1 visual update needs no database migration

The V2.1 changes to the storefront header, footer, navigation icons, responsive layouts and Collection filters do not change database tables or RPCs. Colour and Occasion were removed only as visible filter controls; their product data columns are preserved.

## Before applying any database SQL

1. Make a Supabase database backup.
2. Open the Supabase Dashboard and check whether each migration has already been applied.
3. Apply only missing migrations, in chronological order. Do not run a migration a second time just because it is present in the ZIP.
4. Do not run `supabase/master.sql` against an existing live store. It is the baseline setup script for a new database, not an update script.
5. Test on a staging project before applying changes to production.

### Migration order

1. `20261031_security_integrity_and_contact.sql` — also supplied in the original ZIP; only apply if it has not already been installed.
2. `20261101_v2_wishlist_admin_audit.sql` — introduced with V2; apply once if the wishlist/admin audit/notification features are to be enabled and this migration is not already installed.
3. `20261108_product_instagram_and_fulfilment.sql` — adds the optional product Instagram URL, public-safe column grant and one-way admin fulfilment status RPC. Apply to the current live project before deploying the new frontend.

These are database changes, not automatic file-copy operations. Uploading the ZIP to Vercel does not run SQL migrations.

## Notification email function (optional)

`send-order-notifications` is additional source. It needs a verified sender in Resend and server-side Supabase Function secrets. The function reads:

- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`
- `NOTIFICATION_CRON_SECRET`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (provided by the Supabase Functions environment; never put the service key in browser JavaScript)

Example for the three Resend/cron secrets, using your own values in a secure terminal:

```bash
supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY NOTIFICATION_FROM_EMAIL=YOUR_VERIFIED_SENDER NOTIFICATION_CRON_SECRET=YOUR_LONG_RANDOM_SECRET
```

Deploy the function only after the secrets are configured and the notification migration exists:

```bash
supabase functions deploy send-order-notifications
```

A trusted scheduled caller must invoke the function using the configured cron secret and valid Supabase function authorization. Scheduling is not created by this website ZIP. Until a scheduler and sender are configured, queued emails will not be delivered; the storefront and payment functions do not depend on those emails being sent.

## Existing project connection

- `js/config.js` is unchanged from the uploaded project.
- `js/supabase.js` is unchanged.
- `.vercel/project.json` is unchanged.
- Existing HTML page names, asset paths and current Supabase function paths are retained.
- The V2.1 UI refinement itself adds no database requirement.

Never copy a Supabase service-role/secret key into `js/config.js`, HTML, CSS or any public file. The browser may use only the project's public anon/publishable key.

## 2026-11-08 product Instagram link and fulfilment safety update

The latest admin/store refinement adds one optional `products.instagram_url` field. The product editor stores a direct HTTPS Instagram Reel/video link; the customer product page displays a small “Watch on Instagram” link only when that field is present. The field is included in the public product-column allow-list, while `purchase_price` and `reserved_quantity` remain restricted to the protected `admin_products` view.

The update also tightens `admin_set_order_status`: the admin can move an already-paid order forward through `confirmed`, `processing`, `shipped`, `out_for_delivery`, and `delivered`. The browser cannot use this workflow to manually set an order to `paid`, `refunded`, `cancelled`, or move a fulfilment stage backwards. Razorpay's verified payment functions continue to control payment capture and paid-order stock deduction.

### Apply on the existing live Supabase project

1. Take a fresh Supabase backup first.
2. Open **Supabase Dashboard → SQL Editor** for the same project currently connected to the website.
3. Open `supabase/migrations/20261108_product_instagram_and_fulfilment.sql` from this ZIP, copy the complete SQL and run it once.
4. Confirm the query completes successfully. In Table Editor, check that `products.instagram_url` exists. In SQL Editor you can also check:

   ```sql
   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'products'
     and column_name = 'instagram_url';
   ```

5. Do **not** run `supabase/master.sql` on the live store. Do not drop/recreate tables, reset the project, or delete existing products/users. The new migration is additive and preserves existing records.
6. Keep the existing Supabase URL and public browser key in `js/config.js`. This update does not require changing the Supabase project URL or rotating keys.

The migration updates the `admin_products` view and the safe public column grants. Without it, the updated product editor/customer product page will receive a missing-column or permission error for `instagram_url`.

### Payment and finance behaviour

No Razorpay payment Edge Function was replaced by this UI update. The existing order-creation, signature-verification/webhook and paid-order finalisation functions remain the authoritative payment path. A verified payment finalises the order and decrements stock through the existing database function; the admin then advances delivery status in the Orders screen.

The Dashboard labels the paid-order total as **Paid order value**, not bank cash. Razorpay settlements/payouts, fees, refunds and bank credits must be reconciled with the Razorpay dashboard and bank statement; this site cannot force a Razorpay payout to the bank merely by updating a database number. Refund state must reflect the actual refund in Razorpay; do not manually mark an order refunded in the fulfilment dropdown.

### First-time database only

For a genuinely new, empty Supabase project, use the baseline setup and all required migrations in chronological order. The `master.sql` baseline has also been updated with the Instagram column, public read grant and restricted fulfilment RPC. Never use the baseline as a production update script for an existing store.
