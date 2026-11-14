/* Pantry: what is in the house, and meal ideas that fit your limits. Loaded before app.js; uses app globals when called. */
'use strict';

const PANTRY_UNITS = [['g', 'g'], ['ml', 'ml'], ['item', 'items']];
const pantryAll = () => S.pantry || (S.pantry = NP({}));
const pFam = u => u === 'item' ? 'item' : u === 'ml' ? 'ml' : 'g';
const entFam = e => e.type === 'count' ? 'item' : e.type === 'volume' ? 'ml' : 'g';
const pQty = v => { const n = Math.round(v * 10) / 10; return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n); };

// How much of a food the pantry holds, in the unit family asked for. Null when the two cannot be compared.
function pantryHave(name, fam) {
  const p = pantryAll()[name]; if (!p || !(p.qty > 0)) return 0;
  if (p.unit === fam) return p.qty;
  const gpu = Number((S.prices[name] || {}).gpu) || 0;
  if (gpu > 0) { if (p.unit === 'item') return p.qty * gpu; if (fam === 'item') return p.qty / gpu; }
  if ((p.unit === 'g' && fam === 'ml') || (p.unit === 'ml' && fam === 'g')) return p.qty; // about one gram per ml
  return null;
}
function pantryAdd(name, qty, unit) {
  if (!(qty > 0) || !name) return;
  const all = pantryAll(), cur = all[name];
  if (cur && cur.unit === unit) cur.qty = Math.round((cur.qty + qty) * 100) / 100;
  else if (cur && pantryHave(name, pFam(unit)) != null) { const have = pantryHave(name, pFam(unit)); all[name] = { qty: Math.round((have + qty) * 100) / 100, unit }; }
  else all[name] = { qty: Math.round(qty * 100) / 100, unit };
}
// Called when a food is logged: takes the amount out of the pantry when the pantry has that food.
function pantryUse(name, qty, fam) {
  if (S.pantryAuto === false) return;
  const p = pantryAll()[name]; if (!p || !(qty > 0)) return;
  let q = qty;
  if (p.unit !== fam) {
    const gpu = Number((S.prices[name] || {}).gpu) || 0;
    if (gpu > 0 && p.unit === 'item') q = qty / gpu;
    else if (gpu > 0 && fam === 'item') q = qty * gpu;
    else if ((p.unit === 'g' && fam === 'ml') || (p.unit === 'ml' && fam === 'g')) q = qty;
    else return;
  }
  p.qty = Math.max(0, Math.round((p.qty - q) * 100) / 100);
}
function pantryUseEntries(list) {
  if (!list || !list.length) return;
  for (const e of list) if (!e.q && e.name) pantryUse(e.name, e.qty, entFam(e));
  store.set('pantry', S.pantry);
}

