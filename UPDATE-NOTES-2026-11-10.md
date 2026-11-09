# NOOLTHARI website update — 10 November 2026

## Included changes

- Product image gallery: swipe left/right on touch screens, previous/next controls, active thumbnail and photo counter.
- Out-of-stock presentation: product photos remain visible with a gentle dim treatment; clearer out-of-stock labels and disabled purchase actions.
- Home banner: accepts 1–12 photos and automatically creates a responsive 16:9 composition. One photo fills the banner; multiple photos use a balanced collage. The existing banner remains live until the new collage and settings save successfully.
- Product editor: reads the original description directly from the store-safe `products.description` column and protects it from accidental blank saves during unrelated edits.
- Updated cache-busting query strings for the changed storefront and admin assets.

## Supabase / Razorpay impact

No database schema, table, policy, Edge Function, payment, or Razorpay configuration changes are included. The banner continues to use the existing `store_settings` row and `store-assets` storage bucket. The description read uses the existing store-safe `products.description` column permission.

## Validation

- `npm run check` passed.
- JavaScript syntax checks passed for all project scripts.
- Banner tile layouts passed checks for 1–12 photos, canvas boundaries, and tile overlap.
- This is a static/pre-deploy validation; a live Razorpay transaction and physical Android/iOS device test were not run.

## Deployment

From the existing local NOOLTHARI Git repository in VS Code:

```powershell
npm run check
npm run update
```

The update script runs preflight again, stages and commits the update, fetches/rebases safely, and pushes without force-pushing. When the GitHub production branch is connected to the existing Vercel project, Vercel should deploy from that push.

For a manual Vercel production deployment instead:

```powershell
npx vercel login
npx vercel link
npm run deploy
```

Choose the existing `noolthari` Vercel project when prompted. Do not create a new project.
