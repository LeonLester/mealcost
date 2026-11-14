// Coach and client sharing routes. Every route here is reached only after the caller has a valid session.
//
// Access rules (the only place they are decided):
//  - A coach route needs users.coach = 1 (or an admin) AND coach_clients.coach_id = the caller. A coach never reaches another coach's rows.
//  - A coach reads a linked client's live data only while status = 'active'. The worker returns only the keys the client's scopes allow.
//  - A client can see, change the scopes of, and revoke only rows where client_user_id = the caller.
//  - Revoking, or deleting the client's account, ends the coach's access at once. Notes and targets stay with the coach.
//  - Invite tokens are random, stored only as a SHA-256 hash, valid for 14 days, and used once.

const INVITE_DAYS = 14;
const MAX_CLIENTS = 200;
const MAX_PROFILE = 1_800_000;
const MAX_JSON = 40_000_000;
const KEEP_AUDIT_DAYS = 400;

// Keys of the sync snapshot that a profile can hold, and which scope each live key belongs to.
const ALL_KEYS = ['entries', 'prices', 'overrides', 'currency', 'budget', 'merges', 'nomerge', 'ranges', 'cats', 'recipes', 'foods', 'goals', 'weights', 'wunit'];
const SCOPE_KEYS = {
  diary: ['entries', 'goals', 'foods', 'recipes', 'merges', 'nomerge', 'cats', 'currency'],
  prices: ['prices', 'overrides', 'ranges', 'budget'],
  weights: ['weights', 'wunit'],
};
const DEFAULT_SCOPES = { diary: true, prices: true, weights: true };