/* ---------- meal ideas ---------- */
const SUG = { get r() { return S.sug || (S.sug = { pro: '30', cost: '5', kmin: '', kmax: '', only: false }); } };
function suggestMeals(rule) {
  const date = mealToday(), minP = num(rule.pro), maxC = num(rule.cost), kmin = num(rule.kmin), kmax = num(rule.kmax);
  const out = [], skipped = { price: 0, nut: 0 };
  for (const name of Object.keys(S.meals)) {
    const m = S.meals[name], t = mealStats(m, date), sv = t.sv;
    if (maxC > 0 && t.noPrice) { skipped.price++; continue; }
    if ((minP > 0 || kmin > 0 || kmax > 0) && t.noNut) { skipped.nut++; continue; }
    const per = { k: t.k / sv, p: t.p / sv, c: t.c / sv, f: t.f / sv, cost: t.cost / sv };
    if (minP > 0 && per.p < minP) continue;
    if (maxC > 0 && per.cost > maxC) continue;
    if (kmin > 0 && per.k < kmin) continue;
    if (kmax > 0 && per.k > kmax) continue;
    let enough = Infinity; const missing = [], check = [];
    for (const it of m.items) {
      const n = canon(it.name), need = it.qty / sv, have = pantryHave(n, pFam(it.unit));
      if (have == null) { check.push(n); continue; }
      if (!(need > 0)) continue;
      if (have < need) missing.push(n);
      enough = Math.min(enough, Math.floor(have / need + 1e-9));
    }
    if (rule.only && missing.length) continue;
    out.push({ name, m, per, missing, check, servings: Number.isFinite(enough) ? enough : 0 });
  }
  out.sort((a, b) => a.missing.length - b.missing.length || (a.per.p > 0 && b.per.p > 0 ? a.per.cost / a.per.p - b.per.cost / b.per.p : 0) || a.name.localeCompare(b.name));
  return { list: out, skipped };
}
function ideaHtml(x) {
  const status = x.missing.length
    ? `<span class="pa-miss">Missing ${x.missing.map(esc).join(', ')}</span>`
    : `<span class="pa-ok">You have everything${x.servings ? `, enough for ${x.servings} ${x.servings === 1 ? 'serving' : 'servings'}` : ''}</span>${x.check.length ? `<span class="muted"> Check the amount of ${x.check.map(esc).join(', ')}.</span>` : ''}`;
  return `<div class="pa-idea"><div class="pa-ih"><b>${esc(x.name)}</b>${x.m.slot ? `<span class="slottag">${esc(x.m.slot)}</span>` : ''}</div>
    <div class="pa-im"><span><i class="lp">P</i> ${pQty(x.per.p)} g</span><span>${n0(x.per.k)} kcal</span><span>${money(x.per.cost)}</span><span class="muted">per serving</span></div>
    <div class="pa-is">${status}</div>
    <div class="macts"><button type="button" class="btn sm primary" data-act="meal-diary" data-name="${esc(x.name)}">Add to diary</button><button type="button" class="btn sm" data-act="meal-edit" data-name="${esc(x.name)}">Edit meal</button></div></div>`;
}
function ideasCard() {
  const r = SUG.r, { list, skipped } = suggestMeals(r), none = !Object.keys(S.meals).length;
  const fld = (id, label, val, unit) => `<div class="gl-f"><label for="${id}">${label}</label><div class="gl-in"><input class="field" id="${id}" inputmode="decimal" value="${esc(val)}" autocomplete="off"><span>${unit}</span></div></div>`;
  return `<section class="card pad pa-ideas" aria-label="Meal ideas"><h2 style="font-size:18px">Meal ideas</h2>
    <p class="muted" style="font-size:14px;margin-top:4px">Pick limits and see which of your saved meals fit. Meals you can make from the pantry come first.</p>
    <div class="gl-grid two pa-rules" id="sugrules">${fld('sg-pro', 'At least', r.pro, 'g protein')}${fld('sg-cost', 'At most', r.cost, S.currency || 'EUR')}${fld('sg-kmin', 'At least', r.kmin, 'kcal')}${fld('sg-kmax', 'At most', r.kmax, 'kcal')}</div>
    <label class="cmp" style="margin:10px 0 0"><input type="checkbox" id="sg-only"${r.only ? ' checked' : ''}><span>Only meals I can make now</span></label>
    <div id="sugout" style="margin-top:14px">${sugOutHtml(list, skipped, none)}</div></section>`;
}
function sugOutHtml(list, skipped, none) {
  if (none) return `<p class="muted">You have no saved meals yet. <a href="#meals">Build one on Meals</a> and ideas show up here.</p>`;
  const note = (skipped.price || skipped.nut) ? `<p class="sub" style="margin-top:10px">${skipped.price ? `${skipped.price} ${skipped.price === 1 ? 'meal was' : 'meals were'} left out because an ingredient has no price. ` : ''}${skipped.nut ? `${skipped.nut} left out because an ingredient has no nutrition.` : ''}</p>` : '';
  if (!list.length) return `<p class="muted">No saved meal fits these limits. Loosen them, or build a new meal on <a href="#meals">Meals</a>.</p>${note}`;
  return `<p class="sub" style="margin-bottom:8px">${list.length} ${list.length === 1 ? 'meal fits' : 'meals fit'}.</p><div class="pa-ideas-list">${list.slice(0, 12).map(ideaHtml).join('')}</div>${list.length > 12 ? `<p class="sub">Showing the best 12.</p>` : ''}${note}`;
}
function sugRefresh() {
  const r = SUG.r; r.pro = $('#sg-pro').value; r.cost = $('#sg-cost').value; r.kmin = $('#sg-kmin').value; r.kmax = $('#sg-kmax').value; r.only = $('#sg-only').checked;
  store.set('sug', r);
  const { list, skipped } = suggestMeals(r); $('#sugout').innerHTML = sugOutHtml(list, skipped, !Object.keys(S.meals).length);
}

