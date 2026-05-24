import { ensureSchema, MODE } from './db.js';

const t0 = Date.now();
console.log(`[migrate] mode: ${MODE}`);
console.log('[migrate] running CREATE TABLE / INDEX IF NOT EXISTS...');
await ensureSchema();
console.log(`[migrate] done in ${Date.now() - t0}ms`);
process.exit(0);
