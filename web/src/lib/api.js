const tz = () => new Date().getTimezoneOffset();

async function j(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 204) return null;
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch {}
    throw new Error(`${r.status} ${r.statusText}${detail ? ': ' + detail : ''}`);
  }
  return r.json();
}

export const api = {
  entries(opts = {}) {
    const p = new URLSearchParams();
    if (opts.topic)       p.set('topic', opts.topic);
    if (opts.content)     p.set('content', opts.content);
    if (opts.resource_id) p.set('resource_id', String(opts.resource_id));
    if (opts.date)        p.set('date', opts.date);
    p.set('tz_offset', String(tz()));
    p.set('limit', String(opts.limit || 50));
    return j('GET', `/api/entries?${p}`);
  },
  addEntry(payload) { return j('POST', '/api/entries', payload); },

  resources(opts = {}) {
    const p = new URLSearchParams();
    if (opts.status)  p.set('status', opts.status);
    if (opts.topic)   p.set('topic', opts.topic);
    if (opts.content) p.set('content', opts.content);
    return j('GET', `/api/resources?${p}`);
  },
  addResource(payload)        { return j('POST',   '/api/resources', payload); },
  updateResource(id, payload) { return j('PATCH', `/api/resources/${id}`, payload); },
  deleteResource(id)          { return j('DELETE',`/api/resources/${id}`); },

  topics:   () => j('GET', '/api/topics'),
  contents: (topic = null) => j('GET', `/api/contents${topic ? '?topic=' + encodeURIComponent(topic) : ''}`),

  calendar(days = 186) {
    const p = new URLSearchParams();
    p.set('days', String(days));
    p.set('tz_offset', String(tz()));
    return j('GET', `/api/calendar?${p}`);
  },

  exportUrl: () => '/api/export.json',
};
