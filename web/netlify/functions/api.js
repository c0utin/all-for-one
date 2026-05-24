import { init } from '../../../src/db.js';
import * as store from '../../../src/store.js';
import { buildExportJson } from '../../../src/exporter.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body, (_k, v) => typeof v === 'bigint' ? Number(v) : v),
  };
}

function text(status, body, type = 'text/plain') {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' },
    body,
  };
}

let initialized = false;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (!initialized) {
    await init();
    initialized = true;
  }

  const rawPath = event.path || '';
  const p = rawPath.replace(/^\/api/, '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const m = event.httpMethod;
  const query = event.queryStringParameters || {};

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { /* ignore */ }
  }

  try {
    if (p === '/entries' && m === 'GET') {
      return json(200, await store.listEntries({
        topic: query.topic || null,
        content: query.content || null,
        resourceId: query.resource_id ? Number(query.resource_id) : null,
        date: query.date || null,
        tzOffset: query.tz_offset,
        limit: Math.min(500, parseInt(query.limit || '50', 10)),
      }));
    }

    if (p === '/entries' && m === 'POST') {
      if (!body.text || !String(body.text).trim()) {
        return json(400, { error: 'text is required' });
      }
      const id = await store.addEntry({
        kind: 'log',
        topic: body.topic,
        content: body.content,
        resourceId: body.resource_id ? Number(body.resource_id) : null,
        text: String(body.text).trim(),
        tags: body.tags || [],
      });
      return json(201, { id });
    }

    if (p === '/resources' && m === 'GET') {
      return json(200, await store.listResources({
        status: query.status || null,
        topic: query.topic || null,
        content: query.content || null,
      }));
    }

    if (p === '/resources' && m === 'POST') {
      if (!body.topic || !body.kind || !body.name) {
        return json(400, { error: 'topic, kind and name are required' });
      }
      const r = await store.addResource({
        topic: body.topic,
        content: body.content,
        kind: body.kind,
        name: body.name,
        unit: body.unit,
        total: body.total,
      });
      return json(201, r);
    }

    const resMatch = p.match(/^\/resources\/(\d+)$/);
    if (resMatch) {
      const id = Number(resMatch[1]);
      if (m === 'PATCH') {
        const updated = await store.updateResource(id, body);
        if (!updated) return json(404, { error: 'not found' });
        return json(200, updated);
      }
      if (m === 'DELETE') {
        await store.deleteResource(id);
        return { statusCode: 204, headers: CORS, body: '' };
      }
      if (m === 'GET') {
        const r = await store.getResource(id);
        if (!r) return json(404, { error: 'not found' });
        return json(200, r);
      }
    }

    if (p === '/topics' && m === 'GET') {
      return json(200, await store.listTopics());
    }

    if (p === '/contents' && m === 'GET') {
      return json(200, await store.listContents({ topic: query.topic || null }));
    }

    if (p === '/calendar' && m === 'GET') {
      return json(200, await store.calendarHeatmap({
        days: parseInt(query.days || '186', 10),
        tzOffset: query.tz_offset,
      }));
    }

    if (p === '/export.json' && m === 'GET') {
      const data = await buildExportJson();
      const fname = `all-for-one-${new Date().toISOString().slice(0, 10)}.json`;
      return {
        statusCode: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fname}"`,
          'Cache-Control': 'no-store',
        },
        body: data,
      };
    }

    return json(404, { error: 'unknown endpoint' });
  } catch (e) {
    console.error('function error:', e);
    return json(500, { error: e.message });
  }
};
