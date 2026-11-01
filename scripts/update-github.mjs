import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_COPY = new Set(['.git', '.vercel', 'node_modules']);

function git(args, cwd = ROOT, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: options.interactive ? 'inherit' : 'pipe'
  });
  if (result.error) throw new Error(`Could not run Git: ${result.error.message}. Install Git and reopen the VS Code terminal.`);
  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
  return (result.stdout || '').trim();
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  return rl.question(question).finally(() => rl.close());
}

function validateGitHubUrl(url) {
  return /^(?:https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?|git@github\.com:[^/\s]+\/[^/\s]+(?:\.git)?)$/i.test(url.trim());
}

function overlayProject(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (SKIP_COPY.has(entry.name) || entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      overlayProject(from, to);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function runPreflight(cwd = ROOT) {
  const result = spawnSync(process.execPath, ['scripts/preflight.mjs'], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function commitAndPush(cwd) {
  let branch = git(['symbolic-ref', '--short', 'HEAD'], cwd, { allowFailure: true });
  if (!branch) {
    git(['checkout', '-b', 'main'], cwd);
    branch = 'main';
  }

  git(['add', '-A'], cwd);
  const staged = git(['diff', '--cached', '--name-only'], cwd);
  if (staged) {
    const stagedFiles = staged.split(/\r?\n/);
    const forbidden = stagedFiles.filter((name) => /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example'));
    if (forbidden.length) throw new Error(`Refusing to commit environment/secret files: ${forbidden.join(', ')}`);
    git(['diff', '--cached', '--check'], cwd);
    const defaultMessage = `Update NOOLTHARI website (${new Date().toISOString().slice(0, 10)})`;
    // Do not block automation with an extra prompt; user can customize the message on later commits.
    git(['commit', '-m', defaultMessage], cwd, { interactive: true });
  } else {
    console.log('No file changes to commit.');
  }

  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd, { allowFailure: true });
  if (upstream) git(['push'], cwd, { interactive: true });
  else git(['push', '--set-upstream', 'origin', branch], cwd, { interactive: true });
}

async function bootstrapFromZip(repositoryUrl) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noolthari-github-'));
  const cloneDir = path.join(tempRoot, 'project');
  try {
    console.log('\nCloning the existing GitHub repository into a temporary staging folder...');
    git(['clone', '--origin', 'origin', repositoryUrl, cloneDir], ROOT, { interactive: true });
    console.log('Copying the repaired NOOLTHARI project over the matching website files.');
    console.log('Files that exist only in GitHub are preserved; no remote files are mass-deleted.');
    overlayProject(ROOT, cloneDir);
    runPreflight(cloneDir);
    commitAndPush(cloneDir);

    // Copy remote-only files back as well, so this folder matches the pushed tree before linking Git history.
    overlayProject(cloneDir, ROOT);
    // Attach the successfully pushed repository history to this local project for future updates.
    fs.cpSync(path.join(cloneDir, '.git'), path.join(ROOT, '.git'), { recursive: true, errorOnExist: true });
    console.log('\nThis project folder is now connected to the GitHub history for future `npm run update` commands.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  process.chdir(ROOT);
  console.log('\nNOOLTHARI — safe GitHub update\n');
  runPreflight(ROOT);

  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('\nThis ZIP does not include Git history. The first update will link it safely to your existing GitHub repository.');
    let repositoryUrl = '';
    while (!validateGitHubUrl(repositoryUrl)) {
      repositoryUrl = await ask('Paste your existing NOOLTHARI GitHub repository URL (HTTPS or SSH): ');
      if (!validateGitHubUrl(repositoryUrl)) console.log('Please enter a valid github.com repository URL.');
    }
    await bootstrapFromZip(repositoryUrl.trim());
  } else {
    const origin = git(['remote', 'get-url', 'origin'], ROOT, { allowFailure: true });
    if (!origin || !/github\.com[:/]/i.test(origin)) {
      throw new Error(`Missing or unexpected GitHub origin (${origin || 'not configured'}). Refusing to push to an unknown remote.`);
    }
    commitAndPush(ROOT);
  }

  console.log('\nGitHub push completed successfully.');
  console.log('If this repository is connected to the correct Vercel project and production branch, Vercel will deploy automatically.');
  console.log('No force-push was used. A rejected push is a safety stop; resolve the branch history before retrying.');
}

main().catch((error) => {
  console.error(`\nUpdate stopped safely: ${error.message}`);
  process.exit(1);
});