export const canCoach = (user, env, isAdmin) => !!user && (isAdmin(user, env) || user.coach === 1);

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>`{}\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanEmail = (v) => { const s = clean(v, 120).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : ''; };

function cleanScopes(s) {
  const o = s && typeof s === 'object' ? s : {};
  return { diary: o.diary !== false, prices: o.prices !== false, weights: o.weights !== false };
}
const parseScopes = (raw) => { try { return cleanScopes(JSON.parse(raw)); } catch { return { ...DEFAULT_SCOPES }; } };

// Targets the coach sets for a client. Same shape as the app's goals, with a short note.
function cleanTargets(t) {
  if (t == null) return null;
  if (typeof t !== 'object' || Array.isArray(t)) return undefined;
  const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : 0; };
  const out = { kcal: n(t.kcal, 20000), pro: n(t.pro, 1500), carb: n(t.carb, 3000), fat: n(t.fat, 1500), fiber: n(t.fiber, 500), x: {}, note: clean(t.note, 500) };
  if (!(out.kcal > 0)) return undefined;
  const gx = t.x && typeof t.x === 'object' ? t.x : {};
  for (const k of Object.keys(gx).slice(0, 40)) { if (/^[A-Za-z0-9]{1,12}$/.test(k)) { const v = n(gx[k], 1e6); if (v > 0) out.x[k] = v; } }
  return out;
}

async function gunzipText(buf, max = MAX_JSON) {
  const reader = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new Error('too_big'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all);
}
async function gzipText(text) {
  return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}

async function audit(env, actor, link, subject, action) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO audit (ts, actor_id, link_id, subject_id, action) VALUES (?, ?, ?, ?, ?)').bind(now, actor, link, subject || null, action).run();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM audit WHERE ts < ?').bind(now - KEEP_AUDIT_DAYS * 864e5).run();
}
// A read is logged at most once every 10 minutes per coach and client, so opening a screen twice is one line.
async function auditRead(env, actor, link, subject) {
  const now = Date.now();
  const r = await env.DB.prepare("INSERT INTO audit (ts, actor_id, link_id, subject_id, action) SELECT ?, ?, ?, ?, 'read' WHERE NOT EXISTS (SELECT 1 FROM audit WHERE link_id = ? AND action = 'read' AND ts > ?)")
    .bind(now, actor, link, subject || null, link, now - 600000).run();
  return r.meta.changes;
}

const SELECT_ROW = 'SELECT id, coach_id, name, email, status, client_user_id, scopes, targets, consented_at, revoked_at, created_at FROM coach_clients';
async function ownClient(env, user, id) {
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return null;
  return env.DB.prepare(`${SELECT_ROW} WHERE id = ? AND coach_id = ?`).bind(id, user.id).first();
}

function shapeClient(c) {
  return {
    id: c.id, name: c.name, email: c.email, status: c.status, scopes: parseScopes(c.scopes),
    targets: c.targets ? JSON.parse(c.targets) : null, consented: c.consented_at || null, revoked: c.revoked_at || null, created: c.created_at,
    clientEmail: c.cemail || null, dataUpdated: (c.status === 'active' ? c.sdata : c.pdata) || null, profileUpdated: c.pdata || null, inviteExp: c.invite_exp || null,
  };
}

export async function coachApi(req, env, url, user, h) {
  const path = url.pathname, method = req.method;
  const isCoachPath = path.startsWith('/api/coach/'), isSharing = path === '/api/sharing' || path.startsWith('/api/sharing/');
  if (!isCoachPath && !isSharing) return null;
  const json = h.json;
  const write = method !== 'GET';
  if (write && !h.sameSiteWrite(req, url)) return json({ error: 'forbidden' }, 403);

  // ---------- the client side: invitations, what is shared, revoking ----------
  let m;
  if ((m = /^\/api\/coach\/invite\/([A-Za-z0-9_-]{20,64})$/.exec(path))) {
    if (await h.ipLimited(req, env, 'inv', 30, 600)) return h.tooMany(600);
    const hash = await h.sha256(`inv:${m[1]}`);
    const row = await env.DB.prepare('SELECT c.id, c.coach_id, c.name, c.status, c.scopes, c.invite_exp, u.email AS coach_email FROM coach_clients c JOIN users u ON u.id = c.coach_id WHERE c.invite_hash = ?').bind(hash).first();
    if (!row || row.invite_exp < Date.now() || row.status === 'active') return json({ error: 'invalid_invite' }, 404);
    if (method === 'GET') return json({ coach: row.coach_email, name: row.name, scopes: parseScopes(row.scopes), own: row.coach_id === user.id });
    if (method === 'POST') {
      if (row.coach_id === user.id) return json({ error: 'own_invite' }, 400);
      const b = await req.json().catch(() => null);
      if (!b || b.consent !== true) return json({ error: 'consent_required' }, 400);
      const dup = await env.DB.prepare("SELECT id FROM coach_clients WHERE coach_id = ? AND client_user_id = ? AND status = 'active'").bind(row.coach_id, user.id).first();
      if (dup) return json({ error: 'already_linked' }, 409);
      const asked = parseScopes(row.scopes), given = cleanScopes(b.scopes || asked);
      const scopes = { diary: asked.diary && given.diary, prices: asked.prices && given.prices, weights: asked.weights && given.weights };
      const r = await env.DB.prepare("UPDATE coach_clients SET status = 'active', client_user_id = ?, scopes = ?, consented_at = ?, revoked_at = NULL, invite_hash = NULL, invite_exp = NULL WHERE id = ? AND invite_hash = ?")
        .bind(user.id, JSON.stringify(scopes), Date.now(), row.id, hash).run();
      if (!r.meta.changes) return json({ error: 'invalid_invite' }, 404);
      await audit(env, user.id, row.id, user.id, 'accept');
      return json({ ok: true, coach: row.coach_email });
    }
    return json({ error: 'not_found' }, 404);
  }

  if (path === '/api/sharing' && method === 'GET') {
    const { results } = await env.DB.prepare("SELECT c.id, c.scopes, c.targets, c.consented_at, u.email AS coach_email FROM coach_clients c JOIN users u ON u.id = c.coach_id WHERE c.client_user_id = ? AND c.status = 'active' ORDER BY c.consented_at DESC").bind(user.id).all();
    const out = [];
    for (const r of results) {
      const log = await env.DB.prepare("SELECT ts, action FROM audit WHERE link_id = ? AND action IN ('read', 'accept') ORDER BY ts DESC LIMIT 8").bind(r.id).all();
      out.push({ id: r.id, coach: r.coach_email, scopes: parseScopes(r.scopes), targets: r.targets ? JSON.parse(r.targets) : null, since: r.consented_at, access: log.results.map((x) => ({ ts: x.ts, action: x.action })) });
    }
    return json({ links: out });
  }
  if ((m = /^\/api\/sharing\/([0-9a-f-]{36})$/.exec(path))) {
    const row = await env.DB.prepare("SELECT id FROM coach_clients WHERE id = ? AND client_user_id = ? AND status = 'active'").bind(m[1], user.id).first();
    if (!row) return json({ error: 'not_found' }, 404);
    if (method === 'PUT') {
      const b = await req.json().catch(() => null);
      if (!b || typeof b.scopes !== 'object') return json({ error: 'bad_request' }, 400);
      await env.DB.prepare('UPDATE coach_clients SET scopes = ? WHERE id = ?').bind(JSON.stringify(cleanScopes(b.scopes)), row.id).run();
      await audit(env, user.id, row.id, user.id, 'scopes');
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare("UPDATE coach_clients SET status = 'revoked', client_user_id = NULL, revoked_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
      await audit(env, user.id, row.id, user.id, 'revoke');
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  }

  // ---------- the coach side ----------
  if (!canCoach(user, env, h.isAdmin)) return json({ error: 'no_access' }, 403);
  if (write && await h.limited(env, `cw:${user.id}`, 120, 60)) return h.tooMany(60);

  if (path === '/api/coach/clients' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT c.id, c.name, c.email, c.status, c.scopes, c.targets, c.consented_at, c.revoked_at, c.invite_exp, c.created_at,
      (SELECT updated_at FROM coach_data d WHERE d.client_id = c.id) AS pdata,
      (SELECT updated_at FROM sync s WHERE s.user_id = c.client_user_id) AS sdata,
      (SELECT email FROM users x WHERE x.id = c.client_user_id) AS cemail
      FROM coach_clients c WHERE c.coach_id = ? ORDER BY c.name COLLATE NOCASE LIMIT ${MAX_CLIENTS}`).bind(user.id).all();
    return json({ clients: results.map(shapeClient) });
  }
  if (path === '/api/coach/clients' && method === 'POST') {
    const b = await req.json().catch(() => null);
    const name = clean(b && b.name, 80);
    if (!name) return json({ error: 'bad_request' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM coach_clients WHERE coach_id = ?').bind(user.id).first();
    if (n && n.n >= MAX_CLIENTS) return json({ error: 'too_many_clients' }, 409);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO coach_clients (id, coach_id, name, email, status, created_at) VALUES (?, ?, ?, ?, 'profile', ?)").bind(id, user.id, name, cleanEmail(b.email), Date.now()).run();
    await audit(env, user.id, id, null, 'client_create');
    return json({ id });
  }

  if ((m = /^\/api\/coach\/clients\/([0-9a-f-]{36})$/.exec(path))) {
    const c = await ownClient(env, user, m[1]);
    if (!c) return json({ error: 'not_found' }, 404);
    if (method === 'PUT') {
      const b = await req.json().catch(() => null);
      if (!b || typeof b !== 'object') return json({ error: 'bad_request' }, 400);
      const name = 'name' in b ? clean(b.name, 80) : c.name;
      if (!name) return json({ error: 'bad_request' }, 400);
      const email = 'email' in b ? cleanEmail(b.email) : c.email;
      let targets = c.targets;
      if ('targets' in b) {
        const t = cleanTargets(b.targets);
        if (t === undefined) return json({ error: 'bad_targets' }, 400);
        targets = t ? JSON.stringify(t) : null;
      }
      await env.DB.prepare('UPDATE coach_clients SET name = ?, email = ?, targets = ? WHERE id = ?').bind(name, email, targets, c.id).run();
      if ('targets' in b) await audit(env, user.id, c.id, c.client_user_id, 'targets');
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM coach_clients WHERE id = ?').bind(c.id).run();
      await audit(env, user.id, c.id, c.client_user_id, 'client_delete');
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  }

  if ((m = /^\/api\/coach\/clients\/([0-9a-f-]{36})\/invite$/.exec(path)) && method === 'POST') {
    const c = await ownClient(env, user, m[1]);
    if (!c) return json({ error: 'not_found' }, 404);
    if (c.status === 'active') return json({ error: 'already_linked' }, 409);
    const b = await req.json().catch(() => ({}));
    const token = h.rand(32);
    const scopes = cleanScopes(b && b.scopes);
    await env.DB.prepare("UPDATE coach_clients SET status = 'invited', invite_hash = ?, invite_exp = ?, scopes = ? WHERE id = ?")
      .bind(await h.sha256(`inv:${token}`), Date.now() + INVITE_DAYS * 864e5, JSON.stringify(scopes), c.id).run();
    await audit(env, user.id, c.id, null, 'invite');
    return json({ token, days: INVITE_DAYS });
  }

  if ((m = /^\/api\/coach\/clients\/([0-9a-f-]{36})\/data$/.exec(path))) {
    const c = await ownClient(env, user, m[1]);
    if (!c) return json({ error: 'not_found' }, 404);
    if (method === 'GET') {
      if (await h.limited(env, `cr:${user.id}`, 120, 60)) return h.tooMany(60);
      let row, scopes = null;
      if (c.status === 'active' && c.client_user_id) {
        row = await env.DB.prepare('SELECT rev, data, updated_at FROM sync WHERE user_id = ?').bind(c.client_user_id).first();
        scopes = parseScopes(c.scopes);
      } else {
        row = await env.DB.prepare('SELECT rev, data, updated_at FROM coach_data WHERE client_id = ?').bind(c.id).first();
      }
      if (c.status === 'active') await auditRead(env, user.id, c.id, c.client_user_id);
      const mode = scopes ? 'live' : 'profile';
      if (!row) return json({ mode, scopes, rev: 0, updated: null, data: {} });
      let snap;
      try { snap = JSON.parse(await gunzipText(new Uint8Array(row.data))); } catch { return json({ error: 'unreadable' }, 422); }
      const src = snap && snap.data && typeof snap.data === 'object' ? snap.data : {};
      const keys = scopes ? Object.entries(SCOPE_KEYS).filter(([k]) => scopes[k]).flatMap(([, v]) => v) : ALL_KEYS;
      const data = {};
      for (const k of keys) if (typeof src[k] === 'string') data[k] = src[k];
      return json({ mode, scopes, rev: row.rev, updated: row.updated_at, data });
    }
    if (method === 'PUT') {
      if (c.status === 'active') return json({ error: 'linked' }, 409);
      const base = Number(url.searchParams.get('base'));
      if (!Number.isInteger(base) || base < 0) return json({ error: 'bad_base' }, 400);
      if (Number(req.headers.get('content-length')) > MAX_PROFILE) return json({ error: 'too_large' }, 413);
      const body = new Uint8Array(await req.arrayBuffer());
      if (!body.length || body.length > MAX_PROFILE) return json({ error: body.length ? 'too_large' : 'empty' }, body.length ? 413 : 400);
      let snap;
      try { snap = JSON.parse(await gunzipText(body)); } catch { return json({ error: 'bad_snapshot' }, 400); }
      if (!snap || snap.v !== 1 || !snap.data || typeof snap.data !== 'object') return json({ error: 'bad_snapshot' }, 400);
      const data = {};
      for (const k of ALL_KEYS) if (typeof snap.data[k] === 'string') data[k] = snap.data[k];
      const packed = await gzipText(JSON.stringify({ v: 1, data }));
      if (packed.length > MAX_PROFILE) return json({ error: 'too_large' }, 413);
      const now = Date.now();
      let changed;
      if (base === 0) changed = (await env.DB.prepare('INSERT INTO coach_data (client_id, rev, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(client_id) DO NOTHING').bind(c.id, packed, now).run()).meta.changes;
      else changed = (await env.DB.prepare('UPDATE coach_data SET rev = rev + 1, data = ?, updated_at = ? WHERE client_id = ? AND rev = ?').bind(packed, now, c.id, base).run()).meta.changes;
      if (!changed) { const cur = await env.DB.prepare('SELECT rev FROM coach_data WHERE client_id = ?').bind(c.id).first(); return json({ error: 'conflict', rev: cur ? cur.rev : 0 }, 409); }
      await audit(env, user.id, c.id, null, 'import');
      return json({ rev: base + 1 });
    }
    return json({ error: 'not_found' }, 404);
  }

  if ((m = /^\/api\/coach\/clients\/([0-9a-f-]{36})\/notes$/.exec(path))) {
    const c = await ownClient(env, user, m[1]);
    if (!c) return json({ error: 'not_found' }, 404);
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, body, created_at, updated_at FROM coach_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 200').bind(c.id).all();
      return json({ notes: results.map((n) => ({ id: n.id, body: n.body, created: n.created_at, updated: n.updated_at })) });
    }
    if (method === 'POST') {
      const b = await req.json().catch(() => null);
      const body = String(b && b.body || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000);
      if (!body) return json({ error: 'bad_request' }, 400);
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM coach_notes WHERE client_id = ?').bind(c.id).first();
      if (n && n.n >= 500) return json({ error: 'too_many_notes' }, 409);
      const id = crypto.randomUUID(), now = Date.now();
      await env.DB.prepare('INSERT INTO coach_notes (id, client_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, c.id, body, now, now).run();
      return json({ id, created: now });
    }
    return json({ error: 'not_found' }, 404);
  }
  if ((m = /^\/api\/coach\/notes\/([0-9a-f-]{36})$/.exec(path))) {
    const n = await env.DB.prepare('SELECT n.id FROM coach_notes n JOIN coach_clients c ON c.id = n.client_id WHERE n.id = ? AND c.coach_id = ?').bind(m[1], user.id).first();
    if (!n) return json({ error: 'not_found' }, 404);
    if (method === 'PUT') {
      const b = await req.json().catch(() => null);
      const body = String(b && b.body || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000);
      if (!body) return json({ error: 'bad_request' }, 400);
      await env.DB.prepare('UPDATE coach_notes SET body = ?, updated_at = ? WHERE id = ?').bind(body, Date.now(), n.id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM coach_notes WHERE id = ?').bind(n.id).run(); return json({ ok: true }); }
    return json({ error: 'not_found' }, 404);
  }

  return json({ error: 'not_found' }, 404);
}
