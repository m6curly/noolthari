# NOOLTHARI™ — One-time Setup

## A. Supabase

**Choose exactly one path:**

- **Brand-new Supabase project:** back up nothing (there is no data yet), then run `supabase/master.sql` once.
- **Existing/live project with customers, orders or products:** first create a Supabase backup. Apply `20261031_security_integrity_and_contact.sql` if it has not already been applied, then apply `20261101_v2_wishlist_admin_audit.sql` and `20261108_product_instagram_and_fulfilment.sql` once each, in that order, if they are not already installed. Do not run the full master file on a live store.

1. Open Supabase → your project → **SQL Editor**.
2. For a new project, open `supabase/master.sql`. For an existing project, apply the dated migrations in order as described above; do not re-run a migration that is already recorded as applied.
3. Paste the selected SQL into one SQL Editor query and click **Run**.
4. Confirm that the query completes without an error.
5. Open **Authentication → Providers → Email**. Decide whether email confirmation is enabled.
6. Open **Storage**. For a new project, the master SQL creates:
   - `product-images` (public)
   - `return-evidence` (private)

## B. Browser configuration

Open `js/config.js` and replace:

```js
SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
SUPABASE_PUBLISHABLE_KEY: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
RAZORPAY_KEY_ID: 'rzp_test_...'
```

The browser must never contain a Supabase secret/service-role key or Razorpay Key Secret. The supplied `js/config.js` currently has a public live-mode Razorpay Key ID. For Test Mode, change it to your `rzp_test_...` Key ID and set the matching test `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Supabase Edge Function secrets. Never mix test and live credentials.

## C. Create the first admin

1. Open the website.
2. Choose **Sign up**.
3. Create the owner account.
4. Verify the email if Supabase requires verification.
5. In Supabase SQL Editor run:

```sql
update public.profiles
set role='admin'
where email='YOUR-ADMIN-EMAIL@example.com';
```

6. Return to the same **Sign in** page and log in. The site automatically routes admins to `/admin/` and customers to the storefront.

## D. Razorpay Test Mode

The live payment flow uses a server-side Razorpay order, Checkout, signature verification and webhooks. In Supabase Edge Functions set:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `ALLOWED_ORIGINS` — comma-separated exact HTTPS origins, for example `https://yourdomain.example,https://your-project.vercel.app`
- `CRON_SECRET` — long random secret for the expiry function; never expose it in frontend JavaScript

Deploy:

```bash
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook
supabase functions deploy expire-payment-reservations
supabase functions deploy send-order-notifications
```

The expiry function has JWT verification disabled only because scheduled HTTP callers do not use a customer JWT; it now requires the separate `CRON_SECRET` in `x-cron-secret` or `Authorization: Bearer ...`. Configure a trusted scheduler to call it periodically (for example every 5–10 minutes) and send that header. Example request (run from a trusted server/scheduler, not from browser JavaScript):

```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/functions/v1/expire-payment-reservations" \
  -H "x-cron-secret: $CRON_SECRET"
```

Never put this value in `js/config.js` or commit it to GitHub.

In Razorpay Test Mode, configure webhooks for:

- `payment.captured`
- `payment.failed`
- `order.paid`

After a successful capture, the system finalizes the order, decrements stock, records the payment and makes the order visible in the admin fulfilment queue.

## E. GitHub Pages

1. Create a GitHub repository.
2. Upload the entire project root.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**.
5. Select the `main` branch and `/` root.
6. Save.

Because the website uses relative links, it also works when GitHub gives the repository a `/repository-name/` path.

## F. Vercel

Import the project root in Vercel and deploy without a build command. The included `vercel.json` adds browser security headers and a Content Security Policy for Supabase/Razorpay. Set `ALLOWED_ORIGINS` to the exact storefront origins in Supabase Edge Function secrets after deployment. GitHub Pages hosts the files but does not apply these custom response headers; configure equivalent headers at another hosting/CDN layer if you choose GitHub Pages.

## G. Custom domain

After GitHub Pages gives the site an HTTPS address:

1. In GitHub Pages add your custom domain.
2. Add the DNS records GitHub shows you at your domain registrar.
3. In Supabase **Authentication → URL Configuration**, set the final site URL.
4. Add the password-reset redirect URL for `reset-password.html`.
5. In Razorpay, use the final HTTPS domain for the live checkout/webhook configuration.

## H. Normal business operation

Guest adds a saree → bag is retained locally → sign-in merges it through a stock-validating, idempotent RPC. Admin adds a saree → it appears on the shop automatically.

Customer signs in → adds saree → checks out → Razorpay payment → order is paid only after secure server verification → stock is reduced → admin sees order → admin updates processing/shipped/out-for-delivery/delivered → tracking is visible to customer → damage-only return request can be submitted after delivery → admin reviews → any refund must be processed and verified at Razorpay; the included admin screen does not issue or confirm the money refund.

Finance dashboard calculates revenue, cost of goods, expenses, net profit and a management balance snapshot from the same commerce data.


## I. Before accepting real customer orders

