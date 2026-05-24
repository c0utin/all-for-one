import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import * as store from './store.js';
import { buildExportJson } from './exporter.js';

const PORT = parseInt(process.env.AFO_PORT || '3001', 10);
const WEB_DIST = path.resolve('./web/dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.map':  'application/json',
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end',  () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const jsonReplacer = (_k, v) => (typeof v === 'bigint' ? Number(v) : v);

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  if (body == null) return res.end();
  res.end(typeof body === 'string' ? body : JSON.stringify(body, jsonReplacer));
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  let file = path.join(WEB_DIST, rel);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(WEB_DIST)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    const fallback = path.join(WEB_DIST, 'index.html');
    if (!fs.existsSync(fallback)) {
      return send(res, 404, { error: 'web not built', hint: 'npm run build, or use `npm run dev`' });
    }
    file = fallback;
  } else {
    file = resolved;
  }
  const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { error: 'bad url' }); }

  if (req.method === 'OPTIONS') return send(res, 204, null, 'text/plain');

  try {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/entries' && m === 'GET') {
      const topic       = url.searchParams.get('topic')       || null;
      const content     = url.searchParams.get('content')     || null;
      const resourceId  = url.searchParams.get('resource_id') || null;
      const date        = url.searchParams.get('date')        || null;
      const tzOffset    = url.searchParams.get('tz_offset');
      const limit       = Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10));
      return send(res, 200, await store.listEntries({
        topic, content, date,
        resourceId: resourceId ? Number(resourceId) : null,
        tzOffset,
        limit,
      }));
    }

    if (p === '/api/entries' && m === 'POST') {
      const body = await readJson(req);
      if (!body.text || !String(body.text).trim()) return send(res, 400, { error: 'text is required' });
      const id = await store.addEntry({
        kind: 'log',
        topic: body.topic,
        content: body.content,
        resourceId: body.resource_id ? Number(body.resource_id) : null,
        text: String(body.text).trim(),
        tags: body.tags || [],
      });
      return send(res, 201, { id });
    }

    if (p === '/api/resources' && m === 'GET') {
      const status  = url.searchParams.get('status')  || null;
      const topic   = url.searchParams.get('topic')   || null;
      const content = url.searchParams.get('content') || null;
      return send(res, 200, await store.listResources({ status, topic, content }));
    }

    if (p === '/api/resources' && m === 'POST') {
      const body = await readJson(req);
      if (!body.topic || !body.kind || !body.name) {
        return send(res, 400, { error: 'topic, kind and name are required' });
      }
      const r = await store.addResource({
        topic:   body.topic,
        content: body.content,
        kind:    body.kind,
        name:    body.name,
        unit:    body.unit,
        total:   body.total,
      });
      return send(res, 201, r);
    }

    const resMatch = p.match(/^\/api\/resources\/(\d+)$/);
    if (resMatch) {
      const id = Number(resMatch[1]);
      if (m === 'PATCH') {
        const body = await readJson(req);
        const updated = await store.updateResource(id, body);
        if (!updated) return send(res, 404, { error: 'not found' });
        return send(res, 200, updated);
      }
      if (m === 'DELETE') {
        await store.deleteResource(id);
        return send(res, 204, null, 'text/plain');
      }
      if (m === 'GET') {
        const r = await store.getResource(id);
        if (!r) return send(res, 404, { error: 'not found' });
        return send(res, 200, r);
      }
    }

    if (p === '/api/topics' && m === 'GET') {
      return send(res, 200, await store.listTopics());
    }

    if (p === '/api/contents' && m === 'GET') {
      const topic = url.searchParams.get('topic') || null;
      return send(res, 200, await store.listContents({ topic }));
    }

    if (p === '/api/calendar' && m === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '186', 10);
      const tzOffset = url.searchParams.get('tz_offset');
      return send(res, 200, await store.calendarHeatmap({ days, tzOffset }));
    }

    if (p === '/api/export.json' && m === 'GET') {
      const json = await buildExportJson();
      const fname = `all-for-one-${new Date().toISOString().slice(0, 10)}.json`;
      const buf = Buffer.from(json, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
      });
      res.end(buf);
      return;
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });
    return serveStatic(res, p);
  } catch (e) {
    console.error('server error:', e);
    return send(res, 500, { error: e.message });
  }
});

export function startServer() {
  server.listen(PORT, () => {
    console.log(`afo web on http://localhost:${PORT}`);
    console.log('endpoints:');
    console.log('  GET    /api/entries[?topic=&content=&resource_id=&limit=]');
    console.log('  POST   /api/entries   { text, topic?, content?, resource_id? }');
    console.log('  GET    /api/resources[?status=&topic=&content=]');
    console.log('  POST   /api/resources { topic, kind, name, content?, unit?, total? }');
    console.log('  PATCH  /api/resources/:id { position?, status?, name?, ... }');
    console.log('  DELETE /api/resources/:id');
    console.log('  GET    /api/topics');
    console.log('  GET    /api/contents[?topic=]');
    console.log('  GET    /api/calendar[?days=]');
    console.log('  GET    /api/export.json  (browser download)');
  });
}
