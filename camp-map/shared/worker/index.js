const allowedIds = new Set([...Array.from({length: 16}, (_, i) => String(i + 1)), 'cabin', 'military', 'lounge1', 'lounge2', 'lounge3', 'lounge4']);
const headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400'};
function json(data, status = 200) { return new Response(JSON.stringify(data), {status, headers}); }
function validate(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 22) throw Error('資料數量錯誤');
  const seen = new Set();
  return changes.map(row => {
    if (!row || !allowedIds.has(row.id) || seen.has(row.id) || typeof row.name !== 'string' ||
        !Number.isSafeInteger(row.version) || row.version < 0) throw Error('位置或版本格式錯誤');
    seen.add(row.id);
    const list = row.name.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    if (/^\d+$/.test(row.id) ? list.length > 1 || row.name.length > 40 : list.length > 10 || list.some(n => n.length > 40)) {
      throw Error('姓名超過字數或人數上限');
    }
    return {id: row.id, name: list.join('\n'), version: row.version};
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (url.pathname === '/') return new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>露營區共用名單</title><body style="font:18px system-ui;background:#f5f5ee;color:#365b42;padding:48px"><h1>露營區共用名單</h1><p>名單儲存服務已啟用。</p><a href="https://shaochun.lu/translator/camp-map/">開啟營區地圖 →</a></body></html>', {headers: {'Content-Type': 'text/html; charset=utf-8'}});
    if (url.pathname !== '/api/entries') return json({error: '找不到此路徑'}, 404);
    if (!env.DB) return json({error: '共用資料庫尚未連接'}, 503);
    try {
      if (request.method === 'GET') {
        const {results} = await env.DB.prepare('SELECT id, name, revision FROM entries').all();
        const names = {}, versions = {};
        for (const row of results) { names[row.id] = row.name; versions[row.id] = row.revision; }
        return json({names, versions});
      }
      if (request.method !== 'PUT') return json({error: '不支援的操作'}, 405);
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({error: '請使用 JSON 格式'}, 415);
      const body = await request.text();
      if (body.length > 20000) return json({error: '資料過大'}, 413);
      let changes;
      try { changes = validate(JSON.parse(body).changes); }
      catch (error) { return json({error: error.message}, 400); }
      // One SQLite statement makes bulk imports / clears atomic. All expected
      // revisions must match before any row can change, including new rows.
      const statement = `WITH changes AS (
        SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.name') AS name,
          json_extract(value, '$.version') AS version FROM json_each(?)
      )
      INSERT INTO entries (id, name, revision, updated_at)
      SELECT id, name, 1, ? FROM changes
      WHERE NOT EXISTS (
        SELECT 1 FROM changes c LEFT JOIN entries e ON e.id = c.id
        WHERE COALESCE(e.revision, 0) != c.version
      )
      ON CONFLICT(id) DO UPDATE SET name = excluded.name,
        revision = entries.revision + 1, updated_at = excluded.updated_at
      RETURNING id, name, revision`;
      const {results} = await env.DB.prepare(statement).bind(JSON.stringify(changes), new Date().toISOString()).all();
      if (results.length !== changes.length) return json({error: '名單已被其他人修改，請重新載入'}, 409);
      return json({entries: results});
    } catch (error) {
      console.error('Shared roster request failed:', error.message);
      return json({error: '共用名單暫時無法使用，請稍後重試'}, 503);
    }
  },
};
