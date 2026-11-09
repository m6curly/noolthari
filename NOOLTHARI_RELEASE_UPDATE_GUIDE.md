# NOOLTHARI release update — banner, SEO, notifications and admin polish

This release is designed for the **existing** Supabase project and existing Vercel project.
It is additive: it does not reset or truncate product, order, customer, payment, purchase,
expense, stock, return or finance data.

## What changed

- Home banner accepts **4–12 photos**, creates a premium 16:9 collage locally in the browser with one-at-a-time photo decoding (lower memory use on mobile devices), previews it, and uploads one optimised JPEG to the existing `store-assets` bucket. Incomplete mosaic rows are centred, including 10- and 11-photo layouts.
- The previously published banner remains active until the new collage upload and
  `store_settings` update both succeed.
- Product cards and product details show a refined, accessible “Currently unavailable”
  treatment when stock is zero.
- Existing product descriptions are preserved on edit unless the admin actually edits the
  description field. The Admin Products view is refreshed to expose the description to
  admins only.
- Homepage JSON-LD identifies NOOLTHARI as an online store and connects its official
  Instagram `@noolthari` and YouTube profile. The wrong/stale social handle is not used.
- Finance no longer shows the Add Investment form or capital-entry controls. Expense
  recording and the historical ledger are retained. No historical capital/ledger rows are
  deleted.
- Admin email alerts are added for new signups, new orders, order status changes, new return
  requests, return status changes and contact messages. They go to `noolthari6@gmail.com`.

## 1. Existing Supabase project — run one SQL file

Use only:

`supabase/NOOLTHARI_LATEST_MASTER_UPDATE.sql`

Supabase Dashboard → SQL Editor → New Query → paste the complete file → Run once.

It does **not** drop or truncate business tables or delete existing product/order/customer rows. It refreshes the protected `admin_products` view and product table grants/RLS policy (the direct cause of the Admin Products permission issue), ensures the banner settings/bucket policies are present, and creates the private admin email queue and triggers.

The SQL ends with a four-column readiness result. Expected values are all `true`:

- `admin_products_view_ready`
- `banner_settings_ready`
- `admin_email_queue_ready`
- `email_claim_function_ready`

Do not run `supabase/master.sql` against the existing populated project. That file is for
a new/empty Supabase project.

## 2. Enable automatic emails

The SQL creates the secure queue, but email is delivered by the Edge Function. Delivery is
not automatic until the function, Resend secrets and one-minute schedule are configured.

### A. Check existing Resend secrets

In Supabase → Project Settings → Edge Functions → Secrets, check whether these already exist:

- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`
- `NOTIFICATION_CRON_SECRET`

The existing customer notification function already uses these names. Keep existing
working values; do not rotate or replace them unnecessarily.

`NOTIFICATION_FROM_EMAIL` must be a sender address on a domain verified in Resend
(for example, a verified `notifications@...` address). A Gmail address generally cannot
be used as the verified sender for your own domain.

Set the recipient:

```powershell
supabase secrets set ADMIN_NOTIFICATION_TO="noolthari6@gmail.com" --project-ref moptzrldmubkfteemyql
```

If `NOTIFICATION_CRON_SECRET` does not exist yet, generate one locally and keep it private:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as an Edge Function secret (do not paste it into GitHub or chat):

```powershell
supabase secrets set NOTIFICATION_CRON_SECRET="PASTE_YOUR_GENERATED_SECRET" --project-ref moptzrldmubkfteemyql
```

### B. Store the cron values in Supabase Vault

In Supabase → Database → Vault, create these two secrets if they do not already exist:

| Secret name | Secret value |
|---|---|
| `noolthari_supabase_url` | `https://moptzrldmubkfteemyql.supabase.co` |
| `noolthari_notification_cron_secret` | The exact same value as Edge Function secret `NOTIFICATION_CRON_SECRET` |

Do not create duplicate names. If a name already exists, update the existing Vault secret instead.

The master SQL tries to enable `pg_cron` and `pg_net` and schedules the Edge Function every minute if those extensions and both Vault secrets are ready. If the SQL reports that scheduling was skipped, enable `pg_cron` and `pg_net` in Supabase → Database → Extensions, confirm the two Vault entries, and rerun this same idempotent master update SQL. Rerunning it does not reset business data.

### C. Deploy the admin notification Edge Function

From the project folder:

```powershell
supabase functions deploy send-admin-notifications --project-ref moptzrldmubkfteemyql
```

The function uses the existing Resend sender and sends only to `noolthari6@gmail.com`.
The queue records retries and deduplicates repeated events.

**Events covered:** new signup; newly created order; order status changes; payment status changes
(authorized, captured, failed and refunds); shipment status changes; new return request; return
status changes; new contact enquiry. Existing customer order-status emails are not replaced by
this separate owner-alert pipeline.

## 3. Local project update and deployment

1. Download and extract the release ZIP over your existing `D:\noolthari` folder.
2. Do **not** delete the existing `.git` or `.vercel` folders.
3. Run:

```powershell
cd D:\noolthari
npm.cmd run check
```

4. If it passes, commit/push the modified files using your existing GitHub workflow:

```powershell
git add .
git diff --cached --check
git commit -m "Improve banner collage, SEO and NOOLTHARI admin workflows"
git push origin main
```

5. Vercel should automatically deploy the connected `main` branch to the existing Production
   project. Check that the latest deployment is `Ready` and that `www.noolthari.com` remains
   assigned. No DNS changes are required.

6. Deploy the new Edge Function using section 2C. If you also changed the Edge Function
   config, the project config in this ZIP already sets `verify_jwt = false` for this endpoint;
   the function itself checks the private `x-cron-secret` header.

## 4. Google Search / Instagram identity

The homepage includes Organization/OnlineStore and WebSite JSON-LD with:

- `name`: NOOLTHARI
- `alternateName`: NOOLTHARI™
- canonical website URL
- correct logo and hero image URLs
- official `sameAs` links for `https://www.instagram.com/noolthari/` and the NOOLTHARI YouTube channel

After deployment:
1. Open Google Search Console for `https://www.noolthari.com/`.
2. Inspect the homepage URL and request indexing.
3. Submit or resubmit `https://www.noolthari.com/sitemap.xml`.
4. Use the Rich Results Test / Schema Markup Validator to verify the live JSON-LD.

Google decides when to recrawl and how to display brand/social information; structured data
helps disambiguate the official profile but cannot force an immediate search-result change.

## 5. Verification boundaries

`npm.cmd run check` is a static preflight (HTML references, JS syntax, JSON config, CSS and
feature contracts). It cannot simulate a real Supabase login, Resend delivery, Razorpay
capture, every viewport or physical iPhone/Android device. Before treating the release as
fully verified, test a draft banner collage, an existing product edit without touching its
description, an out-of-stock product, an order, a return request and a new test signup.
