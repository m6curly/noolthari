import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args, options = {}) {
  const result = spawnSync(npx, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.interactive ? 'inherit' : 'pipe'
  });
  if (result.error) throw new Error(`Could not start npx: ${result.error.message}. Install Node.js LTS and npm.`);
  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`npx ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
  return result;
}

async function main() {
  process.chdir(ROOT);
  console.log('\nNOOLTHARI — Vercel production deploy\n');
  const check = spawnSync(process.execPath, ['scripts/preflight.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 1);

  console.log('\nChecking Vercel CLI (first run may download the CLI through npm)...');
  run(['--yes', 'vercel', '--version']);
  const identity = run(['--yes', 'vercel', 'whoami'], { allowFailure: true });
  if (identity.status !== 0) {
    throw new Error('Vercel is not logged in. Run `npx vercel login`, finish browser login, then run `npm run deploy` again.');
  }

  if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) {
    console.log('\nThis folder is not linked to a Vercel project yet. Select the existing NOOLTHARI project when prompted.');
    run(['--yes', 'vercel', 'link'], { interactive: true });
  }
  if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) {
    throw new Error('Vercel project link was not created. Run `npx vercel link` and select the correct existing project.');
  }

  console.log('\nDeploying this static project to Vercel production...');
  run(['--yes', 'vercel', 'deploy', '--prod', '--yes'], { interactive: true });
  console.log('\nVercel production deployment command completed. Open the deployment URL and test checkout/auth flows.');
}

main().catch((error) => {
  console.error(`\nDeploy stopped safely: ${error.message}`);
  process.exit(1);
});
