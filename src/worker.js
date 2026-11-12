// Meal cost v2 backend: Google sign-in and one synced snapshot per user.
// Static files are served by the assets binding; only /auth/* and /api/* reach this code.

const SESSION_DAYS = 30;
const MAX_BODY = 1_800_000; // D1 rows are limited to 2 MB
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function setCookie(url, name, value, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function sessionUser(req, env) {
  const tok = cookies(req).mc_s;
  if (!tok) return null;
  const row = await env.DB.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ?')
    .bind(await sha256(tok), Date.now()).first();
  return row || null;
}

// Browsers send Origin on cross-site writes. Require the same host and a custom header.
function sameSiteWrite(req, url) {
  const origin = req.headers.get('origin');
  if (origin) { const h = new URL(origin).host; if (h !== url.host && h !== new URL(req.url).host) return false; }
  return req.headers.get('x-requested-with') === 'mealcost';
}

function googleUrls(env) {
  return {
    auth: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  };
}

async function startLogin(req, env, url) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response('Google sign-in is not configured.', { status: 503 });
  const state = rand(), verifier = rand(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.PUBLIC_ORIGIN || url.origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: { location: `${googleUrls(env).auth}?${q}`, 'set-cookie': setCookie(url, 'mc_o', `${state}.${verifier}`, 600), 'cache-control': 'no-store' },
  });
}

function jwtPayload(idToken) {
  const part = String(idToken).split('.')[1];
  if (!part) throw new Error('bad token');
  const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

async function finishLogin(req, env, url) {
  const fail = (why) => new Response(null, { status: 302, headers: { location: `/?signin=${why}`, 'set-cookie': setCookie(url, 'mc_o', '', 0) } });
  if (url.searchParams.get('error')) return fail('cancelled');
  const saved = (cookies(req).mc_o || '').split('.');
  const [state, verifier] = saved;
  if (!state || !verifier || state !== url.searchParams.get('state')) return fail('state');
  const code = url.searchParams.get('code');
  if (!code) return fail('code');
  const res = await fetch(googleUrls(env).token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.PUBLIC_ORIGIN || url.origin}/auth/google/callback`, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  if (!res.ok) return fail('google');
  let claims;
  try { claims = jwtPayload((await res.json()).id_token); } catch { return fail('token'); }
  // The token came straight from Google over TLS, so we check the claims, not the signature.
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com' || !!env.GOOGLE_TOKEN_URL;
  if (!issOk || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub || !claims.email || claims.email_verified === false || claims.exp * 1000 < Date.now()) return fail('claims');

  let user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)').bind(user.id, claims.sub, claims.email, Date.now()).run();
  } else {
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(claims.email, user.id).run();
  }
  const token = rand(32);
  await env.DB.prepare('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), user.id, Date.now() + SESSION_DAYS * 864e5).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  const headers = new Headers({ location: '/#prices', 'cache-control': 'no-store' });
  headers.append('set-cookie', setCookie(url, 'mc_s', token, SESSION_DAYS * 86400));
  headers.append('set-cookie', setCookie(url, 'mc_o', '', 0));
  return new Response(null, { status: 302, headers });
}

async function api(req, env, url) {
  const user = await sessionUser(req, env);
  const path = url.pathname;
  if (path === '/api/me' && req.method === 'GET') {
    if (!user) return json({ signed: false });
    const row = await env.DB.prepare('SELECT rev, updated_at FROM sync WHERE user_id = ?').bind(user.id).first();
    return json({ signed: true, email: user.email, rev: row ? row.rev : 0, updated: row ? row.updated_at : null });
  }
  if (!user) return json({ error: 'sign_in' }, 401);

  if (path === '/api/sync' && req.method === 'GET') {
    const row = await env.DB.prepare('SELECT rev, data FROM sync WHERE user_id = ?').bind(user.id).first();
    if (!row) return new Response(null, { status: 204, headers: { 'x-rev': '0', 'cache-control': 'no-store' } });
    return new Response(new Uint8Array(row.data), { headers: { 'content-type': 'application/octet-stream', 'x-rev': String(row.rev), 'cache-control': 'no-store' } });
  }
  if (!sameSiteWrite(req, url)) return json({ error: 'forbidden' }, 403);

  if (path === '/api/sync' && req.method === 'PUT') {
    const base = Number(url.searchParams.get('base'));
    if (!Number.isInteger(base) || base < 0) return json({ error: 'bad_base' }, 400);
    const body = new Uint8Array(await req.arrayBuffer());
    if (!body.length) return json({ error: 'empty' }, 400);
    if (body.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    const now = Date.now();
    let changed;
    if (base === 0) {
      changed = (await env.DB.prepare('INSERT INTO sync (user_id, rev, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING').bind(user.id, body, now).run()).meta.changes;
    } else {
      changed = (await env.DB.prepare('UPDATE sync SET rev = rev + 1, data = ?, updated_at = ? WHERE user_id = ? AND rev = ?').bind(body, now, user.id, base).run()).meta.changes;
    }
    if (!changed) {
      const cur = await env.DB.prepare('SELECT rev FROM sync WHERE user_id = ?').bind(user.id).first();
      return json({ error: 'conflict', rev: cur ? cur.rev : 0 }, 409);
    }
    return json({ rev: base + 1 });
  }
  if (path === '/api/sync' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sync WHERE user_id = ?').bind(user.id).run();
    return json({ ok: true });
  }
  if (path === '/api/account' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    return json({ ok: true }, 200, { 'set-cookie': setCookie(url, 'mc_s', '', 0) });
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env) {
    let url = new URL(req.url);
    if (env.PUBLIC_ORIGIN) { const o = new URL(env.PUBLIC_ORIGIN); url.protocol = o.protocol; url.host = o.host; }
    try {
      if (url.pathname === '/auth/google' && req.method === 'GET') return await startLogin(req, env, url);
      if (url.pathname === '/auth/google/callback' && req.method === 'GET') return await finishLogin(req, env, url);
      if (url.pathname === '/auth/logout' && req.method === 'POST') {
        if (!sameSiteWrite(req, url)) return json({ error: 'forbidden' }, 403);
        const tok = cookies(req).mc_s;
        if (tok) await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha256(tok)).run();
        return json({ ok: true }, 200, { 'set-cookie': setCookie(url, 'mc_s', '', 0) });
      }
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
    } catch (e) {
      return json({ error: 'server' }, 500);
    }
    return env.ASSETS.fetch(req);
  },
};
