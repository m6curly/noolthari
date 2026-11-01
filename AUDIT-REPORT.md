# NOOLTHARI™ V2 — Code audit and rollout report

**Package:** NOOLTHARI V2 (static HTML/CSS/JavaScript + Supabase + Razorpay)

## What changed in this package

### Storefront and usability
- Replaced the previous mixed visual treatment with a shared ivory / peacock-teal / antique-gold design system, consistent typography, responsive controls, clearer focus states and reduced-motion support.
- Removed the awkward injected left-side Back control. Contextual navigation such as “Back to orders” and “Back to sign in” remains where it is useful.
- Added live catalogue filters for category, fabric, colour, occasion, price range and stock availability, plus sorting.
- Added customer wishlist UI backed by an owner-only Supabase table, related-saree suggestions and a guest bag that survives sign-in.
- Product detail pages now update SEO/social metadata and emit basic Product structured data using the actual product details.
- Added canonical and social metadata for public pages, no-index metadata for private/admin pages, `robots.txt` and a sitemap.
- Added product image WebP display copies while retaining source assets.

### Security and data integrity
- Removed the supplied `.env.local` from the deployable project. The supplied archive contained a Vercel OIDC token; revoke that token in Vercel and do not reuse it. `.env.local` and other `.env.*` files are excluded from the package; `.env.example` contains placeholders only.
- Customer product queries now request an explicit public-safe column list rather than `select('*')`.
- The V2 SQL migration revokes broad browser `SELECT` on `products`, grants only storefront-safe columns, and exposes full product reads through an `admin_products` view filtered by `is_admin()`.
- The V2 migration adds RLS-protected customer wishlists, an admin activity log that deliberately excludes customer PII/payment secrets, per-email contact-form rate limiting, a retryable notification outbox and an idempotent, stock-rechecking guest-cart import RPC.
- Existing October security/integrity migration remains part of the required upgrade path. It is not replaced by this package.
- Contact form adds a honeypot; deployment CSP and browser security headers are configured in `vercel.json`.
- Admin exports neutralize spreadsheet formula injection in CSV values.
- Admin returns UI no longer lets an operator mark a return as `refunded` from a dropdown. The real refund must be processed and verified at Razorpay; this package does not yet provide a refund-initiation endpoint or a button to mark a return as refunded.

### Operations and deployment
- Added Admin → Activity and CSV export for the currently displayed admin table.
- Added a Supabase Edge Function that sends queued order/shipment/return/refund status emails through Resend using server-side secrets and a cron secret.
- Added VS Code terminal helper scripts for local preview, static preflight, GitHub update and Vercel deployment.
- Added setup instructions for safe migration order, deployment secrets, email scheduling and owner-supplied business settings.

## Required upgrade order for an existing/live store

1. Back up the Supabase project and preserve the current GitHub/Vercel deployment.
2. Confirm whether `20261031_security_integrity_and_contact.sql` has already been applied. If not, apply it first.
3. Apply `20261101_v2_wishlist_admin_audit.sql` once.
4. Deploy all five Edge Functions, including `send-order-notifications`, and set the server-only secrets documented in `SETUP.md`.
5. Test sign-in, guest-bag merge, checkout, Razorpay in Test Mode, webhooks, reservation expiry, admin product editing, returns, tracking and notification emails before switching to live payments.
6. Deploy the static files to the existing Vercel project only after reviewing the Git diff and confirming the production branch.

For a brand-new empty Supabase project, run `supabase/master.sql` once. **Never run the full master schema against a live project with existing orders/customers.**

## Verification performed in this build environment

- JavaScript parse checks and HTML local-reference checks are run by `npm run check`.
- The HTML and JavaScript files were locally syntax-checked during the build process.
- A local HTTP preview was started and a page request returned HTTP 200.
- Edge Function TypeScript source was checked for syntax during development.
- The `.env.local` token file was removed from the project package.

These checks do **not** prove live Supabase RLS behaviour, payment capture/refund, webhook delivery, SMTP/provider delivery, Vercel production deployment, real customer flows or compatibility on every physical browser/device. Supabase CLI/psql, production credentials, Razorpay test credentials and owner access were not available in this build environment. The browser-render screenshot check also could not be completed here.

## Not safe to invent or claim as completed

The following require owner decisions, provider configuration or additional production implementation before they can be represented as live features:

- **Actual commercial/legal details:** legal seller name, address, GST/tax registration details where applicable, support/grievance contacts and final legal text.
- **Shipping policy:** the existing checkout's shipping amount is currently ₹0. Actual shipping prices, zones, free-shipping threshold and delivery promises must be supplied and wired to the server-side checkout calculation before launch.
- **Coupons/discounts:** no client-only discount has been added. A secure server-side coupon schema, validation, usage limits and Razorpay amount calculation must be designed before coupon campaigns are enabled.
- **Actual Razorpay refund initiation:** the current admin status selector intentionally does not claim to process money. A server-side refund endpoint, idempotency, signature/permission checks and confirmation/reconciliation workflow must be built and configured with the owner's Razorpay account before enabling automated refunds.
- **Monitoring and delivery:** production error monitoring DSN, Resend verified sender/domain and trusted scheduler must be configured by the owner.
- **Legal compliance:** the policy pages are templates and require real business terms and qualified India-specific legal/compliance review.

## Immediate credential action

The ZIP originally uploaded to this conversation contained `.env.local` with a Vercel OIDC token. Revoke/invalidate that token in the Vercel account immediately. Do not place Vercel tokens, Supabase service-role/secret keys, Razorpay Key Secrets, Resend API keys or cron secrets in HTML, browser JavaScript, GitHub or the downloadable ZIP.

## Static preflight command

```bash
npm run check
```

A pass means only that the included static checks passed; it is not a security certification or a live-production test.
