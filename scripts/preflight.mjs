import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED = new Set(['.git', 'node_modules', '.vercel']);
const problems = [];
const notes = [];

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    problems.push(`JavaScript syntax failed: ${relative(file)}\n${(result.stderr || result.stdout).trim()}`);
  }
}

function isExternalReference(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(value) || value.trim() === '';
}

function verifyLocalReference(htmlFile, rawValue) {
  const value = rawValue.trim().replaceAll('&amp;', '&');
  if (isExternalReference(value)) return;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return;
  let candidate = clean.startsWith('/')
    ? path.resolve(ROOT, `.${clean}`)
    : path.resolve(path.dirname(htmlFile), clean);
  if (!candidate.startsWith(ROOT + path.sep) && candidate !== ROOT) return;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }
  if (!fs.existsSync(candidate)) {
    problems.push(`Missing local reference in ${relative(htmlFile)}: ${rawValue}`);
  }
}

function checkHtml(file) {
  const html = fs.readFileSync(file, 'utf8');
  if (!/<title\b[^>]*>\s*[^<]+/i.test(html)) problems.push(`Missing page title: ${relative(file)}`);
  if (!/<meta\s+[^>]*name=["']viewport["']/i.test(html)) problems.push(`Missing viewport meta: ${relative(file)}`);

  const ids = [...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`Duplicate HTML id "${id}" in ${relative(file)}`);
    seen.add(id);
  }

  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
    verifyLocalReference(file, match[2]);
  }
}

function checkSecretSafety(files) {
  const secretFiles = files.filter((file) => /(^|\/)\.env(?:\.|$)/.test(relative(file)) && !relative(file).endsWith('.env.example'));
  for (const file of secretFiles) {
    problems.push(`Environment/secret file must not be included in the deploy folder: ${relative(file)}`);
  }

  const textExtensions = new Set(['.js', '.mjs', '.ts', '.html', '.json', '.sql', '.toml', '.md']);
  const patterns = [
    { regex: /sb_secret_[A-Za-z0-9_-]{16,}/g, label: 'Supabase secret key' },
    { regex: /(?:RAZORPAY_KEY_SECRET|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})/g, label: 'server-side secret value' },
    { regex: /rzp_live_secret_[A-Za-z0-9_-]{10,}/g, label: 'Razorpay secret' }
  ];
  for (const file of files) {
    if (!textExtensions.has(path.extname(file))) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(source)) problems.push(`Possible ${pattern.label} found in ${relative(file)}. Remove it and rotate the key if it was exposed.`);
    }
  }
}

function checkProjectConfig() {
  for (const [label, file] of [['package.json', 'package.json'], ['Vercel config', 'vercel.json']]) {
    try {
      JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    } catch (error) {
      problems.push(`${label} is missing or invalid JSON: ${error.message}`);
    }
  }
  const supabaseConfig = path.join(ROOT, 'supabase', 'config.toml');
  if (!fs.existsSync(supabaseConfig)) problems.push('Missing supabase/config.toml');
  else {
    const text = fs.readFileSync(supabaseConfig, 'utf8');
    if (!/^project_id\s*=\s*"[^"]+"/m.test(text)) problems.push('Supabase config is missing project_id.');
  }
  const gitignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
  if (!gitignore.includes('.env')) problems.push('.gitignore must exclude local .env files before deployment.');
}