/* ---------- the pantry screen ---------- */
function pantryRowHtml(name) {
  const p = pantryAll()[name], out = !(p.qty > 0);
  return `<div class="pa-row" data-name="${esc(name)}"><div class="pa-n"><b>${esc(name)}</b>${out ? '<span class="lowtag">Out</span>' : ''}</div>
    <input class="field pa-q" data-pq inputmode="decimal" aria-label="Amount of ${esc(name)}" value="${esc(String(p.qty))}">
    <select class="field pa-u" data-pu aria-label="Unit of ${esc(name)}">${PANTRY_UNITS.map(([v, l]) => `<option value="${v}"${p.unit === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="ibtn" data-act="pantry-del" data-name="${esc(name)}" aria-label="Remove ${esc(name)} from the pantry">${TOOLIC.trash}</button></div>`;
}
function pantryView() {
  const names = Object.keys(pantryAll()).sort((a, b) => a.localeCompare(b));
  const foods = [...IDX.meta.keys()].sort((a, b) => a.localeCompare(b));
  return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Pantry</h1></div>
  <p class="lede">What is in the house and how much. Foods you log come off it, and meal ideas use it.</p>
  <datalist id="plist">${foods.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  <div class="cols pa-cols">
    <div class="main2"><section class="card pad" aria-label="Pantry">
      <form id="pform" class="pa-add" novalidate>
        <div class="pa-f1"><label for="pn">Food</label><input class="field" id="pn" list="plist" autocomplete="off" placeholder="Choose a food"></div>
        <div class="pa-f2"><label for="pq">Amount</label><input class="field" id="pq" inputmode="decimal" placeholder="500"></div>
        <div class="pa-f3"><label for="pu">Unit</label><select class="field" id="pu">${PANTRY_UNITS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <button type="submit" class="btn primary">Add</button></form>
      <div id="perr" class="sub" style="color:var(--offer-ink);min-height:18px;margin-top:6px" role="alert"></div>
      <div class="pa-list" id="palist">${names.length ? names.map(pantryRowHtml).join('') : '<p class="muted">Nothing here yet. Add what you have, or scan a receipt and choose to add it.</p>'}</div>
      <label class="cmp" style="margin:14px 0 0"><input type="checkbox" id="pauto"${S.pantryAuto === false ? '' : ' checked'}><span>Take foods out of the pantry when I log them</span></label>
    </section></div>
    <aside class="side pa-side">${ideasCard()}</aside>
  </div>`;
}

/* ---------- events ---------- */
document.addEventListener('submit', e => {
  if (!e.target || e.target.id !== 'pform') return;
  e.preventDefault();
  const name = canon($('#pn').value.trim()), qty = num($('#pq').value), unit = $('#pu').value, err = m => { $('#perr').textContent = m; };
  if (!name) return err('Choose a food.');
  if (!IDX.meta.has(name)) return err('That food is not in your list. Create it on Foods first, then add it here.');
  if (!(qty > 0)) return err('Enter an amount.');
  pantryAdd(name, qty, unit); store.set('pantry', S.pantry); render(); toast(`${name} added`);
});
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.closest) return;
  if (t.id === 'pauto') { S.pantryAuto = t.checked; store.set('pantryAuto', S.pantryAuto); return; }
  if (t.id === 'sg-only') { sugRefresh(); return; }
  const row = t.closest('.pa-row'); if (!row) return;
  const p = pantryAll()[row.dataset.name]; if (!p) return;
  if (t.matches('[data-pq]')) { const v = num(t.value); p.qty = v >= 0 ? v : 0; t.value = String(p.qty); }
  if (t.matches('[data-pu]')) p.unit = t.value;
  store.set('pantry', S.pantry); render();
});
document.addEventListener('input', e => { if (e.target && e.target.closest && e.target.closest('#sugrules')) sugRefresh(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="pantry-del"]'); if (!b) return;
  delete pantryAll()[b.dataset.name]; store.set('pantry', S.pantry); render();
});
