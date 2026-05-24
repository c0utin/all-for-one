import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './server.js';
import { init as initDb } from './db.js';

const DEV       = process.env.NODE_ENV !== 'production';
const SKIP_WEB  = process.env.AFO_NO_WEB === '1';
const API_PORT  = process.env.AFO_PORT      || '3001';
const VITE_PORT = process.env.AFO_VITE_PORT || '5173';

function banner() {
  const webUrl = DEV && !SKIP_WEB
    ? `http://localhost:${VITE_PORT}`
    : `http://localhost:${API_PORT}`;
  console.log('');
  console.log('  all-for-one');
  console.log('  ───────────────────────────────────────────');
  console.log(`  web:  ${SKIP_WEB ? 'disabled (AFO_NO_WEB=1)' : webUrl}`);
  console.log(`  api:  http://localhost:${API_PORT}/api`);
  console.log('  ───────────────────────────────────────────');
  console.log('');
}

async function startVite() {
  const webDir = path.resolve('./web');
  if (!fs.existsSync(webDir)) {
    console.warn('[afo] ./web missing, skipping web dev server');
    return null;
  }
  const vite = spawn('npm', ['run', 'dev'], {
    cwd: webDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, PORT: VITE_PORT },
  });
  vite.on('exit', (code) => {
    if (code !== null && code !== 0) console.log(`[afo] vite exited (code ${code})`);
  });
  return vite;
}

function ensureBuiltWeb() {
  const dist = path.resolve('./web/dist');
  if (!fs.existsSync(dist)) {
    console.error('[afo] web/dist not found. run `npm run build` before `npm start`.');
    process.exit(1);
  }
}

async function main() {
  console.log('[afo] migrating database...');
  const t0 = Date.now();
  await initDb();
  console.log(`[afo] migration done (${Date.now() - t0}ms)`);

  if (!DEV && !SKIP_WEB) ensureBuiltWeb();

  startServer();

  let vite = null;
  if (DEV && !SKIP_WEB) vite = await startVite();

  banner();

  const shutdown = (sig) => {
    console.log(`\n[afo] ${sig} received, shutting down`);
    if (vite && !vite.killed) {
      try { vite.kill('SIGINT'); } catch {}
    }
    setTimeout(() => process.exit(0), 150);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[afo] fatal:', e);
  process.exit(1);
});