Review `AUDIT-REPORT.md`. The included terms/privacy/shipping/return pages are generic starting templates, not legal advice. Add your real registered business identity, address, support/grievance contact, applicable tax details and actual policies before launch; get qualified India-specific legal/compliance review. No website code can guarantee zero security incidents or legal notices.

## J. VS Code terminal: normal website updates

The project now includes safe, repeatable terminal commands. Install Node.js 22 LTS and Git on your computer, then open VS Code's Terminal in the folder that contains `index.html` and `package.json`.

```bash
npm run check
npm run dev
```

Open `http://127.0.0.1:4173` to check the local site. Press `Ctrl+C` to stop the preview. When the local checks and your manual review pass, update GitHub:

```bash
npm run update
```

**First run only:** this ZIP does not include Git history. Run the command and paste the URL of your existing NOOLTHARI GitHub repository. The updater clones that repository into a temporary staging folder, overlays the repaired project files, preserves files that exist only in the remote repository, reruns static checks, and commits/pushes normally. It then links the Git history to this local folder for future updates. Do not enter a repository belonging to another website. It never force-pushes; if Git rejects a push, stop and reconcile the branch history rather than forcing it.

In Vercel, connect/import that same GitHub repository into the existing NOOLTHARI Vercel project, and ensure the production branch is the branch you push (normally `main`). After this one-time connection, `npm run update` pushes to GitHub and Vercel automatically deploys the connected production branch.

Alternative direct Vercel deployment:

```bash
npx vercel login
npm run deploy
```

The first direct deployment asks you to link this folder. Select the existing NOOLTHARI Vercel project. `npm run deploy` validates the project first and then deploys production. It does not push to GitHub; use `npm run update` for the GitHub + automatic Vercel route.

The scripts do not change Supabase schema, customer/order records, Razorpay settings, or Vercel environment secrets. Apply the additive Supabase migration separately and only once as described in section A. Run that migration before deploying the updated frontend, because the product page reads the new optional `instagram_url` field. No terminal script can safely infer or replace your real production credentials.


## K. NOOLTHARI V2 upgrade (existing/live database)

1. Take a fresh Supabase database backup.
2. Run `supabase/migrations/20261101_v2_wishlist_admin_audit.sql` once in SQL Editor if it is not already installed. This adds customer-owned wishlists, privacy-conscious admin activity logs, contact-form rate limiting, and the email notification outbox. It does not replace products, orders, customers, stock or payment data.
3. Before deploying the Nov 8 product/admin update, run `supabase/migrations/20261108_product_instagram_and_fulfilment.sql` once. This adds only the optional product Instagram URL, its safe public read grant, refreshes the protected admin product view and restricts order fulfilment updates to an already-paid order moving forward. Existing customer/product/order/payment records are preserved. Do not run `master.sql` against the live project.
4. Deploy the notification function: `supabase functions deploy send-order-notifications`.
5. For transactional email, create/verify a sending domain with Resend and set these Edge Function secrets in Supabase: `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` (for example `NOOLTHARI Orders <orders@your-verified-domain>`), plus a separate long random `NOTIFICATION_CRON_SECRET` (do not reuse the reservation-expiry secret). The from-address must belong to a domain verified by your email provider.
6. Schedule `POST https://YOUR-PROJECT.supabase.co/functions/v1/send-order-notifications` every 2–5 minutes with header `x-cron-secret: YOUR_NOTIFICATION_CRON_SECRET`. Use a trusted scheduler; never place the secret in browser JavaScript, HTML or GitHub. The endpoint processes a limited retryable batch and records sent/failed results.
7. Visit Admin → Activity to confirm that new admin changes are being logged. It shows a limited summary and intentionally omits addresses, phone numbers, email addresses and payment secrets.

For a brand-new empty Supabase project, use `supabase/master.sql` once; it includes the V2 schema. Never run the full master file on an existing production database. The V2 migration also restricts browser-readable product columns so internal purchase cost and reserved stock are not exposed through the public products API.

## L. Owner settings that must be supplied before live sales

The source package cannot guess commercial/legal facts. Before production orders, confirm and publish the seller's legal name, business/registered address, customer support and grievance contact, GST/tax details where applicable, actual dispatch/delivery timelines, shipping price/free-shipping threshold, cancellation rules, damage-only return window/evidence requirements and refund timelines. Update the policy pages with those verified values. The current checkout calculates the order from server-side product prices and currently stores zero shipping fee; do not assume that is your intended shipping policy. A qualified India e-commerce compliance professional should review the final policies.

Discount/coupon campaigns must not be launched until a server-side coupon validation and discount-calculation rule is configured. Do not use a client-only coupon calculation. Actual Razorpay refunds must be initiated and confirmed at the gateway; changing an order's display status alone is not proof that money was refunded.

## M. Local checks and rollout

Run `npm run check`, preview with `npm run dev`, and manually test the checkout in Razorpay Test Mode. Apply migrations before deploying UI features that depend on them. Connect this folder to your existing GitHub repository/Vercel project only after reviewing the diff and confirming the production branch. Keep a separate database backup and test login before production rollout.
