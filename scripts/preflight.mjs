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

function main() {
  process.chdir(ROOT);
  const files = walk(ROOT);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const jsFiles = files.filter((file) => file.endsWith('.js') || file.endsWith('.mjs'));

  checkProjectConfig();
  for (const file of htmlFiles) checkHtml(file);
  for (const file of jsFiles) runNodeCheck(file);
  checkSecretSafety(files);

  if (problems.length) {
    console.error(`\nNOOLTHARI pre-deploy check FAILED (${problems.length} issue(s))\n`);
    for (const problem of problems) console.error(`✖ ${problem}`);
    console.error('\nFix the issues above before deploying.');
    process.exit(1);
  }

  console.log('NOOLTHARI pre-deploy check PASSED');
  console.log(`HTML pages checked: ${htmlFiles.length}`);
  console.log(`JavaScript files syntax-checked: ${jsFiles.length}`);
  console.log('Local HTML references, page titles, viewport tags, duplicate IDs, JSON config and secret patterns: passed');
  console.log('Note: this is a static preflight, not a live Supabase/Razorpay transaction or physical-device browser test.');
}

main();