function checkNoothariFeatureContracts(files) {
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('site-consistency.css')) {
      problems.push(`Missing uniform responsive stylesheet: ${relative(file)}`);
    }
  }

  const productJs = fs.readFileSync(path.join(ROOT, 'admin/js/products.js'), 'utf8');
  if (!productJs.includes(".from('admin_products')")) {
    problems.push('Admin product listing/editor must read protected product details from public.admin_products.');
  }
  const directProductReads = [...productJs.matchAll(/\.from\(['"]products['"]\)\s*\.select\(([^)]*)\)/g)];
  for (const read of directProductReads) {
    // Only the explicitly public description column may be fetched directly;
    // internal purchase cost/vendor/reservation fields stay behind admin_products.
    if (!/^\s*['"]description['"]\s*$/.test(read[1])) {
      problems.push('Admin product JS may directly read only the public description field from public.products.');
    }
  }

  const productFiles = [
    'admin/product-add.html', 'admin/product-edit.html', 'admin/js/products.js',
    'js/catalog.js', 'js/product.js', 'js/shop.js', 'shop.html', 'product.html'
  ];
  for (const name of productFiles) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (/\b(?:fabric|pattern|occasion)\b/i.test(source)) {
      problems.push(`Removed product field still referenced in ${name}.`);
    }
  }

  const financeHtml = fs.readFileSync(path.join(ROOT, 'admin/accounting.html'), 'utf8');
  const financeJs = fs.readFileSync(path.join(ROOT, 'admin/js/accounting.js'), 'utf8');
  for (const label of ['Receive saree stock', 'Pay pending vendor amount', 'Record Razorpay payout']) {
    if (financeHtml.toLowerCase().includes(label.toLowerCase())) {
      problems.push(`Removed Finance section is still present: ${label}.`);
    }
  }
  if (/admin_pay_vendor_balance|admin_record_razorpay_settlement|receive-stock-form|vendor-payment-form|razorpay-settlement-form/i.test(financeJs)) {
    problems.push('Removed Finance form logic is still present in admin/js/accounting.js.');
  }

  if (!productJs.includes("text: 'NOOLTHARI™'")) {
    problems.push('NOOLTHARI image watermark is missing from the product uploader.');
  }

  const dashboardHtml = fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
  const dashboardJs = fs.readFileSync(path.join(ROOT, 'admin/js/dashboard.js'), 'utf8');
  if (!/id="hero-banner-image"[^>]*multiple/.test(dashboardHtml)) {
    problems.push('Home banner must accept multiple selected photos for a collage.');
  }
  if (!dashboardJs.includes('makePremiumBannerCollage') || !dashboardJs.includes('files.length < 1') || !dashboardJs.includes('files.length > 12')) {
    problems.push('Automatic banner creation must support 1–12 selected photos.');
  }
  if (!dashboardJs.includes('count >= 9') || !dashboardJs.includes('count === 2') || !dashboardJs.includes('Decode, draw and release one source at a time')) {
    problems.push('Banner collage must use balanced 1–12 photo layouts and bounded image decoding for mobile devices.');
  }
  const consistencyCss = fs.readFileSync(path.join(ROOT, 'css/site-consistency.css'), 'utf8');
  if (!/hero-art[^}]*aspect-ratio:\s*16\s*\/\s*9/s.test(consistencyCss) || !/hero-image[^}]*object-fit:\s*cover/s.test(consistencyCss)) {
    problems.push('Homepage banner must preserve the 16:9 collage ratio on responsive screens.');
  }

  if (!/descriptionDirty/.test(productJs) || !/savedDescription/.test(productJs)
      || !/descriptionResult/.test(productJs)
      || !/existing product description has not loaded/i.test(productJs)) {
    problems.push('Product edit must reload and protect the original description from accidental blank saves.');
  }

  const storefrontProductJs = fs.readFileSync(path.join(ROOT, 'js/product.js'), 'utf8');
  if (!storefrontProductJs.includes('pointerdown') || !storefrontProductJs.includes('pointerup') || !storefrontProductJs.includes('data-gallery-next')) {
    problems.push('Product gallery must support touch swipe and accessible previous/next controls.');
  }
  if (!storefrontProductJs.includes('gallery-stock-label') || !storefrontProductJs.includes("'Out of stock'")) {
    problems.push('Product detail page must show a clear out-of-stock state without removing the product image.');
  }
  if (!consistencyCss.includes('.product-card.is-out-of-stock .product-media img')
      || !consistencyCss.includes('visibility: visible')
      || !consistencyCss.includes('.gallery-main.is-out-of-stock > img')) {
    problems.push('Out-of-stock product photos must remain visible with a subtle dim treatment.');
  }

  const financePage = fs.readFileSync(path.join(ROOT, 'admin/accounting.html'), 'utf8');
  if (/capital-form|Add investment|Add investment \/ capital|Save investment/i.test(financePage)) {
    problems.push('The investment form must be removed from Finance while expenses remain.');
  }
  if (!financePage.includes('expense-form')) {
    problems.push('Finance expense entry must remain available.');
  }

  const homePage = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!homePage.includes('application/ld+json') || !homePage.includes('https://www.instagram.com/noolthari/')) {
    problems.push('Homepage Organization/WebSite schema must identify the official NOOLTHARI Instagram profile.');
  }

  const adminEmailSql = path.join(ROOT, 'supabase/NOOLTHARI_LATEST_MASTER_UPDATE.sql');
  const adminEmailFunction = path.join(ROOT, 'supabase/functions/send-admin-notifications/index.ts');
  if (!fs.existsSync(adminEmailSql) || !fs.existsSync(adminEmailFunction)) {
    problems.push('Admin email notification SQL or Edge Function is missing.');
  }
  if (fs.existsSync(adminEmailSql)) {
    const sql = fs.readFileSync(adminEmailSql, 'utf8');
    for (const required of ['queue_admin_signup_email', 'queue_admin_order_created_email', 'queue_admin_return_created_email', 'queue_admin_shipment_status_email', 'queue_admin_payment_status_email', 'shipment_status', 'payment_status', 'admin_email_notifications']) {
      if (!sql.includes(required)) problems.push(`Admin email SQL is missing ${required}.`);
    }
    for (const required of ['grant insert, update, delete on table public.products to authenticated', 'create policy products_admin', 'grant select on public.admin_products to authenticated']) {
      if (!sql.toLowerCase().includes(required)) problems.push(`Existing-project SQL is missing the Admin product permission fix: ${required}.`);
    }
    const executableSql = sql.replace(/--.*$/gm, '');
    if (/\b(drop\s+table|truncate\s+(?:table\s+)?|delete\s+from\s+public\.(?:products|orders|profiles|purchases|expenses))\b/i.test(executableSql)) {
      problems.push('Existing-project SQL must not delete or reset business/customer records.');
    }
  }
  if (fs.existsSync(adminEmailFunction)) {
    const fn = fs.readFileSync(adminEmailFunction, 'utf8');
    for (const required of ["item.event_type === 'signup'", "item.event_type === 'order_created'", "item.event_type === 'return_created'", "item.event_type === 'shipment_status'", "item.event_type === 'payment_status'", 'noolthari6@gmail.com']) {
      if (!fn.includes(required)) problems.push(`Admin email function is missing ${required}.`);
    }
  }
}

function main() {
  process.chdir(ROOT);
  const files = walk(ROOT);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const jsFiles = files.filter((file) => file.endsWith('.js') || file.endsWith('.mjs'));

  checkProjectConfig();
  for (const file of htmlFiles) checkHtml(file);
  for (const file of jsFiles) runNodeCheck(file);
  checkSecretSafety(files);
  checkNoothariFeatureContracts(files);

  if (problems.length) {
    console.error(`\nNOOLTHARI pre-deploy check FAILED (${problems.length} issue(s))\n`);
    for (const problem of problems) console.error(`✖ ${problem}`);
    console.error('\nFix the issues above before deploying.');
    process.exit(1);
  }

  console.log('NOOLTHARI pre-deploy check PASSED');
  console.log(`HTML pages checked: ${htmlFiles.length}`);
  console.log(`JavaScript files syntax-checked: ${jsFiles.length}`);
  console.log('Local references, uniform CSS, product permission path, banner collage, description persistence, Finance cleanup, SEO schema, admin email notifications, page titles, viewport tags, duplicate IDs, config and secret checks: passed');
  console.log('Note: this is a static preflight, not a live Supabase/Razorpay transaction or physical-device browser test.');
}

main();
