# NOOLTHARI™ — Master Commerce Build

This is the single master static e-commerce project for NOOLTHARI™. It is designed for GitHub Pages + Supabase + Razorpay and does not require Node.js, npm, React, Next.js or a build step.

## What is already wired

Customer journey: sign up/sign in → browse → product → bag → address → Razorpay checkout → server verification → order → admin fulfilment → shipment tracking → delivered → damage/defect return request → admin review.

Admin journey: one admin sign-in → dashboard → products → categories → orders → customers → returns → finance → shipment tracking → sign out.

The same account page is used for customers and admins. The role stored in `profiles.role` decides where an authenticated user goes. Guests see only **Sign in** and **Sign up**.

The website has no COD option.

## Credentials

`js/config.js` contains only browser-safe Supabase URL/publishable key and Razorpay Key ID. Never put a Supabase secret/service-role key or Razorpay Key Secret in frontend JavaScript.

## Important one-time backend setup

1. Create a Supabase project.
2. Run `supabase/master.sql` once in Supabase SQL Editor. It is safe to rerun because policies are dropped before creation.
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
   - Supabase's own function secrets for the project are available automatically.
8. Configure Razorpay webhook to point to `razorpay-webhook` and subscribe to `payment.captured`, `payment.failed`, and `order.paid`.
9. Test in Razorpay Test Mode first. Switch to live only after verification, webhook and capture are working.

## GitHub Pages

This build uses relative links so it works with a repository URL and with a custom domain. Publish the repository root as GitHub Pages. No build step is required.

## Data model

The schema contains commerce tables for products, categories, product images, addresses, carts, orders, order items, payments, shipments, returns, refunds and business finance foundations for vendors, purchases, expenses, stock movements, accounts and transactions.

## Logo

Your supplied NOOLTHARI™ logo is already included at `assets/logo/noolthari-logo.png` and is rendered as a circular mark in the storefront and admin shell.

There is no cash-on-delivery path in the application. Every checkout path is online-payment only through Razorpay.
