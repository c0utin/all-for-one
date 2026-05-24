import db from './db.js';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(',')).join('\n');
  return header + '\n' + body + (rows.length ? '\n' : '');
}

function safeFilename(s) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export async function generateResourcesCsv() {
  const r = await db.execute({
    sql: `SELECT * FROM resources ORDER BY topic, content, created_at`,
    args: [],
  });
  const cols = ['id','topic','content','kind','name','unit','total','position','status','started_at','completed_at','created_at'];
  return toCsv(r.rows, cols);
}

export async function generateChangelogCsv() {
  const r = await db.execute({
    sql: `SELECT e.id, e.ts, e.kind, e.topic, e.content, e.text, e.tags, e.source,
                 r.name AS resource_name, r.kind AS resource_kind
            FROM entries e
            LEFT JOIN resources r ON r.id = e.resource_id
           ORDER BY e.ts`,
    args: [],
  });
  const cols = ['id','ts','kind','topic','content','resource_name','resource_kind','text','tags','source'];
  return toCsv(r.rows, cols);
}

export async function generateFlashcards() {
  const topicsRes = await db.execute({
    sql: `SELECT DISTINCT topic FROM (
            SELECT topic FROM entries   WHERE topic IS NOT NULL AND topic != ''
            UNION
            SELECT topic FROM resources WHERE topic IS NOT NULL AND topic != ''
          ) ORDER BY topic`,
    args: [],
  });
  const topics = topicsRes.rows.map(r => r.topic);

  const files = new Map();
  for (const topic of topics) {
    const resourcesRes = await db.execute({
      sql: `SELECT * FROM resources WHERE topic = ? ORDER BY content, name`,
      args: [topic],
    });
    const entriesRes = await db.execute({
      sql: `SELECT * FROM entries WHERE topic = ? ORDER BY ts`,
      args: [topic],
    });

    const byContent = new Map();
    for (const r of resourcesRes.rows) {
      const c = r.content || '(general)';
      if (!byContent.has(c)) byContent.set(c, { resources: [], entries: [] });
      byContent.get(c).resources.push(r);
    }
    for (const e of entriesRes.rows) {
      const c = e.content || '(general)';
      if (!byContent.has(c)) byContent.set(c, { resources: [], entries: [] });
      byContent.get(c).entries.push(e);
    }

    const lines = [`# ${topic}`, ''];
    for (const [content, group] of [...byContent.entries()].sort()) {
      lines.push(`## ${content}`);
      if (group.resources.length) {
        lines.push('### Resources');
        for (const r of group.resources) {
          const track = r.total
            ? `${r.position}/${r.total}${r.unit ? ' ' + r.unit : ''}`
            : (r.position ? `${r.position}${r.unit ? ' ' + r.unit : ''}` : '-');
          lines.push(`- **${r.name}** _(${r.kind})_ — ${r.status} · ${track}`);
        }
        lines.push('');
      }
      if (group.entries.length) {
        lines.push('### Changelog');
        for (const e of group.entries) {
          if (!e.text) continue;
          lines.push(`- [${(e.ts || '').slice(0, 10)}] (${e.kind}) ${e.text}`);
        }
        lines.push('');
      }
    }

    files.set(`${safeFilename(topic)}.md`, lines.join('\n'));
  }
  return files;
}

export async function buildExportJson() {
  const resourcesRes = await db.execute({
    sql: `SELECT * FROM resources ORDER BY topic, content, created_at`,
    args: [],
  });

  const changelogRes = await db.execute({
    sql: `SELECT e.id, e.ts, e.kind, e.topic, e.content, e.text, e.tags, e.source,
                 r.name AS resource_name, r.kind AS resource_kind
            FROM entries e
            LEFT JOIN resources r ON r.id = e.resource_id
           ORDER BY e.ts`,
    args: [],
  });

  const flashcards = await generateFlashcards();
  const flashcardsObj = Object.fromEntries(flashcards);

  const data = {
    meta: {
      exported_at: new Date().toISOString(),
      app: 'all-for-one',
    },
    resources: resourcesRes.rows,
    changelog: changelogRes.rows,
    flashcards: flashcardsObj,
  };

  return JSON.stringify(data, null, 2);
}
