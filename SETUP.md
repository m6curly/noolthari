# NOOLTHARI™ — quick setup and deployment

This is a static HTML/CSS/JavaScript project. No React, Next.js, Vite or build step is used. The existing website is connected to Supabase, Razorpay, GitHub and Vercel.

## Read first

- Existing Supabase upgrade and optional data reset: `SUPABASE-UPDATE-GUIDE.md`
- How to run Product, Order and Finance workflows: `BUSINESS-WORKFLOW-GUIDE.md`
- Audit and limits of verification: `AUDIT-REPORT.md`

## Local preview

Open VS Code Terminal in the folder containing `index.html` and `package.json`:

```bash
npm.cmd run check
npm.cmd run dev
```

Open `http://127.0.0.1:4173`. The checker validates static files and JavaScript syntax; it does not make live payments or test database credentials.

## Existing production project

- Keep `js/config.js` unchanged.
- Keep `.vercel/project.json` unchanged.
- Do not change the Supabase project URL, public browser key, Razorpay Key ID, Vercel project or custom domain/DNS.
- Apply the missing Supabase migrations using `SUPABASE-UPDATE-GUIDE.md`.
- Deploy the changed `razorpay-webhook` function to the same Supabase project.
- After backup and migration, use the optional reset SQL only when ready to clear business records. It preserves Auth users and customer/admin profiles.

## Push to GitHub

Back up your current folder first. Run:

```bash
npm.cmd run update
```

The first run from an unlinked ZIP asks for the URL of the existing NOOLTHARI GitHub repository (the repository used in the previous project work was `https://github.com/m6curly/noolthari.git`). It clones to a temporary staging folder, overlays this website, retains remote-only files, runs preflight and uses a normal commit/rebase/push. It explicitly removes the retired Activity/Categories files but preserves unrelated remote-only files. It never force-pushes. If Git stops for conflicts or rejected history, stop and reconcile—do not force it.

## Deploy to Vercel

When the existing GitHub repository is connected to the existing NOOLTHARI Vercel project/production branch, the successful push should trigger deployment automatically. For a direct deployment from this folder, log in to Vercel CLI and run:

```bash
npm.cmd run deploy
```

Confirm that it uses the existing linked NOOLTHARI project. Do not create a replacement Vercel project or change domain DNS records.

## Fresh database only

For a completely new Supabase project, use `supabase/master.sql` as the baseline once. The existing production project must use dated upgrade migrations, never the full master SQL. See the Supabase guide for exact order and the separate optional reset step.
