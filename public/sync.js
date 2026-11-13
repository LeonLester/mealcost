/* Optional sign-in and sync. Without signing in, nothing here talks to a server. */
(() => {
  'use strict';
  const KEYS = ['entries', 'prices', 'overrides', 'currency', 'budget', 'merges', 'nomerge', 'ranges', 'cats', 'recipes', 'meals', 'foods'];
  const LS = {
    get(k) { try { return localStorage.getItem('mcc.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('mcc.' + k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('mcc.' + k); } catch (e) { /* ignore */ } }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H = { 'x-requested-with': 'mealcost' };
  const NATIVE = !!(window.MealNative && MealNative.isNative);
  const ORIGIN = 'https://mealcost.coachleonidas.com';
  const token = () => LS.get('sync.token');
  const M = { ready: false, signed: false, email: '', rev: 0, status: 'idle', conflict: null, available: true, onchange: () => {} };
  let timer = null, busy = false;

  const base = () => Number(LS.get('sync.base')) || 0;
  const hasLocal = () => { try { return JSON.parse(LS.get('entries') || '[]').length > 0 || Object.keys(JSON.parse(LS.get('prices') || '{}')).length > 0; } catch (e) { return false; } };

  async function gz(text) { return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
  async function gunzip(buf) { return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
  const snapshot = () => { const o = {}; for (const k of KEYS) { const v = LS.get(k); if (v !== null) o[k] = v; } return JSON.stringify({ v: 1, data: o }); };

  function setStatus(s, notify) {
    M.status = s;
    const el = document.getElementById('syncstat'); if (el) el.textContent = M.statusText();
    if (notify) M.onchange();
  }
  M.statusText = () => ({ idle: 'Synced', syncing: 'Syncing', error: 'Could not sync, will retry', conflict: 'Needs your choice', off: '' }[M.status] || '');

  async function api(path, opts = {}) {
    if (NATIVE) {
      const t = token();
      return fetch(ORIGIN + path, { ...opts, headers: { ...H, ...(t ? { authorization: 'Bearer ' + t } : {}), ...(opts.headers || {}) } });
    }
    return fetch(path, { credentials: 'same-origin', ...opts, headers: { ...H, ...(opts.headers || {}) } });
  }

  async function push(force) {
    if (!M.signed || busy || M.conflict) return;
    busy = true; setStatus('syncing');
    try {
      const body = await gz(snapshot());
      const res = await api(`/api/sync?base=${force ? M.rev : base()}`, { method: 'PUT', body, headers: { 'content-type': 'application/octet-stream' } });
      if (res.ok) { const j = await res.json(); LS.set('sync.base', String(j.rev)); LS.del('sync.dirty'); M.rev = j.rev; setStatus('idle'); }
      else if (res.status === 409) { const j = await res.json(); M.rev = j.rev; M.conflict = { cloud: j.rev }; setStatus('conflict', true); }
      else if (res.status === 401) { M.signed = false; setStatus('off', true); }
      else setStatus('error');
    } catch (e) { setStatus('error'); }
    busy = false;
    if (M.status === 'error') { clearTimeout(timer); timer = setTimeout(() => push(), 15000); }
  }

  async function pull() {
    const res = await api('/api/sync');
    if (res.status === 204) return false;
    if (!res.ok) throw new Error('pull');
    const rev = Number(res.headers.get('x-rev'));
    const parsed = JSON.parse(await gunzip(await res.arrayBuffer()));
    for (const k of KEYS) { if (parsed.data && k in parsed.data) LS.set(k, parsed.data[k]); else LS.del(k); }
    LS.del('parser'); LS.set('sync.base', String(rev)); LS.del('sync.dirty');
    return true;
  }

  M.dirty = key => {
    if (!M.signed || !KEYS.includes(key)) return;
    LS.set('sync.dirty', '1');
    if (M.conflict) return;
    clearTimeout(timer); timer = setTimeout(() => push(), 1500);
  };

  M.useCloud = async () => { try { setStatus('syncing', true); if (await pull()) { window.__mcNoSave = true; location.reload(); } } catch (e) { setStatus('error', true); } };
  M.keepDevice = async () => { M.conflict = null; await push(true); M.onchange(); };
  M.syncNow = async () => { if (M.conflict) return; await push(); M.onchange(); };
  M.signOut = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* offline: forget the token anyway */ } LS.del('sync.token'); LS.del('sync.base'); LS.del('sync.dirty'); M.signed = false; M.email = ''; M.conflict = null; M.onchange(); };
  M.deleteCloud = async () => {
    if (!confirm('Delete your account and the data stored in the cloud? Data in this browser stays.')) return;
    await api('/api/account', { method: 'DELETE' });
    LS.del('sync.token'); LS.del('sync.base'); LS.del('sync.dirty'); M.signed = false; M.email = ''; M.conflict = null; M.onchange();
  };

  async function init() {
    if (NATIVE) watchLinks();
    const q = new URLSearchParams(location.search);
    if (q.get('signin')) {
      history.replaceState(null, '', location.pathname + location.hash);
      setTimeout(() => { if (window.toast) window.toast(q.get('signin') === 'cancelled' ? 'Sign-in was cancelled.' : 'Sign-in did not work. Please try again.'); }, 300);
    }
    try {
      const res = await api('/api/me');
      if (!res.ok) throw new Error('me');
      const me = await res.json();
      M.ready = true;
      if (!me.signed) { M.onchange(); return; }
      M.signed = true; M.email = me.email; M.rev = me.rev;
      const b = base();
      if (me.rev === 0) { if (hasLocal()) await push(); }
      else if (b === me.rev) { if (LS.get('sync.dirty')) await push(); }
      else if (!hasLocal()) { if (await pull()) { window.__mcNoSave = true; location.reload(); return; } }
      else { M.conflict = { cloud: me.rev }; M.status = 'conflict'; }
      if (!M.conflict) M.status = 'idle';
    } catch (e) { if (!NATIVE) M.available = false; M.ready = true; }
    M.onchange();
  }

  /* Pieces of UI, rendered by app.js */
  /* Android: Google blocks sign-in inside an app's WebView, so it opens in the browser and comes back by a link. */
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  M.signIn = async () => {
    if (!NATIVE) { location.href = '/auth/google'; return; }
    const verifier = b64u(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    LS.set('sync.pkce', verifier);
    await MealNative.openUrl(`${ORIGIN}/auth/google?app=1&c=${challenge}`);
  };
  async function finishApp(url) {
    const m = /[?&]code=([A-Za-z0-9_-]+)/.exec(url || ''); const verifier = LS.get('sync.pkce');
    if (!m || !verifier || !/signin/.test(url)) return;
    LS.del('sync.pkce');
    try { const P = window.Capacitor && Capacitor.Plugins; if (P && P.Browser && P.Browser.close) await P.Browser.close(); } catch (e) { /* already closed */ }
    try {
      const res = await fetch(ORIGIN + '/auth/app-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: m[1], verifier }) });
      if (!res.ok) throw new Error('exchange');
      LS.set('sync.token', (await res.json()).token); LS.del('sync.base');
      await init();
    } catch (e) { if (window.toast) window.toast('Sign-in did not work. Please try again.'); }
  }
  function watchLinks() {
    if (M._watching) return; M._watching = true;
    const A = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App; if (!A) return;
    if (A.addListener) A.addListener('appUrlOpen', e => finishApp(e && e.url));
    if (A.getLaunchUrl) A.getLaunchUrl().then(r => { if (r && r.url) finishApp(r.url); }).catch(() => {});
  }
  M.topHtml = () => !M.available ? '' : M.signed
    ? `<span class="muted syncpill" id="syncstat" aria-live="polite">${esc(M.statusText())}</span>`
    : M.ready ? `<a class="btn sm" href="/auth/google" data-sync="signin">Sign in</a>` : '';
  M.bannerHtml = () => M.conflict ? `<div class="notice" role="alert"><div><strong>Your saved data in the cloud is different from this browser.</strong> Use the cloud copy to replace what is here, or keep this browser and replace the cloud copy.
    <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn sm" data-sync="use-cloud">Use cloud data</button><button class="btn sm" data-sync="keep-device">Keep this browser</button></div></div></div>` : '';
  M.cardHtml = () => {
    if (!M.available) return '';
    if (!M.signed) return `<div class="card" style="padding:24px"><h2 style="font-size:20px">Use it on every device</h2>
      <p class="muted" style="margin-top:8px;font-size:15px">Sign in with Google and your prices and logs follow you to your phone and laptop. Signing in is optional. Without it, everything stays in this browser.</p>
      <a class="btn primary" style="margin-top:14px;display:inline-flex" href="/auth/google" data-sync="signin">Sign in with Google</a></div>`;
    return `<div class="card" style="padding:24px"><h2 style="font-size:20px">Synced across devices</h2>
      <p class="muted" style="margin-top:8px;font-size:15px">Signed in as ${esc(M.email)}. Changes are saved to your account a moment after you make them. <span id="syncstat" aria-live="polite">${esc(M.statusText())}</span></p>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn sm" data-sync="now">Sync now</button><button class="btn sm" data-sync="out">Sign out</button></div>
      <button class="btn link" style="margin-top:8px" data-sync="delete">Delete my account and cloud data</button></div>`;
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sync]'); if (!b) return;
    const a = b.dataset.sync;
    if (a === 'signin') { if (NATIVE) { e.preventDefault(); M.signIn().catch(() => {}); } return; }
    if (a === 'use-cloud') M.useCloud(); else if (a === 'keep-device') M.keepDevice(); else if (a === 'now') M.syncNow(); else if (a === 'out') M.signOut(); else if (a === 'delete') M.deleteCloud();
  });
  window.MealSync = M;
  M.init = init;
})();
