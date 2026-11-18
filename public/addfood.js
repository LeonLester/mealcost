/* The Add food page: search your foods, USDA FoodData Central and Open Food Facts, favourites, recent and custom foods.
   Loaded before app.js; uses app globals only when called. */
'use strict';

const AF = { tab: 'all', q: '', sel: null, items: new Map(), usda: [], off: [], busy: false, err: '', seq: 0, date: '', group: 'Breakfast', amount: '', unit: 'g', timer: 0 };
const AF_TABS = [['all', 'All'], ['fav', 'Favorites'], ['recent', 'Recent'], ['mine', 'My foods'], ['custom', 'Custom']];

const afTitle = s => s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(,/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s;
const afFavs = () => S.favs || (S.favs = []);
const afIsFav = n => afFavs().includes(canon(n));

// Start a fresh visit to the page, for a day and meal.
function afOpen(date, group) {
  Object.assign(AF, { tab: 'all', q: '', sel: null, items: new Map(), usda: [], off: [], busy: false, err: '', amount: '', unit: 'g' });
  AF.date = date || S.day || mealToday(); AF.group = group || AF.group || 'Breakfast';
  go('add');
}

/* ---------- items ---------- */
// Per-100 g (or per-item) nutrition of a food that is already in the library.
function afLocal(name) {
  const m = IDX.meta.get(name); if (!m) return null;
  const oI = perUnit(name, 'item'), oG = perUnit(name, 'g');
  const u = m.countFirst && oI ? 'item' : oG ? 'g' : oI ? 'item' : null; if (!u) return null;
  const o = u === 'item' ? oI : oG, s = u === 'item' ? 1 : 100, x = {};
  if (o.x) for (const k in o.x) x[k] = o.x[k] * s;
  return { key: 'm|' + name, kind: 'mine', name, brand: '', per: u === 'item' ? 'item' : '100g', kcal: o.k * s, pro: o.p * s, carb: o.c * s, fat: o.f * s, fiber: (o.b || 0) * s, x, m, custom: !!S.foods[name] };
}
const afAllLocal = () => [...IDX.meta.keys()].map(afLocal).filter(Boolean);
function afMatch(list, q) {
  const t = q.toLowerCase().split(/\s+/).filter(Boolean); if (!t.length) return list;
  return list.map(i => { const n = i.name.toLowerCase(); return t.every(w => n.includes(w)) ? [n.startsWith(t[0]) ? 0 : 1, i] : null; }).filter(Boolean)
    .sort((a, b) => a[0] - b[0] || ((b[1].m && b[1].m.n) || 0) - ((a[1].m && a[1].m.n) || 0) || a[1].name.localeCompare(b[1].name)).map(x => x[1]);
}
function afRecent(max) {
  const seen = new Set(), out = [];
  for (let i = S.entries.length - 1; i >= 0 && out.length < max; i--) { const e = S.entries[i]; if (e.q || seen.has(e.name)) continue; seen.add(e.name); const it = afLocal(e.name); if (it) out.push(it); }
  return out;
}
const afReg = list => { for (const i of list) AF.items.set(i.key, i); return list; };

/* ---------- remote search ---------- */
function afSearch() {
  const q = AF.q.trim(); clearTimeout(AF.timer);
  if (q.length < 2) { AF.usda = []; AF.off = []; AF.busy = false; AF.err = ''; afResults(); return; }
  AF.busy = true; AF.err = ''; afResults();
  AF.timer = setTimeout(async () => {
    const my = ++AF.seq, base = window.MealNative && MealNative.isNative ? 'https://mealcost.coachleonidas.com' : '';
    const usda = fetch(`${base}/api/food-search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(j => ({ list: (j.foods || []).map(f => ({ key: 'u|' + f.id, kind: 'usda', name: afTitle(f.name), brand: afTitle(f.brand || ''), per: '100g', kcal: f.kcal, pro: f.pro, carb: f.carb, fat: f.fat, fiber: f.fiber, x: f.x || {}, serving: f.serving, generic: f.kind === 'Generic' })), err: j.error })).catch(() => ({ list: [], err: 'net' }));
    const off = fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments`).then(r => r.json()).then(j => (j.products || []).map(p => {
      const n = p.nutriments || {}, kj = Number(n['energy_100g']), kcal = Number.isFinite(Number(n['energy-kcal_100g'])) ? Number(n['energy-kcal_100g']) : Number.isFinite(kj) ? kj / 4.184 : 0;
      const nm = String(p.product_name || '').trim(); if (!nm) return null;
      const o = offNutrients(n, kcal); if (!(o.kcal > 0) && !(o.pro > 0) && !(o.carb > 0) && !(o.fat > 0)) return null;
      return Object.assign(o, { key: 'o|' + p.code, kind: 'off', name: afTitle(nm).slice(0, 70), brand: afTitle(String(p.brands || '').split(',')[0].trim()).slice(0, 40), per: '100g' });
    }).filter(Boolean)).catch(() => []);
    const [u, o] = await Promise.all([usda, off]);
    if (my !== AF.seq) return;
    AF.usda = afReg(u.list); AF.off = afReg(o); AF.busy = false;
    AF.err = !u.list.length && !o.length ? (u.err === 'busy' ? 'The food database is busy. Try again in a minute.' : u.err === 'net' ? 'Could not reach the food databases. Check your connection.' : '') : '';
    afResults();
  }, 350);
}

/* ---------- views ---------- */
const afStar = (n, on) => `<button type="button" class="af-star${on ? ' on' : ''}" data-act="af-fav" data-name="${esc(n)}" aria-pressed="${on}" aria-label="${on ? 'Remove ' : 'Add '}${esc(n)} ${on ? 'from' : 'to'} favorites">${on ? '★' : '☆'}</button>`;
function afRow(i) {
  const per = i.per === 'item' ? 'per item' : 'per 100 g';
  const badge = i.kind === 'mine' ? (i.custom ? 'Yours' : 'Logged') : i.kind === 'usda' ? (i.generic ? 'USDA' : 'USDA brand') : 'Open Food Facts';
  return `<div class="af-row${AF.sel === i.key ? ' sel' : ''}"><button type="button" class="af-pick" data-act="af-pick" data-key="${esc(i.key)}"><span class="af-n">${esc(i.name)}</span><span class="af-s muted">${i.brand ? esc(i.brand) + ' · ' : ''}${n0(i.kcal)} kcal · P ${n0(i.pro)} · C ${n0(i.carb)} · F ${n0(i.fat)} ${per}</span></button><span class="af-b">${badge}</span>${i.kind === 'mine' ? afStar(i.name, afIsFav(i.name)) : ''}</div>`;
}
const afSec = (title, list, empty) => `<section class="af-sec"><h2>${title}</h2>${list.length ? list.map(afRow).join('') : empty ? `<p class="muted af-empty">${empty}</p>` : ''}</section>`;

function afResultsHtml() {
  const q = AF.q.trim();
  if (AF.tab === 'fav') { const l = afReg(afFavs().map(n => afLocal(n)).filter(Boolean)); return afSec('Favorites', afMatch(l, q), 'No favorites yet. Tap the star next to a food to keep it here.'); }
  if (AF.tab === 'recent') return afSec('Recent', afMatch(afReg(afRecent(60)), q), 'Nothing logged yet.');
  if (AF.tab === 'mine') { const l = afReg(Object.keys(S.foods).map(n => afLocal(n)).filter(Boolean)); return afSec('My foods', afMatch(l, q), 'You have not created any foods yet. Use the Custom tab.'); }
  // All
  if (q.length < 2) {
    const fav = afReg(afFavs().map(n => afLocal(n)).filter(Boolean)).slice(0, 8), rec = afReg(afRecent(10));
    return `${fav.length ? afSec('Favorites', fav) : ''}${afSec('Recent', rec, 'Search above to find a food in your list, USDA FoodData Central or Open Food Facts.')}<p class="muted af-hint">Type at least two letters to search USDA FoodData Central and Open Food Facts too.</p>`;
  }
  const mine = afMatch(afReg(afAllLocal()), q).slice(0, 20);
  const status = AF.busy ? '<p class="muted af-empty" role="status">Searching the food databases</p>' : AF.err ? `<p class="af-empty" role="alert">${esc(AF.err)}</p>` : '';
  return `${afSec('Your foods', mine)}${afSec('USDA FoodData Central', AF.usda)}${afSec('Open Food Facts', AF.off)}${status}${!AF.busy && !mine.length && !AF.usda.length && !AF.off.length && !AF.err ? `<p class="muted af-empty">No match. Try a simpler word, or create it on the Custom tab.</p>` : ''}`;
}
function afResults() { const el = $('#afres'); if (el) el.innerHTML = afResultsHtml(); }

// Nutrition of the chosen food for the chosen amount.
function afRate(i, unit) {
  if (i.kind === 'mine') return perUnit(i.name, unit === 'item' ? 'item' : 'g');
  if (unit === 'item') return null;
  const d = 100; const x = {}; for (const k in (i.x || {})) x[k] = i.x[k] / d;
  return { k: i.kcal / d, p: i.pro / d, c: i.carb / d, f: i.fat / d, b: (i.fiber || 0) / d, x };
}
function afUnits(i) { return i.kind === 'mine' ? (i.per === 'item' && i.custom ? ['item'] : i.custom ? ['g', 'ml'] : ['g', 'ml', 'item']) : ['g', 'ml']; }
function afDetailHtml() {
  const i = AF.items.get(AF.sel); if (!i) return `<div class="af-none muted">Choose a food to see everything in it and add it to your diary.</div>`;
  const units = afUnits(i), srv = i.serving && i.serving.g > 0 ? i.serving : null;
  const groups = [...S.entries.map(e => e.group).filter(Boolean), 'Breakfast', 'Lunch', 'Dinner', 'Snacks', AF.group];
  const gs = [...new Set(groups)].slice(0, 12);
  return `<div class="af-det"><h2>${esc(i.name)}</h2><p class="muted">${i.brand ? esc(i.brand) + ' · ' : ''}${i.kind === 'mine' ? 'In your foods' : i.kind === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts'}${i.kind === 'mine' ? '' : '. Saved to your foods when you add it.'}</p>
    <div class="af-amt"><div><label for="afa">Amount</label><input class="field" id="afa" inputmode="decimal" value="${esc(AF.amount)}" autocomplete="off"></div><div><label for="afu">Unit</label><select class="field" id="afu">${units.map(u => `<option value="${u}"${u === AF.unit ? ' selected' : ''}>${{ g: 'grams', ml: 'millilitres', item: 'items' }[u]}</option>`).join('')}</select></div></div>
    <div class="chips af-q">${srv ? `<button type="button" class="chip" data-act="af-amt" data-v="${srv.g}" data-u="g">1 serving${srv.label ? ' (' + esc(srv.label) + ')' : ''} · ${n0(srv.g)} g</button>` : ''}<button type="button" class="chip" data-act="af-amt" data-v="100" data-u="g">100 g</button>${units.includes('item') ? '<button type="button" class="chip" data-act="af-amt" data-v="1" data-u="item">1 item</button>' : ''}</div>
    <div class="af-ctx2"><div><label for="afd">Day</label><input class="field" type="date" id="afd" value="${esc(AF.date)}"></div><div><label for="afg">Meal</label><select class="field" id="afg">${gs.map(g => `<option${g === AF.group ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></div></div>
    <div id="afprev" class="af-prev" aria-live="polite"></div>
    <div class="af-act"><button type="button" class="btn primary" data-act="af-add" style="flex:1">Add to diary</button>${i.kind === 'mine' ? afStar(i.name, afIsFav(i.name)) : ''}</div>
    <div id="aferr" class="sub" style="color:var(--offer-ink)" role="alert"></div></div>`;
}
function afPreview() {
  const i = AF.items.get(AF.sel), box = $('#afprev'); if (!i || !box) return;
  const qty = num(AF.amount), o = afRate(i, AF.unit);
  if (!(qty > 0) || !o) { box.innerHTML = o || !(qty > 0) ? '<p class="muted">Enter an amount to see the nutrition.</p>' : '<p class="muted">This food has no weight per item, so log it in grams.</p>'; return; }
  const t = { kcal: o.k * qty, pro: o.p * qty, carb: o.c * qty, fat: o.f * qty, fiber: (o.b || 0) * qty, x: {} };
  if (o.x) for (const k in o.x) t.x[k] = o.x[k] * qty;
  box.innerHTML = `<div class="af-big"><b>${n0(t.kcal)}</b> kcal<span class="muted"> · P ${n0(t.pro)} g · C ${n0(t.carb)} g · F ${n0(t.fat)} g</span></div><details class="af-all" open><summary>All nutrients</summary>${mealNutrients(t, 'In this amount')}</details>`;
}

function addView() {
  const hint = `<p class="muted" style="margin-top:6px">Adding to <b>${esc(AF.group)}</b> on <b>${esc(dMed(AF.date))}</b></p>`;
  return `<div class="af"><div class="af-top"><button type="button" class="btn sm" data-act="af-back">← Back</button><h1 class="h1" id="h1" tabindex="-1">Add food</h1></div>${hint}
  <label class="search af-search"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/></svg><input id="afq" type="search" placeholder="Search foods" aria-label="Search foods" autocomplete="off" value="${esc(AF.q)}"></label>
  <div class="af-tabs" role="tablist">${AF_TABS.map(([k, l]) => `<button type="button" role="tab" class="chip" data-act="af-tab" data-v="${k}" aria-selected="${AF.tab === k}" aria-pressed="${AF.tab === k}">${l}</button>`).join('')}</div>
  ${AF.tab === 'custom' ? `<div class="card pad af-custom">${foodFormHtml('', { noTitle: true, submit: 'Save food', cancelAct: 'af-tab-all' })}</div>` : `<div class="af-body"><div id="afres" class="af-res">${afResultsHtml()}</div><aside id="afsel" class="af-selp">${afDetailHtml()}</aside></div>`}</div>`;
}
function afInit() {
  const q = $('#afq');
  if (q && !q.dataset.b) q.dataset.b = '1', q.addEventListener('input', () => { AF.q = q.value; if (AF.tab === 'all') afSearch(); else afResults(); });
  const sel = $('#afsel');
  if (sel) {
    if (!sel.dataset.b) { sel.dataset.b = '1';
    sel.addEventListener('input', e => { if (e.target.id === 'afa') { AF.amount = e.target.value; afPreview(); } });
    sel.addEventListener('change', e => { if (e.target.id === 'afu') { AF.unit = e.target.value; afPreview(); } else if (e.target.id === 'afd') AF.date = e.target.value; else if (e.target.id === 'afg') { AF.group = e.target.value; const p = $('.af > p.muted'); if (p) p.innerHTML = `Adding to <b>${esc(AF.group)}</b> on <b>${esc(dMed(AF.date))}</b>`; } }); }
    afPreview();
  }
  const ff = $('#fform');
  if (ff && !ff.dataset.b) ff.dataset.b = '1', bindFoodForm('', nm => { AF.tab = 'all'; AF.q = nm; AF.sel = 'm|' + canon(nm); afSelect('m|' + canon(nm)); toast(`${nm} saved`); render(); });
}

// Pick a food: set a sensible default amount and unit.
function afSelect(key) {
  const i = AF.items.get(key) || (key.startsWith('m|') ? afLocal(key.slice(2)) : null); if (!i) return;
  if (i.kind === 'mine' && !AF.items.has(key)) AF.items.set(key, i);
  AF.sel = key;
  const m = i.m, units = afUnits(i);
  AF.unit = i.kind === 'mine' ? (units.length === 1 ? units[0] : m && m.countFirst ? 'item' : m && m.vol > m.mass ? 'ml' : 'g') : 'g';
  AF.amount = AF.unit === 'item' ? '1' : i.serving && i.serving.g > 0 ? String(Math.round(i.serving.g * 10) / 10) : '100';
}

// Add the food to the diary. A food from USDA or Open Food Facts is saved to your foods first, with every nutrient.
function afAdd() {
  const i = AF.items.get(AF.sel), err = t => { const e = $('#aferr'); if (e) e.textContent = t; };
  if (!i) return err('Choose a food first.');
  const qty = num(AF.amount), date = AF.date, group = AF.group, unit = AF.unit;
  if (!(qty > 0)) return err('Enter an amount greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Choose a day.');
  let name = i.name;
  if (i.kind !== 'mine') {
    name = [i.brand && !canon(i.name).includes(canon(i.brand)) ? i.brand : '', i.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 60).trim();
    const src = i.kind === 'usda' ? 'USDA' : 'Open Food Facts';
    if (S.foods[name] && S.foods[name].src !== src) name = (name.slice(0, 50) + ` (${src})`).slice(0, 60);
    else if (!S.foods[name] && IDX.meta.has(canon(name))) name = (name.slice(0, 50) + ` (${src})`).slice(0, 60);
    if (!S.foods[name]) {
      S.foods[name] = cleanFood({ per: '100g', kcal: r1(i.kcal), pro: r1(i.pro), carb: r1(i.carb), fat: r1(i.fat), fiber: r1(i.fiber || 0), x: i.x, src }, x => Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : 0);
      S.prices[name] = { price: '', basis: '100', gpu: '' };
      S.started = true; reindex(); ensurePrices();
    }
  }
  const n = canon(name), o = perUnit(n, unit === 'item' ? 'item' : 'g');
  if (!o) return err(unit === 'item' ? 'This food has no weight per item. Log it in grams.' : 'No nutrition is known for that unit.');
  const e = { date, group, name: n, src: n, qty: r2(qty), unit, type: unit === 'item' ? 'count' : unit === 'ml' ? 'volume' : 'mass' };
  Object.assign(e, { kcal: r2(o.k * qty), pro: r2(o.p * qty), carb: r2(o.c * qty), fat: r2(o.f * qty), fiber: r2(o.b * qty) }, o.x ? { x: scaleX(o.x, qty) } : {});
  S.entries.push(e); pantryUseEntries([e]);
  S.entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  reindex(); ensurePrices(); saveEntries(); saveAll();
  S.day = date; go('day'); toast(`Added to ${dMed(date)}`);
}

// Clicks on the page. Returns true when handled.
function addAct(a, d) {
  switch (a) {
    case 'log-food': afOpen(d.date, d.group); return true;
    case 'af-back': go('day'); return true;
    case 'af-tab': AF.tab = d.v; AF.sel = AF.tab === 'custom' ? null : AF.sel; render(); return true;
    case 'af-tab-all': AF.tab = 'all'; render(); return true;
    case 'af-pick': { afSelect(d.key); afResults(); const p = $('#afsel'); if (p) { p.innerHTML = afDetailHtml(); afInit(); p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const a2 = $('#afa'); if (a2 && matchMedia('(min-width: 900px)').matches) a2.select(); } return true; }
    case 'af-amt': AF.amount = d.v; AF.unit = d.u; { const a2 = $('#afa'), u2 = $('#afu'); if (a2) a2.value = d.v; if (u2 && [...u2.options].some(o => o.value === d.u)) u2.value = d.u; } afPreview(); return true;
    case 'af-fav': { const k = canon(d.name), f = afFavs(), j = f.indexOf(k); if (j < 0) f.push(k); else f.splice(j, 1); store.set('favs', f); afResults(); const p = $('#afsel'); if (p && AF.sel) { p.innerHTML = afDetailHtml(); afInit(); } return true; }
    case 'af-add': afAdd(); return true;
  }
  return false;
}
