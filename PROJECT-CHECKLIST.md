# NOOLTHARI™ Master Build Audit

- [x] Static HTML/CSS/Vanilla JS — no Node/React/Next/npm/Vite required.
- [x] Single customer/admin authentication screen with Sign in + Create account.
- [x] Admin role is determined by `profiles.role`; no public admin signup.
- [x] Customer/admin route protection via Supabase RLS and frontend guards.
- [x] Logout in account and admin navigation; admin return link from storefront.
- [x] Dynamic products and categories from Supabase.
- [x] Multi-image product upload via Supabase Storage.
- [x] Cart, address book, checkout and order history.
- [x] Online-only Razorpay payment path; COD removed.
- [x] Server-side Razorpay order creation, signature verification and webhook path.
- [x] Payment-reserved stock and idempotent paid-order finalization.
- [x] Admin fulfilment status and courier tracking.
- [x] Damage/defect return workflow and private evidence bucket.
- [x] Refund records and return status workflow.
- [x] Revenue, COGS, expenses, net profit and balance snapshot dashboard.
- [x] Vendor/purchase/expense/stock/accounting foundation tables for later expansion.
- [x] User-supplied NOOLTHARI logo included and displayed circularly.
- [x] Relative links for GitHub Pages project-path compatibility.
- [x] Mobile/tablet/desktop responsive CSS.
- [x] No forbidden `CREATE POLICY IF NOT EXISTS` syntax.
- [x] No invalid PL/pgSQL `+=` operator.
- [x] All local HTML asset references resolved in static audit.
- [x] All project JavaScript files pass `node --check` syntax validation.

## External configuration that cannot be prefilled

- Supabase project URL and publishable/browser key.
- Supabase Auth email settings and final Site URL.
- First admin role promotion.
- Razorpay Test/Live Key ID, Key Secret and Webhook Secret.
- GitHub repository and custom-domain DNS records.
