/* Personal API tokens: read-only access to your own synced data for scripts and tools. Loaded before app.js. */
'use strict';

const TK = { list: null, err: '', loading: false, fresh: null };
const TK_SC = { diary: 'Food diary and daily goals', prices: 'Food prices and costs', weights: 'Weight log' };
async function tkLoad() {
  if (!(window.MealSync && MealSync.signed) || TK.loading) return;
  TK.loading = true;
  try { const res = await MealSync.api('/api/tokens'); const j = await res.json(); TK.list = res.ok ? j.tokens : []; TK.err = res.ok ? '' : 'Could not load your tokens.'; } catch (e) { TK.list = TK.list || []; TK.err = 'Could not load your tokens.'; }
  TK.loading = false; if (S.tab === 'account') render();
}
const tkDay = ts => ts ? new Date(ts).toISOString().slice(0, 10) : 'never';
function tokensCard() {
  if (!(window.MealSync && MealSync.signed)) return '';
  if (TK.list === null && !TK.loading) tkLoad();
  const rows = (TK.list || []).map(t => `<div class="co-share"><div><b>${esc(t.name)}</b><p class="muted" style="font-size:14px">Can read: ${Object.keys(TK_SC).filter(k => t.scopes[k]).map(k => TK_SC[k].toLowerCase()).join(', ') || 'nothing'}. Expires ${esc(tkDay(t.expires))}. Last used ${esc(tkDay(t.lastUsed))}.</p></div><div class="abtns"><button class="btn" data-tk="del" data-id="${esc(t.id)}" data-name="${esc(t.name)}">Revoke</button></div></div>`).join('');
  const fresh = TK.fresh ? `<div class="notice" style="margin-top:10px">${IC.info}<div><b>Copy your token now. It is shown only once.</b><div style="margin-top:6px"><code id="tkval" style="word-break:break-all">${esc(TK.fresh)}</code></div><div style="margin-top:8px"><button class="btn sm" data-tk="copy">Copy</button> <button class="btn sm" data-tk="hide">Done</button></div></div></div>` : '';
  return `<section class="card pad"><h2>API tokens</h2>
    <p class="muted" style="margin-top:8px">A token lets a script or another tool read your synced data. It cannot change anything, and you choose what it can see. Send it as <code>Authorization: Bearer TOKEN</code> to <code>/api/v1/data</code>.</p>
    ${TK.err ? `<p style="margin-top:8px">${esc(TK.err)}</p>` : ''}${fresh}
    <div class="co-shares">${rows}</div>
    <form id="tkform" style="margin-top:12px" novalidate>
      <label for="tkn">Name</label><input class="field" id="tkn" maxlength="60" placeholder="For example Home dashboard" autocomplete="off" style="width:100%">
      <fieldset class="co-scopes" style="margin-top:8px"><legend class="sr">What the token can read</legend>${Object.entries(TK_SC).map(([k, v]) => `<label class="cmp" style="margin:0"><input type="checkbox" data-tk-scope="${k}" checked><span>${v}</span></label>`).join('')}</fieldset>
      <label for="tkd" style="margin-top:8px">Expires after</label><select class="field" id="tkd"><option value="30">30 days</option><option value="90" selected>90 days</option><option value="365">1 year</option></select>
      <div class="abtns" style="margin-top:10px"><button type="submit" class="btn primary">Create token</button></div>
    </form></section>`;
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'tkform') return;
  e.preventDefault();
  const name = $('#tkn').value.trim(); if (!name) { toast('Give the token a name.'); return; }
  const scopes = {}; document.querySelectorAll('[data-tk-scope]').forEach(c => { scopes[c.dataset.tkScope] = c.checked; });
  if (!Object.values(scopes).some(Boolean)) { toast('Choose at least one thing it can read.'); return; }
  try {
    const res = await MealSync.api('/api/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, scopes, days: Number($('#tkd').value) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error === 'too_many_tokens' ? 'You have 10 tokens. Revoke one first.' : 'Could not create the token.'); return; }
    TK.fresh = j.token; TK.list = null; render();
  } catch (err) { toast('Could not create the token.'); }
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tk]'); if (!t) return;
  if (t.dataset.tk === 'copy') { try { await navigator.clipboard.writeText(TK.fresh || ''); toast('Copied'); } catch (err) { toast('Select the token and copy it.'); } }
  else if (t.dataset.tk === 'hide') { TK.fresh = null; render(); }
  else if (t.dataset.tk === 'del' && confirm(`Revoke "${t.dataset.name}"? Anything using it stops working.`)) {
    try { const res = await MealSync.api('/api/tokens/' + t.dataset.id, { method: 'DELETE', headers: {} }); if (res.ok) { TK.list = null; toast('Token revoked'); render(); } else toast('Could not revoke the token.'); } catch (err) { toast('Could not revoke the token.'); }
  }
});
