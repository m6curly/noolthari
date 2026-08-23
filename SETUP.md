# NOOLTHARI™ — One-time Setup

## A. Supabase

1. Open Supabase → your project → **SQL Editor**.
2. Open `supabase/master.sql` from this project.
3. Paste the complete file into one SQL Editor query and click **Run**.
4. Confirm that the query completes without an error.
5. Open **Authentication → Providers → Email**. Decide whether email confirmation is enabled.
6. Open **Storage**. The SQL creates:
   - `product-images` (public)
   - `return-evidence` (private)

## B. Browser configuration

Open `js/config.js` and replace:

```js
SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
SUPABASE_PUBLISHABLE_KEY: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
RAZORPAY_KEY_ID: 'rzp_test_...'
```

The browser must never contain a Supabase secret/service-role key or Razorpay Key Secret.

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

Deploy:

```text
supabase/functions/create-razorpay-order
supabase/functions/verify-razorpay-payment
supabase/functions/razorpay-webhook
supabase/functions/expire-payment-reservations
```

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

## F. Custom domain

After GitHub Pages gives the site an HTTPS address:

1. In GitHub Pages add your custom domain.
2. Add the DNS records GitHub shows you at your domain registrar.
3. In Supabase **Authentication → URL Configuration**, set the final site URL.
4. Add the password-reset redirect URL for `reset-password.html`.
5. In Razorpay, use the final HTTPS domain for the live checkout/webhook configuration.

## G. Normal business operation

Admin adds a saree → it appears on the shop automatically.

Customer signs in → adds saree → checks out → Razorpay payment → order is paid only after secure server verification → stock is reduced → admin sees order → admin updates processing/shipped/out-for-delivery/delivered → tracking is visible to customer → damage-only return request can be submitted after delivery → admin reviews → refund status can be recorded.

Finance dashboard calculates revenue, cost of goods, expenses, net profit and a management balance snapshot from the same commerce data.
