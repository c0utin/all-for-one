import db from './db.js';

const num = (v) => v == null ? null : Number(v);

const norm = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function tzModifier(offsetMinutes) {
  const n = parseInt(offsetMinutes, 10);
  if (!Number.isFinite(n) || Math.abs(n) > 840) return '';
  const mod = -n;
  const sign = mod >= 0 ? '+' : '-';
  return `, '${sign}${Math.abs(mod)} minutes'`;
}

export async function addEntry({
  kind = 'log',
  topic = null,
  content = null,
  resourceId = null,
  text = '',
  tags = [],
  source = 'web',
}) {
  const r = await db.execute({
    sql: `INSERT INTO entries (kind, topic, content, resource_id, text, tags, source)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [kind, norm(topic), norm(content), resourceId, text, (tags || []).join(','), source],
  });
  return num(r.lastInsertRowid);
}

export async function addResource({
  topic, content = null, kind, name,
  unit = null, total = null,
}) {
  const r = await db.execute({
    sql: `INSERT INTO resources (topic, content, kind, name, unit, total, status, started_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
    args: [norm(topic), norm(content), kind, name, norm(unit), total == null ? null : Number(total)],
  });
  const id = num(r.lastInsertRowid);
  await addEntry({
    kind: 'start', topic, content, resourceId: id,
    text: `started ${kind}: ${name}`,
  });
  return await getResource(id);
}

export async function getResource(id) {
  const r = await db.execute({
    sql: `SELECT * FROM resources WHERE id = ?`,
    args: [id],
  });
  return r.rows[0] || null;
}

export async function updateResource(id, fields) {
  const existing = await getResource(id);
  if (!existing) return null;

  const allowed = ['topic','content','kind','name','unit','total','position','status'];
  const sets = [];
  const args = [];
  for (const k of allowed) {
    if (k in fields) {
      sets.push(`${k} = ?`);
      args.push(k === 'total' || k === 'position'
        ? (fields[k] == null ? null : Number(fields[k]))
        : (typeof fields[k] === 'string' ? norm(fields[k]) : fields[k]));
    }
  }
  if (fields.status === 'done') {
    sets.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
    if (existing.total != null) {
      sets.push(`position = total`);
    }
  }
  if (fields.status === 'active' && existing.started_at == null) {
    sets.push(`started_at = datetime('now')`);
  }
  if (sets.length === 0) return existing;

  args.push(id);
  await db.execute({
    sql: `UPDATE resources SET ${sets.join(', ')} WHERE id = ?`,
    args,
  });

  const updated = await getResource(id);

  if ('position' in fields && fields.position != null && Number(fields.position) !== existing.position) {
    await addEntry({
      kind: 'progress',
      topic: updated.topic,
      content: updated.content,
      resourceId: id,
      text: `${existing.position} -> ${updated.position}${updated.unit ? ' ' + updated.unit : ''}${updated.total ? ' / ' + updated.total : ''}`,
    });
  }
  if (fields.status === 'done' && existing.status !== 'done') {
    await addEntry({
      kind: 'done',
      topic: updated.topic, content: updated.content, resourceId: id,
      text: `done: ${updated.name}`,
    });
  }

  return updated;
}

export async function deleteResource(id) {
  await db.execute({ sql: `DELETE FROM resources WHERE id = ?`, args: [id] });
}

export async function listResources({ status = null, topic = null, content = null } = {}) {
  const where = [];
  const args = [];
  if (status)  { where.push('status = ?');  args.push(status); }
  if (topic)   { where.push('topic = ?');   args.push(topic); }
  if (content) { where.push('content = ?'); args.push(content); }
  const sql = `SELECT * FROM resources
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY status, created_at DESC`;
  const r = await db.execute({ sql, args });
  return r.rows;
}

export async function listEntries({ topic = null, content = null, resourceId = null, date = null, tzOffset = null, limit = 50 } = {}) {
  const mod = tzModifier(tzOffset);
  const where = [];
  const args = [];
  if (topic)      { where.push('e.topic = ?');       args.push(topic); }
  if (content)    { where.push('e.content = ?');     args.push(content); }
  if (resourceId) { where.push('e.resource_id = ?'); args.push(resourceId); }
  if (date)       { where.push(`date(e.ts ${mod}) = ?`); args.push(date); }
  const sql = `SELECT e.*, r.name AS resource_name, r.kind AS resource_kind
                 FROM entries e
                 LEFT JOIN resources r ON r.id = e.resource_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY e.ts DESC LIMIT ?`;
  args.push(limit);
  const r = await db.execute({ sql, args });
  return r.rows;
}

export async function listTopics() {
  const r = await db.execute({
    sql: `SELECT topic, COUNT(*) AS n FROM (
            SELECT topic FROM entries   WHERE topic IS NOT NULL AND topic != ''
            UNION ALL
            SELECT topic FROM resources WHERE topic IS NOT NULL AND topic != ''
          )
          GROUP BY topic ORDER BY n DESC, topic ASC`,
    args: [],
  });
  return r.rows;
}

export async function listContents({ topic = null } = {}) {
  const args = [];
  let sql = `SELECT topic, content, COUNT(*) AS n FROM (
               SELECT topic, content FROM entries   WHERE content IS NOT NULL AND content != ''
               UNION ALL
               SELECT topic, content FROM resources WHERE content IS NOT NULL AND content != ''
             )`;
  if (topic) { sql += ` WHERE topic = ?`; args.push(topic); }
  sql += ` GROUP BY topic, content ORDER BY topic, content`;
  const r = await db.execute({ sql, args });
  return r.rows;
}

export async function calendarHeatmap({ days = 186, tzOffset = null } = {}) {
  const d = Math.max(1, Math.min(366, parseInt(days, 10) || 186));
  const mod = tzModifier(tzOffset);
  const r = await db.execute({
    sql: `SELECT date(ts ${mod}) as day, COUNT(*) as n
            FROM entries
           WHERE date(ts ${mod}) >= date('now' ${mod}, '-${d} days')
           GROUP BY date(ts ${mod})
           ORDER BY day`,
    args: [],
  });
  return r.rows;
}
