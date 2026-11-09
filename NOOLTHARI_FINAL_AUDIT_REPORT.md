# NOOLTHARI 2.4.0 — final static audit

**Release date:** 9 November 2026
**Project:** existing NOOLTHARI static storefront + Supabase + Razorpay + Vercel
**Supabase project:** `moptzrldmubkfteemyql`
**GitHub repository:** `m6curly/noolthari` (`main`)

## Delivered changes

- Admin home-banner input accepts 4–12 campaign photos and builds one optimised 2400×1350 (16:9) JPEG collage in the browser. Incomplete rows are centred, the preview matches the live aspect ratio, and the old live banner is retained unless the upload and settings update both succeed.
- Banner images are decoded, drawn and released one at a time to limit memory usage on iPhone, Android and tablet browsers.
- Homepage hero is a responsive 16:9 frame so the collage is not aggressively cropped on phones.
- Product edit preserves the saved description unless the admin edits the description field.
- Product cards and product details display an accessible, premium “Currently unavailable” state for zero stock; purchase controls remain disabled.
- Homepage metadata and JSON-LD identify NOOLTHARI as an `OnlineStore`, with the official Instagram URL `https://www.instagram.com/noolthari/` and the existing NOOLTHARI YouTube profile.
- Admin email outbox/triggers cover signup, new order, order status, payment status, shipment status, new return, return status and contact enquiry. The new Edge Function sends these alerts to `noolthari6@gmail.com` through the existing Resend sender configuration.
- Finance's Add Investment form remains removed; expense entry and the existing ledger remain. No financial rows are deleted.
- Existing `admin_products` view and safe `products` grants/RLS are repaired by the master SQL. The view exposes protected product details to Admin only.
- Existing Razorpay payment/order Edge Functions, customer notification worker, checkout code, Supabase URL/config, Vercel project metadata and domain settings are retained.

## Static verification results

| Check | Result |
|---|---:|
| HTML pages | 30 checked |
| JavaScript files | 31 syntax-checked |
| TypeScript Edge Function syntax | 0 transpilation diagnostics |
| CSS files parsed with tinycss2 | 6 files, 0 syntax errors |
| Banner collage layouts (4–12 photos) | All within 16:9 canvas; no tile overlaps |
| Trailing whitespace in release text/source files | 0 lines |
| Homepage JSON-LD | Valid JSON; 2 graph nodes |
| Missing uniform CSS links | 0 |
| Duplicate HTML IDs | 0 |
| Local HTML references | Passed |
| Secret-pattern scan | Passed |
| Feature-contract preflight | Passed |
| Existing-project SQL destructive-statement scan | Passed: no table drops, truncates or deletes of business/customer rows |

`npm.cmd run check` completed with `NOOLTHARI pre-deploy check PASSED`.

## What has not been live-tested

This audit is static. It does not claim a real Supabase login, live storage upload, Resend email, Razorpay capture/refund, Vercel production deployment, or physical-device test has passed. Those require the SQL and Edge Function to be applied/deployed in the user's accounts and then a controlled test order/signup/return/banner update.

## Data safety

`supabase/NOOLTHARI_LATEST_MASTER_UPDATE.sql` does not reset, truncate or delete product rows, images, orders, payments, customer/Auth records, purchases, expenses, stock movements, returns or ledger rows. It replaces the `admin_products` view definition, restores least-privilege product grants/RLS, ensures banner settings and the storage bucket/policies exist, and adds the private admin email queue and event triggers.

The new email pipeline is not active merely because the SQL exists. Deploy `send-admin-notifications`, configure the Resend secrets and admin recipient, store the matching cron secret in Vault, then enable/schedule the worker as described in `NOOLTHARI_RELEASE_UPDATE_GUIDE.md`.
