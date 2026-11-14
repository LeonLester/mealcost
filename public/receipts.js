/* Receipt scanning (for users the admin has allowed) and the admin access page. Loaded before app.js. */
'use strict';

const RC = { busy: false, users: null, err: '' };
const rcOk = () => !!(window.MealSync && MealSync.signed && MealSync.receipts);

/* ---------- scan: pick a photo, shrink it, send it, review the lines ---------- */
function rcShrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
function rcBest(name) {
  const t = toks(name); if (!t.size) return '';
  let best = '', sc = 0;
  for (const n of IDX.meta.keys()) {
    const u = toks(n); let hit = 0; for (const x of t) if (u.has(x)) hit++;
    const s = hit / Math.max(t.size, u.size || 1);
    if (hit && s > sc) { sc = s; best = n; }
  }
  return sc >= 0.34 ? best : '';
}
// The price and "per" setting a food gets, from the unit printed on the receipt.
function rcPrice(it) {
  const q = it.qty || 1;
  // A tiny g or ml amount is a pack size read as a quantity (for example 55 ml), so price it per item.
  if ((it.unit === 'g' || it.unit === 'ml') && q < 10) return { price: r2(it.total / q), basis: 'unit' };
  if (it.unit === 'kg' || it.unit === 'l') return { price: r2(it.total / q), basis: 'kg' };
  if (it.unit === 'g' || it.unit === 'ml') return { price: r2(it.total / q * 1000), basis: 'kg' };
  return { price: r2(it.total / q), basis: 'unit' };
}
// What goes into the pantry for a receipt line. A pack size printed in the name (460 g) is used when the food is logged by weight.
function rcPantryAmount(it, food) {
  const m = IDX.meta.get(food) || { vol: 0, mass: 0, countFirst: false };
  if (it.unit === 'kg') return { qty: it.qty * 1000, unit: 'g' };
  if (it.unit === 'g') return { qty: it.qty, unit: 'g' };
  if (it.unit === 'l') return { qty: it.qty * 1000, unit: 'ml' };
  if (it.unit === 'ml') return { qty: it.qty, unit: 'ml' };
  const pack = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i.exec(it.name);
  if (pack && !m.countFirst) {
    const v = parseFloat(pack[1].replace(',', '.')), u = pack[2].toLowerCase();
    return u === 'kg' ? { qty: v * 1000 * it.qty, unit: 'g' } : u === 'l' ? { qty: v * 1000 * it.qty, unit: 'ml' } : { qty: v * it.qty, unit: u };
  }
  const gpu = Number((S.prices[food] || {}).gpu) || 0;
  if (!m.countFirst && gpu > 0) return { qty: it.qty * gpu, unit: m.vol > m.mass ? 'ml' : 'g' };
  return { qty: it.qty, unit: 'item' };
}
function rcDialog(r) {
  const dlg = $('#dlg'); dlg.classList.add('wide');
  const foods = [...IDX.meta.keys()].sort((a, b) => a.localeCompare(b));
  const rows = r.items.map((it, i) => {
    const g = rcBest(it.name), old = g && S.prices[g] && Number(S.prices[g].price) > 0 ? Number(S.prices[g].price) : 0, np = g ? rcPrice(it).price : 0;
    const odd = old > 0 && np > 0 && (np / old > 3 || np / old < 1 / 3);
    return `<tr data-i="${i}"><td><input type="checkbox" data-rc="on" aria-label="Use ${esc(it.name)}"${g && !odd ? ' checked' : ''}></td>
      <td>${esc(it.name)}<div class="sub">${qtyFmt(it.qty)} ${esc(it.unit)} for ${money(it.total)}</div>${odd ? `<div class="sub" style="color:var(--offer-ink)">Very different from your current price of ${money(old)}. Check it before applying.</div>` : ''}</td>
      <td><select class="field" data-rc="food" aria-label="Food for ${esc(it.name)}"><option value="">Skip</option>${foods.map(f => `<option${f === g ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></td></tr>`;
  }).join('');
  dlg.innerHTML = `<form method="dialog" id="rcform"><h2 id="dlg-title" style="font-size:20px">Receipt${r.store ? ' from ' + esc(r.store) : ''}</h2>
    <p class="muted" style="font-size:14px">${r.items.length ? 'Check each line, pick the food it belongs to, then tap Apply prices. This sets the standard price of those foods.' : 'No items were found. Try a flatter, brighter photo.'}</p>
    ${r.items.length ? `<div class="tablewrap" style="max-height:50vh;overflow:auto"><table style="min-width:0"><tbody>${rows}</tbody></table></div>` : ''}
    ${r.items.length ? '<label class="cmp" style="margin:10px 0 0"><input type="checkbox" id="rcpantry" checked><span>Also add these to my pantry</span></label>' : ''}
    <div class="dlg-actions" style="gap:8px">${r.items.length ? '<button type="submit" class="btn primary">Apply</button>' : ''}<button type="button" class="btn" data-act="close-dlg">Close</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
  $('#rcform').addEventListener('submit', ev => {
    ev.preventDefault(); let n = 0;
    $$('#rcform tbody tr').forEach(tr => {
      const food = $('[data-rc=food]', tr).value, it = r.items[Number(tr.dataset.i)];
      if (!food || !$('[data-rc=on]', tr).checked || !S.prices[food]) return;
      const p = rcPrice(it); S.prices[food].price = p.price; S.prices[food].basis = p.basis; n++;
      if ($('#rcpantry') && $('#rcpantry').checked) { const a = rcPantryAmount(it, food); if (a) pantryAdd(food, a.qty, a.unit); }
    });
    store.set('pantry', S.pantry); dlg.close(); saveAll(); render(); toast(n ? `Updated ${n} ${n === 1 ? 'price' : 'prices'}` : 'No prices changed');
  });
}
const RC_ERR = { no_access: 'Receipt scanning is not enabled for your account.', not_configured: 'Receipt scanning is not set up on the server.', model_unreachable: 'The receipt model is offline right now.', unreadable: 'The model could not read that receipt.', too_large: 'That photo is too large.', rate_limited: 'You have scanned a lot of receipts lately. Try again later.' };
async function rcScan(file) {
  if (RC.busy) return; RC.busy = true; toast('Reading the receipt. This can take a minute.');
  try {
    const res = await MealSync.api('/api/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: await rcShrink(file) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(RC_ERR[j.error] || 'Receipt scanning failed. Try again.');
    rcDialog(j);
  } catch (e) { toast(e.message || 'Receipt scanning failed.'); }
  RC.busy = false;
}
function rcPick() {
  let f = $('#rcfile');
  if (!f) {
    f = document.createElement('input'); f.type = 'file'; f.id = 'rcfile'; f.accept = 'image/*'; f.hidden = true;
    f.addEventListener('change', () => { const x = f.files[0]; f.value = ''; if (x) rcScan(x); });
    document.body.appendChild(f);
  }
  f.click();
}

/* ---------- admin: who can use receipt parsing ---------- */
async function rcLoadUsers() {
  RC.err = '';
  try {
    const res = await MealSync.api('/api/admin/users');
    if (!res.ok) throw new Error('users');
    RC.users = (await res.json()).users;
  } catch (e) { RC.err = 'Could not load users.'; }
  if (S.tab === 'admin') render();
}
function adminView() {
  if (!(window.MealSync && MealSync.admin)) return '<h1 class="h1" id="h1" tabindex="-1">Access</h1><p class="lede">This page is for the administrator.</p>';
  if (!RC.users && !RC.err) rcLoadUsers();
  const rows = (RC.users || []).map(u => {
    const on = u.receipts || u.admin;
    return `<tr><th scope="row" style="font-weight:500;overflow-wrap:anywhere">${esc(u.email)}${u.admin ? ' <span class="tag">admin</span>' : ''}<div class="sub">Joined ${esc(dMed(new Date(u.created).toISOString().slice(0, 10)))}</div></th>
    <td class="r"><label class="cmp" style="margin:0"><input type="checkbox" data-rc-grant="${esc(u.id)}"${on ? ' checked' : ''}${u.admin ? ' disabled' : ''} aria-label="Receipt parsing for ${esc(u.email)}"><span>${on ? 'Receipts' : 'Free'}</span></label></td></tr>`;
  }).join('');
  return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Access</h1></div>
  <p class="lede">Choose who can use receipt parsing. Everyone else stays on the free plan. People appear here after they sign in once.</p>
  ${RC.err ? `<div class="notice error" role="alert">${IC.info}<div>${esc(RC.err)}</div></div>` : ''}
  <div class="tablewrap" style="margin-top:20px;max-width:720px"><table style="min-width:0"><thead><tr><th scope="col">User</th><th scope="col" class="r">Plan</th></tr></thead><tbody>${rows || `<tr><td colspan="2" class="muted">${RC.users ? 'No users yet.' : 'Loading'}</td></tr>`}</tbody></table></div>`;
}
document.addEventListener('change', async e => {
  const id = e.target && e.target.dataset && e.target.dataset.rcGrant; if (!id) return;
  const on = e.target.checked;
  try {
    const res = await MealSync.api('/api/admin/users/' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipts: on }) });
    if (!res.ok) throw new Error('save');
    const u = RC.users.find(x => x.id === id); if (u) u.receipts = on;
    render(); toast(on ? 'Receipts enabled' : 'Back to free');
  } catch (err) { e.target.checked = !on; toast('Could not save. Try again.'); }
});
