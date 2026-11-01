# NOOLTHARI™ — Master Commerce Build

This is the single master static e-commerce project for NOOLTHARI™. It is designed for GitHub Pages + Supabase + Razorpay and does not require Node.js, npm, React, Next.js or a build step.

## What is already wired

Customer journey: sign up/sign in → browse → product → bag → address → Razorpay checkout → server verification → order → admin fulfilment → shipment tracking → delivered → damage/defect return request → admin review.

Admin journey: one admin sign-in → dashboard → products → categories → orders → customers → returns → finance → shipment tracking → sign out.

The same account page is used for customers and admins. The role stored in `profiles.role` decides where an authenticated user goes. A database trigger now blocks self-promotion by customers. Guests can browse and keep a local shopping bag; checkout requires sign-in, after which the bag is merged through a stock-validating database function. Admin-only actions remain restricted by role and database policies.

The website has no COD option.

## Credentials

`js/config.js` contains only browser-safe Supabase URL/publishable key and Razorpay Key ID. Never put a Supabase secret/service-role key or Razorpay Key Secret in frontend JavaScript.

## Important one-time backend setup

1. Create a Supabase project.
2. For a brand-new Supabase project, run `supabase/master.sql` once. For an existing project with customer/order data, do **not** rerun the full master schema; apply the dated additive migrations in order only after taking a backup: `20261031_security_integrity_and_contact.sql`, then `20261101_v2_wishlist_admin_audit.sql`.
3. In Supabase Auth, configure your email confirmation preference.
4. Sign up once through the website as a normal account.
5. In Supabase SQL Editor promote that user to admin with:

```sql
update public.profiles set role='admin' where email='YOUR-ADMIN-EMAIL@example.com';
```

6. Configure `js/config.js` with the Supabase project URL, publishable key and Razorpay Key ID.
7. Deploy the Edge Functions in `supabase/functions/` and add secrets in Supabase:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `ALLOWED_ORIGINS` (required, comma-separated exact HTTPS storefront origins; browser payment requests fail closed if this is missing)
   - `CRON_SECRET` (long random value for the reservation-expiry job)
   - `NOTIFICATION_CRON_SECRET` (separate long random value for email queue processing)
   - `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` (only when enabling transactional email with a verified Resend domain)
   - Supabase's own function secrets for the project are available automatically.
8. Configure Razorpay webhook to point to `razorpay-webhook` and subscribe to `payment.captured`, `payment.failed`, and `order.paid`.
9. Test in Razorpay Test Mode first. Switch to live only after verification, webhook and capture are working.

## Vercel

Import the repository in Vercel and deploy the project root as a static site (no build command and no output directory are required). `vercel.json` adds security response headers, including a Content Security Policy that allows Supabase and Razorpay. After deployment, add the exact production and preview origins you actually use to the Supabase Edge Function secret `ALLOWED_ORIGINS`.

## GitHub Pages

This build uses relative links so it works with a repository URL and with a custom domain. Publish the repository root as GitHub Pages. No build step is required. GitHub Pages does not apply the custom response headers in `vercel.json`; use Vercel (or another host where you configure equivalent headers) when you need those headers and the supplied Content Security Policy.

## Data model

The schema contains commerce tables for products, categories, product images, addresses, carts, orders, order items, payments, shipments, returns, refunds and business finance foundations. V2 adds account-owned wishlists, advanced filters, guest bag import, privacy-conscious admin activity logging, product-column privacy, contact rate limiting and a retryable customer email outbox.

## Logo

Your supplied NOOLTHARI™ logo is included as an optimized WebP at `assets/logo/noolthari-logo.webp`; the original PNG is retained as a source asset. The hero image also has an optimized WebP display copy.

There is no cash-on-delivery path in the application. Every checkout path is online-payment only through Razorpay.


## Existing project upgrade

The ZIP includes `supabase/migrations/20261031_security_integrity_and_contact.sql`. Back up the Supabase project first, then apply this migration once in SQL Editor. It does not drop orders or customer data. It closes the profile-role escalation and public payment-finalization RPC issues, adds the missing contact inbox schema, restores return-evidence metadata inserts, and makes payment reservations/cart handling safer. Do not run the entire master SQL against a live database merely to apply these fixes.

See `AUDIT-REPORT.md` for the V2 changes and the live checks that still require your project/test credentials. For existing projects, apply `20261101_v2_wishlist_admin_audit.sql` once after the October migration; it adds the wishlist, activity log, contact rate limit and email outbox.

## Terminal workflow (VS Code)

This project is a static website, so there is no compile/build step and no npm packages to install. Node.js 22 LTS (or a compatible modern Node.js release), npm and Git are required.

```bash
npm run dev       # Local preview at http://127.0.0.1:4173
npm run check     # Static pre-deploy checks
npm run update    # Commit current project changes and push to GitHub
npm run deploy    # Direct production deployment to the linked Vercel project
```

First-time GitHub setup: run `npm run update` from this project folder and paste the URL of your existing NOOLTHARI GitHub repository. Because this ZIP has no Git history, the script clones the remote into a temporary staging folder, overlays the repaired project files, preserves files that exist only in the remote repository, runs checks again, commits and pushes without force-pushing, then attaches the Git history to this folder for future updates. Afterward, connect that same GitHub repository to the existing Vercel project once in the Vercel dashboard and set its production branch (normally `main`). Future `npm run update` pushes trigger Vercel automatically through that Git integration.

For direct deploys without relying on GitHub auto-deployment, run `npx vercel login` once and then `npm run deploy`. The first deployment links this folder to a Vercel project; choose the **existing NOOLTHARI project**, not a new project. Direct Vercel deploy does not push code to GitHub, so use `npm run update` when both GitHub and Vercel should receive the update.

`npm run check` also runs in GitHub Actions for pushes and pull requests to `main`. These checks cover static references and syntax; they cannot prove live payment, authentication, database-policy, or device-browser behavior. Never use a force push or rerun the full Supabase master SQL on a live store.


## NOOLTHARI V2 features

- Storefront redesign, responsive layout and advanced live catalogue filters.
- Account-backed wishlist (requires the V2 database migration).
- Related saree recommendations on product pages.
- Admin CSV export for the currently displayed table and a protected Admin → Activity page.
- Contact form honeypot plus database-side per-email rate limiting (V2 migration).
- Transactional email outbox for order/shipment/return/refund status changes. Enable it only after setting the Resend secrets and deploying `send-order-notifications`; see `SETUP.md`.

The supplied project does not invent your shipping charges, free-shipping threshold, seller identity, GST details, delivery commitments or return window. Add those verified business values before accepting new orders. Coupons and actual money refunds must be implemented/approved as server-side gateway operations; an order-status label alone never proves a refund.


## V2.1 storefront refinement

This update keeps the existing HTML page names, asset paths, `js/config.js`, Supabase client setup, `.vercel/project.json`, Vercel routing, payment functions and database migrations in place. It refines the storefront header/footer and touch layouts, standardizes navigation icons, and removes Colour and Occasion dropdowns from The Collection while retaining product data/search fields. No live database change is required for these visual/filter updates.


For the complete Supabase schema, migration order, Edge Function source and notification setup, read **SUPABASE-UPDATE-GUIDE.md**. The complete SQL and TypeScript source remains under `supabase/`.
