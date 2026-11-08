# NOOLTHARI™ — Website and business management

A static, mobile-responsive storefront and admin system for the NOOLTHARI saree brand. The project uses HTML, CSS and vanilla JavaScript with Supabase (Auth, Postgres and Storage), Razorpay and the existing Vercel deployment. There is no React/Next.js build step.

## What is included

- Customer storefront, product pages, wishlist, cart, account, checkout, orders and return request pages.
- One admin dashboard with Products, Orders, Customers, Returns, Messages and one Finance area. Activity and the separate Categories admin page have been removed.
- One product add/edit workflow, with category and vendor creation inside the form. Product photos receive a restrained NOOLTHARI™ watermark before upload.
- One order register for website, offline, Instagram, WhatsApp, gifts and collaborations. A manual sale stores customer details even when the buyer has no website account.
- A single business ledger for owner capital, stock purchases and vendor balances, expenses, order receipts, refunds, Razorpay fees and settlement transfers.
- Editable home page banner from the admin dashboard.

## Read these before deploying

1. `SUPABASE-UPDATE-GUIDE.md` — safe instructions for upgrading the existing Supabase project and performing the optional clean business-data reset.
2. `BUSINESS-WORKFLOW-GUIDE.md` — how product stock, sales, gifts, receivables and Finance work together.
3. `AUDIT-REPORT.md` — what was checked and what has not been live-tested.
4. `2026-11-08-UPDATE-NOTES.md` — changes in this package.

## Important safety notes

- Keep the existing `js/config.js`, `.vercel/project.json`, Supabase project URL, public browser key and Razorpay Key ID. They are already connected to the current deployment.
- Never add a Supabase `service_role`/secret key or Razorpay Key Secret to browser files or GitHub.
- Do not run `supabase/master.sql` against the existing live database. It is only the all-in-one baseline for a brand-new Supabase project.
- The separate `supabase/reset_business_data.sql` is destructive to business/catalogue data. Back up first and run it only after the latest migration and only when you are ready to start fresh. It preserves `auth.users` and `public.profiles`, including the admin and customer accounts.
- No SQL migration has been run against your live database from this editing session. No Vercel production deploy or live Razorpay payment test has been performed.

## Local checks

Use the VS Code terminal in the project root:

```bash
npm.cmd run check
npm.cmd run dev
```

Then open `http://127.0.0.1:4173`. `npm.cmd run check` performs static checks; it is not a substitute for testing a real Supabase account, a Razorpay test transaction or physical mobile devices.

## GitHub and Vercel updates

`npm.cmd run update` runs preflight and safely pushes to the existing GitHub repository. When the ZIP is not linked to Git history, the script asks for the existing repository URL, clones it to a temporary staging folder, overlays these files while preserving unrelated remote-only files, explicitly removes the four retired Activity/Categories files, and uses a normal commit/rebase/push (never force-pushes). Back up your working folder first and stop if Git reports conflicts.

The included `.vercel/project.json` points to the existing NOOLTHARI Vercel project. If GitHub is connected to that same Vercel project and production branch, a successful push triggers deployment. Alternatively, `npm.cmd run deploy` uses the existing Vercel link and deploys the current folder directly. Do not create a new Vercel project or change the custom-domain DNS records for this update.
