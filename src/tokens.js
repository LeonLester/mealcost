// Personal API tokens. A token gives read-only access to the owner's own synced data, limited to the scopes picked when it was made.
//  - Tokens are made, listed and revoked only from a signed-in session. A token can never make or list tokens.
//  - Only a SHA-256 hash is stored. The token is shown once, when it is created.
//  - Tokens expire (default 90 days, at most 365), are limited to 60 requests a minute, and go when the account is deleted.
import { readSnapshot, cleanScopes } from './coach.js';

const MAX_TOKENS = 10;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>`{}\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function tokenManage(req, env, url, user, h) {
  const path = url.pathname, method = req.method, json = h.json;
  if (path !== '/api/tokens' && !/^\/api\/tokens\/[0-9a-f-]{36}$/.test(path)) return null;
  if (method !== 'GET' && !h.sameSiteWrite(req, url)) return json({ error: 'forbidden' }, 403);
  if (path === '/api/tokens' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, name, scopes, created_at, expires_at, last_used FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ tokens: results.map((t) => ({ id: t.id, name: t.name, scopes: cleanScopes(JSON.parse(t.scopes)), created: t.created_at, expires: t.expires_at, lastUsed: t.last_used })) });
  }
  if (path === '/api/tokens' && method === 'POST') {
    if (await h.limited(env, `tkw:${user.id}`, 20, 3600)) return h.tooMany(3600);
    const b = await req.json().catch(() => null);
    const name = clean(b && b.name, 60);
    if (!name) return json({ error: 'bad_request' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?').bind(user.id).first();
    if (n && n.n >= MAX_TOKENS) return json({ error: 'too_many_tokens' }, 409);
    const scopes = cleanScopes(b.scopes), days = Math.min(365, Math.max(1, Math.round(Number(b.days)) || 90));
    const id = crypto.randomUUID(), token = 'mct_' + h.rand(32), now = Date.now();
    await env.DB.prepare('INSERT INTO api_tokens (id, user_id, name, hash, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, name, await h.sha256(`tok:${token}`), JSON.stringify(scopes), now, now + days * 864e5).run();
    return json({ id, token, expires: now + days * 864e5 });
  }
  const id = path.split('/').pop();
  if (method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  }
  return json({ error: 'not_found' }, 404);
}

// Read-only routes used with a token: Authorization: Bearer mct_...
export async function tokenApi(req, env, url, h) {
  const json = h.json;
  if (req.method !== 'GET') return json({ error: 'read_only' }, 405);
  const m = /^Bearer\s+(mct_[A-Za-z0-9_-]{20,80})$/.exec(req.headers.get('authorization') || '');
  if (!m) return json({ error: 'sign_in' }, 401);
  const t = await env.DB.prepare('SELECT t.id, t.user_id, t.name, t.scopes, t.expires_at FROM api_tokens t WHERE t.hash = ?').bind(await h.sha256(`tok:${m[1]}`)).first();
  if (!t || (t.expires_at && t.expires_at < Date.now())) return json({ error: 'sign_in' }, 401);
  if (await h.limited(env, `tk:${t.id}`, 60, 60)) return h.tooMany(60);
  const scopes = cleanScopes(JSON.parse(t.scopes));
  await env.DB.prepare('UPDATE api_tokens SET last_used = ? WHERE id = ?').bind(Date.now(), t.id).run();
  if (url.pathname === '/api/v1/me') return json({ name: t.name, scopes, expires: t.expires_at });
  if (url.pathname === '/api/v1/data') {
    try { const r = await readSnapshot(env, t.user_id, scopes); return json({ scopes, rev: r.rev, updated: r.updated, data: r.data }, 200, { 'cache-control': 'no-store' }); }
    catch { return json({ error: 'unreadable' }, 422); }
  }
  return json({ error: 'not_found' }, 404);
}
