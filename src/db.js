import { createClient } from '@libsql/client/web';
import path from 'node:path';
import fs from 'node:fs';

function loadEnvFile() {
  const envFile = path.resolve('./.env');
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, 'utf-8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile();

export const DATA_DIR = process.env.AFO_DATA_DIR
  ? path.resolve(process.env.AFO_DATA_DIR)
  : path.resolve('./data');

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* read-only fs (e.g. Netlify) */ }

const TURSO_URL   = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const LOCAL_FILE  = path.join(DATA_DIR, 'afo.db');

export const MODE = (TURSO_URL && TURSO_TOKEN) ? 'turso' : 'local';

console.log(`[db] ${MODE === 'turso' ? 'turso (remote)' : 'local'} -> ${MODE === 'turso' ? TURSO_URL : LOCAL_FILE}`);

const db = createClient({
  url: MODE === 'turso' ? TURSO_URL : `file:${LOCAL_FILE}`,
  ...(MODE === 'turso' && TURSO_TOKEN ? { authToken: TURSO_TOKEN } : {}),
  intMode: 'number',
});

export default db;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS resources (
    id           INTEGER PRIMARY KEY,
    topic        TEXT    NOT NULL,
    content      TEXT,
    kind         TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    unit         TEXT,
    total        INTEGER,
    position     INTEGER NOT NULL DEFAULT 0,
    status       TEXT    NOT NULL DEFAULT 'planned',
    started_at   TEXT,
    completed_at TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_resources_topic   ON resources(topic)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_content ON resources(content)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_status  ON resources(status)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_name    ON resources(name)`,

  `CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY,
    ts          TEXT    NOT NULL DEFAULT (datetime('now')),
    kind        TEXT    NOT NULL,
    topic       TEXT,
    content     TEXT,
    resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
    text        TEXT,
    tags        TEXT,
    source      TEXT    NOT NULL DEFAULT 'web'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entries_ts      ON entries(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_topic   ON entries(topic)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_content ON entries(content)`,
];

async function tableExists(name) {
  const r = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    args: [name],
  });
  return r.rows.length > 0;
}

async function columnExists(table, column) {
  try {
    const r = await db.execute(`PRAGMA table_info(${table})`);
    return r.rows.some(row => row.name === column);
  } catch { return false; }
}

export async function ensureSchema() {
  if (await tableExists('items')) {
    console.log('[db] dropping legacy `items` table');
    await db.execute(`DROP TABLE IF EXISTS items`);
  }

  if (await tableExists('entries')) {
    const hasText        = await columnExists('entries', 'text');
    const hasResourceId  = await columnExists('entries', 'resource_id');
    const hasContentCol  = await columnExists('entries', 'content');
    const legacy = !hasText || !hasResourceId;
    if (legacy) {
      console.log('[db] entries table has legacy schema — dropping and recreating');
      await db.execute(`DROP TABLE IF EXISTS entries`);
    } else if (!hasContentCol) {
      console.log('[db] adding entries.content column');
      await db.execute(`ALTER TABLE entries ADD COLUMN content TEXT`);
    }
  }

  for (const sql of SCHEMA) await db.execute(sql);
}

export async function init() { await ensureSchema(); }
