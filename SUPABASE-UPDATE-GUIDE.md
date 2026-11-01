# NOOLTHARI Supabase source and update guide

This project ZIP contains the complete Supabase source under `supabase/`:

- `supabase/master.sql` — original first-time database setup script.
- `supabase/migrations/20261031_security_integrity_and_contact.sql` — security/contact/return/payment-reservation migration already present in the original upload.
- `supabase/migrations/20261101_v2_wishlist_admin_audit.sql` — additive V2 migration for wishlist, admin activity logging, contact rate limiting, notification queue, guest-cart import and protected product reads.
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
