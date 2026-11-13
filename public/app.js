'use strict';

/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const store = {
  get(k, d) { try { const v = localStorage.getItem('mcc.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mcc.' + k, JSON.stringify(v)); if (window.MealSync) MealSync.dirty(k); return true; } catch (e) { toast('Could not save in this browser. Storage may be full or blocked.'); return false; } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('mcc.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ } }
};

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK', 'CHF', 'PLN', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD'];
const S = {
  entries: store.get('entries', []),
  prices: store.get('prices', {}),
  overrides: store.get('overrides', {}),
  currency: store.get('currency', 'EUR'),
  budget: store.get('budget', null),
  merges: store.get('merges', {}),
  nomerge: store.get('nomerge', []),
  sort: store.get('sort', 'freq'), flip: store.get('flip', false),
  cats: store.get('cats', {}), ranges: store.get('ranges', []), recipes: store.get('recipes', {}), meals: store.get('meals', {}), foods: store.get('foods', {}), started: store.get('started', false), tview: store.get('tview', 'cost'), vmacro: store.get('vmacro', 'pro'), vall: false, open: new Set(), grain: store.get('grain', 'week'), trange: store.get('trange', 90),
  tab: 'day', day: null, cat: '', range: 7, filter: '', chip: 'all', showAll: false, error: ''
};
if (!CURRENCIES.includes(S.currency)) S.currency = 'EUR';

const hasData = () => S.entries.length > 0 || S.started || Object.keys(S.foods).length > 0 || Object.keys(S.meals).length > 0;
const SITE = /^https?:$/.test(location.protocol) ? location.host : 'coachleonidas.com';

/* ============ formatting ============ */
const _nf = {};
function money(v) {
  const c = S.currency;
  _nf[c] = _nf[c] || new Intl.NumberFormat(undefined, { style: 'currency', currency: c });
  return _nf[c].format(v);
}
const _nf0 = {};
function money0(v) {
  const c = S.currency;
  _nf0[c] = _nf0[c] || new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 });
  return _nf0[c].format(v);
}
function currencySymbol() {
  const p = new Intl.NumberFormat(undefined, { style: 'currency', currency: S.currency }).formatToParts(0).find(x => x.type === 'currency');
  return p ? p.value : S.currency;
}
const n0 = v => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(v);
const qtyFmt = v => new Intl.NumberFormat(undefined, { maximumFractionDigits: v >= 10 ? 0 : 2 }).format(v);
const dObj = d => new Date(d + 'T12:00:00');
const dFmt = (d, o) => new Intl.DateTimeFormat(undefined, o).format(dObj(d));
const dLong = d => dFmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
const dShort = d => dFmt(d, { weekday: 'short' }) + ' ' + dFmt(d, { day: 'numeric' });
const dDM = d => dFmt(d, { day: 'numeric', month: 'short' });
const dMed = d => dFmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const pad = n => String(n).padStart(2, '0');
const isoOf = x => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
const isoAdd = (d, n) => { const x = dObj(d); x.setDate(x.getDate() + n); return isoOf(x); };

/* ============ icons ============ */
const IC = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  upload: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="stroke:var(--brand)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="stroke:var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>'
};

/* ============ Cronometer parsing ============ */
function parseCSV(text, delim = ',') {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function mapCols(h) {
  const L = h.map(x => x.trim().toLowerCase());
  const find = (...c) => {
    for (const k of c) { const i = L.indexOf(k); if (i >= 0) return i; }
    for (const k of c) { const i = L.findIndex(x => x.startsWith(k)); if (i >= 0) return i; }
    return -1;
  };
  return {
    date: find('day', 'date'), group: find('group', 'meal'), name: find('food name', 'name'),
    amount: find('amount'), kcal: find('energy', 'calories'), protein: find('protein'),
    carbs: find('carbs', 'carbohydrates'), fat: find('fat (g)', 'fat'), fiber: find('fiber', 'fibre'), cat: find('category')
  };
}

function normDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad(m[1]) + '-' + pad(m[2]);
  return '';
}

function parseAmount(s) {
  const m = String(s || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { qty: 1, unit: 'serving', type: 'count' };
  const qty = parseFloat(m[1].replace(',', '.'));
  const raw = m[2].trim(), l = raw.toLowerCase();
  if (/^fl\.?\s*oz/.test(l)) return { qty: qty * 29.5735, unit: 'ml', type: 'volume' };
  // Cronometer can log a serving as a multiple of a fixed size, for example "2.00 x 100.0 g", "1.05 100g" or "1.22 per 100g".
  const mm = l.replace(/^(?:x|\u00d7|per)\s*/, '').match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (mm && /[a-z]/.test(mm[2])) {
    const size = parseFloat(mm[1].replace(',', '.'));
    const u = mm[2].replace(/^\d+(?:[.,]\d+)?\s*(?=g\b|ml\b)/, '').trim().split(/[\s(]/)[0];
    const f = { g: ['g', 'mass', 1], gr: ['g', 'mass', 1], gram: ['g', 'mass', 1], grams: ['g', 'mass', 1], kg: ['g', 'mass', 1000], ml: ['ml', 'volume', 1], l: ['ml', 'volume', 1000] }[u];
    if (f) return { qty: qty * size * f[2], unit: f[0], type: f[1] };
  }
  const tok = l.split(/[\s(]/)[0].replace(/\.$/, '');
  switch (tok) {
    case 'g': case 'gram': case 'grams': case 'gr': return { qty, unit: 'g', type: 'mass' };
    case 'kg': return { qty: qty * 1000, unit: 'g', type: 'mass' };
    case 'mg': return { qty: qty / 1000, unit: 'g', type: 'mass' };
    case 'oz': return { qty: qty * 28.3495, unit: 'g', type: 'mass' };
    case 'lb': case 'lbs': return { qty: qty * 453.592, unit: 'g', type: 'mass' };
    case 'ml': return { qty, unit: 'ml', type: 'volume' };
    case 'l': case 'liter': case 'litre': return { qty: qty * 1000, unit: 'ml', type: 'volume' };
    default: {
      let u = raw.replace(/^per\s*/i, '').trim() || 'serving';
      if (/^servings?$/i.test(u)) u = 'serving';
      return { qty, unit: u, type: 'count' };
    }
  }
}

function parseCronometer(text) {
  const first = (text.split(/\r?\n/)[0] || '');
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = parseCSV(text, delim);
  if (rows.length < 2) throw new Error('This file is empty.');
  const c = mapCols(rows[0]);
  const missing = [];
  if (c.date < 0) missing.push('Day');
  if (c.name < 0) missing.push('Food Name');
  if (c.amount < 0) missing.push('Amount');
  if (missing.length) throw new Error('This does not look like a Cronometer "Food & Recipe Entries" export. Missing: ' + missing.join(', ') + '. In Cronometer, choose Export Data, then Food & Recipe Entries.');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[c.name] || '').trim(), date = normDate(r[c.date]);
    if (!name || !date) continue;
    const a = parseAmount(r[c.amount]);
    out.push({
      date, group: (c.group >= 0 && (r[c.group] || '').trim()) || 'Meal', name,
      qty: a.qty, unit: a.unit, type: a.type,
      kcal: num(r[c.kcal]), pro: num(r[c.protein]), carb: num(r[c.carbs]), fat: num(r[c.fat]), fiber: c.fiber >= 0 ? num(r[c.fiber]) : 0,
      cat: c.cat >= 0 ? (r[c.cat] || '').trim() : ''
    });
  }
  if (!out.length) throw new Error('No food entries found in this file.');
  return out;
}

/* ============ indexes ============ */
let IDX = { byName: new Map(), byDate: new Map(), dates: [], meta: new Map() };
function canon(n) { let k = 0; while (S.merges[n] && k++ < 25) n = S.merges[n]; return n; }
function reindex() {
  const byName = new Map(), byDate = new Map(), meta = new Map();
  for (const e of S.entries) { if (e.src === undefined) e.src = e.name; e.name = canon(e.src); }
  for (const e of S.entries) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e);
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  for (const [name, es] of byName) {
    let count = 0, mass = 0, vol = 0, g = 0, ml = 0, cnt = 0, mk = 0, mq = 0, mp = 0, mc = 0, mf = 0, mb = 0, tk = 0, tp = 0, tc = 0, tf = 0, tb = 0; const labels = {}, srcs = new Set(), cc = {};
    for (const e of es) {
      srcs.add(e.src); if (e.cat) cc[e.cat] = (cc[e.cat] || 0) + 1;
      tk += e.kcal; tp += e.pro; tc += e.carb; tf += e.fat; tb += e.fiber || 0;
      if (e.type === 'count') { count++; cnt += e.qty; const k = e.unit.toLowerCase(); labels[k] = (labels[k] || 0) + 1; }
      else if (e.type === 'volume') { vol++; ml += e.qty; mk += e.kcal; mq += e.qty; mp += e.pro; mc += e.carb; mf += e.fat; mb += e.fiber || 0; } else { mass++; g += e.qty; mk += e.kcal; mq += e.qty; mp += e.pro; mc += e.carb; mf += e.fat; mb += e.fiber || 0; }
    }
    const top = Object.entries(labels).sort((a, b) => b[1] - a[1])[0];
    meta.set(name, { n: es.length, cat: (Object.entries(cc).sort((a, b) => b[1] - a[1])[0] || [''])[0], count, mass, vol, g, ml, cnt, kpg: mq >= 50 && mk > 0 ? mk / mq : 0, mq, mp, mc, mf, mb, tk, tp, tc, tf, tb, unit: top ? top[0] : 'item', countFirst: count > mass + vol, members: [...srcs].filter(x => x !== name).sort() });
  }
  for (const r of Object.values(S.recipes)) for (const it of r.items) {
    const n = canon(it.name);
    if (!meta.has(n)) meta.set(n, { n: 0, count: 0, mass: 0, vol: 0, g: 0, ml: 0, cnt: 0, kpg: 0, unit: 'item', countFirst: false, members: [], extra: true });
  }
  for (const [n0, f] of Object.entries(S.foods)) {
    const n = canon(n0), item = f.per === 'item';
    if (!meta.has(n)) meta.set(n, { n: 0, count: 0, mass: 0, vol: 0, g: 0, ml: 0, cnt: 0, kpg: !item && f.kcal > 0 ? f.kcal / 100 : 0, unit: 'item', countFirst: item, members: [], extra: true, custom: true });
  }
  IDX = { byName, byDate, meta, dates: [...byDate.keys()].sort() };
}

function ensurePrices() {
  for (const [name, m] of IDX.meta) {
    if (!S.prices[name]) S.prices[name] = { price: '', basis: m.countFirst && !/^(serving|portion|dose)s?$/.test(m.unit) ? 'unit' : m.countFirst ? 'kg' : '100', gpu: '' };
  }
}

/* ============ costing ============ */
let RIDX = new Map();
function indexRanges() {
  RIDX = new Map();
  for (const r of S.ranges) { if (!RIDX.has(r.name)) RIDX.set(r.name, []); RIDX.get(r.name).push(r); }
  for (const l of RIDX.values()) l.sort((a, b) => b.from.localeCompare(a.from));
}
function rangeFor(name, date) {
  const l = RIDX.get(name); if (!l) return null;
  for (const r of l) if (r.from <= date && (!r.to || date <= r.to)) return r;
  return null;
}
function priceInfo(name, date, useOverride = true) {
  const p = S.prices[name];
  if (!p) return null;
  let ov;
  if (useOverride) {
    ov = S.overrides[date] ? S.overrides[date][name] : undefined;
    if (ov == null) { const r = rangeFor(name, date); if (r) ov = r.price; }
  }
  const price = ov != null ? ov : p.price;
  if (price === '' || price == null || !Number.isFinite(Number(price))) return null;
  return { price: Number(price), basis: p.basis, gpu: Number(p.gpu) || 0, offer: ov != null, base: p.price === '' || p.price == null ? null : Number(p.price) };
}
// Grams (or ml) behind a logged amount. A serving or item uses your grams per item, or is estimated from its calories
// using the same food's gram-logged entries.
function gramsOf(e, gpu) {
  if (e.type !== 'count') return { g: e.qty };
  if (gpu > 0) return { g: e.qty * gpu };
  const m = IDX.meta.get(e.name);
  if (m && m.kpg > 0 && e.kcal > 0) return { g: e.kcal / m.kpg, est: true };
  return null;
}
function calc(e, pi) {
  const { price, basis, gpu } = pi;
  if (e.type === 'count') {
    if (basis === 'unit') return e.qty * price;
    const gm = gramsOf(e, gpu);
    return gm ? gm.g / (basis === 'kg' ? 1000 : 100) * price : null;
  }
  if (basis === '100') return e.qty / 100 * price;
  if (basis === 'kg') return e.qty / 1000 * price;
  if (gpu > 0) return e.qty / gpu * price;
  return null;
}
function costOf(e, useOverride = true) {
  if (S.recipes[e.name]) return recipeEntryCost(e, useOverride);
  const pi = priceInfo(e.name, e.date, useOverride);
  if (!pi) return { cost: null, why: 'noprice' };
  const c = calc(e, pi);
  if (c == null) return { cost: null, why: 'needgpu' };
  return { cost: r2(c), offer: pi.offer, pi, est: e.type === 'count' && pi.basis !== 'unit' && !(pi.gpu > 0) };
}
/* ---- recipes: a custom Cronometer recipe is exported as one line, so its ingredients are entered here ---- */
function ingEntry(it, date) {
  const type = it.unit === 'item' ? 'count' : it.unit === 'ml' ? 'volume' : 'mass';
  return { name: canon(it.name), date, qty: Number(it.qty) || 0, unit: it.unit, type, kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0, group: '' };
}
function recipeCostOf(r, date, useOverride = true) {
  const parts = []; let cost = 0, missing = 0, offer = false;
  for (const it of r.items) {
    const e = ingEntry(it, date), pi = priceInfo(e.name, date, useOverride);
    let c = null, why = 'noprice';
    if (pi) { const v = calc(e, pi); if (v == null) why = 'needgpu'; else { c = r2(v); if (pi.offer) offer = true; } }
    if (c == null) missing++; else cost += c;
    parts.push({ it, e, cost: c, why });
  }
  return { cost: missing ? null : r2(cost), missing, offer, parts };
}
function recipeFrac(r, e) {
  if (e.type === 'count') return e.qty / (Number(r.servings) > 0 ? Number(r.servings) : 1);
  return Number(r.yieldG) > 0 ? e.qty / Number(r.yieldG) : null;
}
function recipeEntryCost(e, useOverride = true) {
  const r = S.recipes[e.name];
  if (!r.items.length) return { cost: null, why: 'recipe' };
  const frac = recipeFrac(r, e);
  if (frac == null) return { cost: null, why: 'needyield' };
  const rc = recipeCostOf(r, e.date, useOverride);
  if (rc.cost == null) return { cost: null, why: 'recipe' };
  return { cost: r2(rc.cost * frac), offer: rc.offer, recipe: { rc, frac } };
}
function issue(name) {
  if (!(IDX.byName.get(name) || []).length) { const p = S.prices[name]; return p && p.price !== '' && p.price != null ? null : 'noprice'; }
  for (const e of IDX.byName.get(name) || []) {
    const c = costOf(e);
    if (c.cost == null) return c.why;
  }
  return null;
}
function spend(name) {
  let total = 0, count = 0;
  for (const e of IDX.byName.get(name) || []) { const c = costOf(e); if (c.cost != null) { total += c.cost; count++; } }
  return { total: r2(total), count };
}
function summarize(es) {
  let cost = 0, kcal = 0, pro = 0, unpriced = 0, saved = 0;
  for (const e of es) {
    const c = costOf(e);
    kcal += e.kcal; pro += e.pro;
    if (c.cost == null) unpriced++;
    else {
      cost += c.cost;
      if (c.offer) { const b = costOf(e, false); if (b.cost != null) saved += b.cost - c.cost; }
    }
  }
  return { cost: r2(cost), kcal, pro, unpriced, saved: r2(saved) };
}
const GROUP_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks', 'snack'];
function groupEntries(es) {
  const m = new Map();
  for (const e of es) { if (!m.has(e.group)) m.set(e.group, []); m.get(e.group).push(e); }
  const rank = g => { const i = GROUP_ORDER.indexOf(g.toLowerCase()); return i < 0 ? 50 : i; };
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}
function basisText(basis, name) {
  const m = IDX.meta.get(name) || { vol: 0, mass: 0, unit: 'item' };
  if (basis === '100') return m.vol > m.mass ? '100 ml' : '100 g';
  if (basis === 'kg') return m.vol > m.mass ? 'litre' : 'kg';
  return m.countFirst ? m.unit : 'item';
}

/* ============ view: import ============ */
function importView() {
  return `
  <header class="topbar plain"><div class="wrap"><div class="brand"><b>Coach Leonidas</b><span>Meal cost calculator</span></div><span class="grow"></span><span class="muted">Free and private</span>${window.MealSync ? MealSync.topHtml() : ''}</div></header>
  <main class="wrap">
    ${S.error ? `<div class="notice error" role="alert">${IC.info}<div>${esc(S.error)}</div></div>` : ''}
    <div class="hero">
      <div style="flex:1 1 520px">
        <h1 id="h1" tabindex="-1">See what each meal really costs.</h1>
        <p class="lede" style="font-size:19px;line-height:1.55">Drop in your Cronometer export, or add your foods by hand, add your grocery prices once, and get a cost for every meal, every day and every week.</p>
        <div class="drop" id="drop">
          ${IC.upload}
          <div style="flex:1 1 220px;min-width:0"><div style="font-weight:600;font-size:18px">Drop your Cronometer export here</div><div class="muted" style="font-size:14px;margin-top:4px">Food &amp; Recipe Entries, as a .csv file</div></div>
          <button class="btn primary" data-act="import">Choose file</button>
        </div>
        <div style="margin-top:18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px">
          <button class="btn outline" data-act="sample">Try it with sample data</button>
          <button class="btn outline" data-act="start-manual">Add foods by hand</button>
          <button class="btn link" data-act="restore">Restore saved prices</button>
          <span class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">${IC.lock}Your file is read in this browser. Nothing is uploaded.</span>
        </div>
      </div>
      <div style="flex:1 1 420px">
        <div class="card preview" aria-label="Example of a day's cost">
          <div class="row" style="justify-content:space-between"><b>Wednesday 11 November</b><span class="muted" style="font-size:13px">Sample day</span></div>
          <div style="margin:22px 0 26px"><div class="pricetag sm"><span class="n">€9.90</span><span class="l">for the day</span></div></div>
          ${['Breakfast|€1.63', 'Lunch|€3.10', 'Dinner|€4.35|1', 'Snacks|€0.82'].map(x => { const [n, c, o] = x.split('|'); return `<div class="row" style="padding:9px 0;font-size:17px"><span>${n}</span>${o ? '<span class="offer-tag" style="margin-left:10px">1 offer</span>' : ''}<span class="lead"></span><span>${c}</span></div>`; }).join('')}
          <div class="statline" style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line)">
            <div><div class="big" style="font-size:28px">€5.85</div><div class="muted" style="font-size:13px">per 100 g protein</div></div>
            <div><div class="big" style="font-size:28px">€3.93</div><div class="muted" style="font-size:13px">per 1,000 kcal</div></div>
          </div>
        </div>
      </div>
    </div>
    <section class="steps">
      <h2>Three steps, about five minutes the first time</h2>
      <div style="display:flex;flex-wrap:wrap;gap:32px">
        <div class="s"><span class="num">1</span><div><div style="font-weight:600;font-size:18px">Export from Cronometer</div><p class="muted" style="margin-top:6px">On the web app, open Account, choose Export Data, then Food &amp; Recipe Entries. Pick your dates and download the CSV.</p><p class="muted" style="margin-top:8px">The Cronometer phone app has no export. Open the website in your browser, and if it shows the phone layout, switch to Desktop site.</p><p style="margin-top:12px"><a class="btn sm" id="cronolink" href="https://cronometer.com/" target="_blank" rel="noopener">Open Cronometer to export</a></p></div></div>
        <div class="s"><span class="num">2</span><div><div style="font-weight:600;font-size:18px">Drop the file in</div><p class="muted" style="margin-top:6px">Your entries load straight away. Import a newer export any time: days you already have are updated, not duplicated.</p></div></div>
        <div class="s"><span class="num">3</span><div><div style="font-weight:600;font-size:18px">Add your prices once</div><p class="muted" style="margin-top:6px">Only foods you logged appear. Enter what you paid per kilo, per 100 g or per item. Prices are saved for next time.</p></div></div>
      </div>
    </section>
  </main>
  ${siteFooter()}`;
}
function siteFooter() {
  return `<footer class="site wrap"><a class="btn sm" href="https://cronometer.com/" target="_blank" rel="noopener" style="margin-bottom:16px">Get a new Cronometer export</a><br>A free tool from Coach Leonidas for people who track their food and their budget. <a href="https://coachleonidas.com">coachleonidas.com</a> <span class="legal"><a href="/privacy">Privacy policy</a> <a href="/terms">Terms of service</a></span></footer>`;
}

/* ============ view: shell ============ */
const TABIC = {
  day: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>',
  prices: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>',
  week: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V12M10 20V6M15 20V10M20 20V15"/></svg>',
  trends: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/></svg>',
  meals: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16a8 8 0 0 1-16 0zM8 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3"/></svg>',
};

const TOOLIC = {
  import: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
  'export-csv': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
  'add-food': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  theme: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
};
const themeLabel = () => ({ auto: 'Auto', light: 'Light', dark: 'Dark' })[window.MealTheme ? MealTheme.get() : 'auto'];
function toolBtn(act, label, cls = '') {
  return `<button class="btn sm tb ${cls}" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}">${TOOLIC[act]}<span class="lbl">${esc(label)}</span></button>`;
}
function appView() {
  const body = S.tab === 'prices' ? pricesView() : S.tab === 'week' ? weekView() : S.tab === 'trends' ? trendsView() : S.tab === 'meals' ? mealsView() : dayView();
  return `
  <div class="shell">
  <header class="topbar"><div class="wrap">
    <button class="burger" data-act="drawer" aria-label="Menu" aria-expanded="false" aria-controls="drawer"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <div class="brand"><b>Meal cost</b><span>by Coach Leonidas</span></div>
    <nav class="tabs" aria-label="Sections">${['day', 'prices', 'week', 'trends', 'meals'].map(t => `<a class="tab" href="#${t}"${S.tab === t ? ' aria-current="page"' : ''}>${TABIC[t]}<span>${cap(t)}</span></a>`).join('')}</nav>
    <div class="tools">${toolBtn('add-food', 'Add a food')}${toolBtn('import', 'Add export', 'pri')}${toolBtn('export-csv', 'Download CSV')}${toolBtn('theme', 'Theme: ' + themeLabel())}${window.MealSync ? MealSync.topHtml() : ''}</div>
  </div></header>
  <div class="scrim" data-act="drawer-close"></div>
  <aside class="drawer" id="drawer" aria-label="Menu">
    <div class="dhead"><b>Meal cost</b><button class="burger" data-act="drawer-close" aria-label="Close menu"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <button class="ditem" data-act="add-food">${TOOLIC['add-food']}<span>Add a food</span></button>
    <button class="ditem" data-act="import">${TOOLIC.import}<span>Add Cronometer export</span></button>
    <a class="ditem" href="https://cronometer.com/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg><span>Get a new Cronometer export</span></a>
    <button class="ditem" data-act="export-csv">${TOOLIC['export-csv']}<span>Download CSV</span></button>
    <button class="ditem" data-act="theme">${TOOLIC.theme}<span>Theme: ${themeLabel()}</span></button>
    <div class="dlinks"><a href="/privacy">Privacy policy</a><a href="/terms">Terms of service</a><a href="https://coachleonidas.com">coachleonidas.com</a></div>
  </aside>
  <div class="scroll" id="scroller">
  <main class="wrap">${window.MealSync ? MealSync.bannerHtml() : ''}${S.error ? `<div class="notice error" role="alert">${IC.info}<div>${esc(S.error)}</div></div>` : ''}${body}</main>
  ${siteFooter()}
  </div>
  </div>`;
}

/* ============ view: day ============ */
function swapFor(es) {
  // Suggest a cheaper food with similar protein density for the priciest high-protein item.
  const rates = new Map();
  for (const [name, list] of IDX.byName) {
    if (S.recipes[name]) continue;
    let g = 0, pro = 0, cpg = null;
    for (const e of list) {
      if (e.type === 'count') continue;
      g += e.qty; pro += e.pro;
      if (cpg == null) { const c = costOf(e, false); if (c.cost != null && e.qty > 0) cpg = calcRaw(e) / e.qty; }
    }
    if (g > 0 && cpg != null) rates.set(name, { cpg, ppg: pro / g });
  }
  let best = null;
  for (const e of es) {
    if (e.type === 'count' || e.pro < 15 || S.recipes[e.name]) continue;
    const c = costOf(e); const mine = rates.get(e.name);
    if (c.cost == null || !mine || mine.ppg <= 0) continue;
    for (const [name, r] of rates) {
      if (name === e.name || r.ppg < 0.08) continue;
      const ratio = r.ppg / mine.ppg;
      if (ratio < 0.6 || ratio > 1.6) continue;
      const newPro = e.qty * r.ppg, newCost = e.qty * r.cpg, saving = c.cost - newCost;
      if (newPro < e.pro * 0.95 || saving < Math.max(0.2, c.cost * 0.1)) continue;
      if (!best || saving > best.saving) best = { from: e.name, to: name, qty: e.qty, unit: e.unit, saving: r2(saving), dPro: newPro - e.pro };
    }
  }
  return best;
}
function calcRaw(e) { const pi = priceInfo(e.name, e.date, false); return pi ? calc(e, pi) : 0; }

function emptyDiary(title) {
  return `<h1 class="h1" id="h1" tabindex="-1">${title}</h1><div class="card pad" style="margin-top:24px;max-width:560px"><h2 style="font-size:17px">Nothing is logged yet</h2><p class="muted" style="margin-top:8px">Build a meal and add it to your diary, or import a Cronometer export. Either way it shows up here.</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px"><a class="btn primary" href="#meals">Build a meal</a><button class="btn" data-act="import">Add Cronometer export</button></div></div>`;
}
function dayView() {
  const dates = IDX.dates;
  if (!dates.length) return emptyDiary('Day');
  if (!S.day || !IDX.byDate.has(S.day)) S.day = dates[dates.length - 1];
  const day = S.day, es = IDX.byDate.get(day), sm = summarize(es), idx = dates.indexOf(day);
  const start = Math.max(0, Math.min(idx - 3, dates.length - 7)), win = dates.slice(start, start + 7);
  const wt = win.map(d => ({ d, t: summarize(IDX.byDate.get(d)).cost }));
  const wmax = Math.max(...wt.map(x => x.t), 1);
  const names = [...new Set(es.map(e => e.name))];
  const bad = names.filter(n => issue(n));
  const offerNames = [...new Set(es.filter(e => costOf(e).offer).map(e => e.name))];
  const groups = groupEntries(es);
  const swap = swapFor(es);
  const pp = sm.pro > 0 && sm.cost > 0 ? sm.cost / (sm.pro / 100) : null;
  const pk = sm.kcal > 0 && sm.cost > 0 ? sm.cost / (sm.kcal / 1000) : null;

  const mealHtml = groups.map(([g, list]) => {
    let cost = 0, kcal = 0;
    const items = list.map((e, li) => {
      const c = costOf(e); kcal += e.kcal;
      const rec = S.recipes[e.name];
      let cell, note = '';
      if (c.cost == null) {
        const lbl = { needgpu: 'Add grams per item', recipe: 'Price the ingredients', needyield: 'Set recipe weight' }[c.why] || 'Set price';
        cell = `<button class="setprice" data-act="${rec ? 'edit-recipe' : 'goto-price'}" data-name="${esc(e.name)}">${lbl}</button>`;
      } else {
        cost += c.cost;
        const tag = c.offer ? '<span class="offer-tag">Offer</span>' : '';
        cell = rec
          ? `<button class="costbtn" data-act="edit-recipe" data-name="${esc(e.name)}" aria-label="Edit the recipe ${esc(e.name)}">${tag}<span>${money(c.cost)}</span></button>`
          : `<button class="costbtn" data-act="offer" data-date="${day}" data-name="${esc(e.name)}" aria-label="Change the price of ${esc(e.name)} for this day">${tag}<span>${money(c.cost)}</span></button>`;
        if (!rec && c.offer && c.pi.base != null) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today, usually ${money(c.pi.base)}</div>`;
        else if (!rec && c.offer) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today</div>`;
        if (c.est) note += `<div class="note" style="color:var(--muted)">Serving size estimated from calories</div>`;
      }
      const key = `${day}|${g}|${li}`, open = !!rec && S.open.has(key);
      const toggle = rec ? `<div><button class="btn link" data-act="toggle-recipe" data-key="${esc(key)}" aria-expanded="${open}">${open ? 'Hide' : 'Show'} ingredients</button></div>` : '';
      let subs = '';
      if (open) {
        const fr = recipeFrac(rec, e), rc = recipeCostOf(rec, e.date);
        subs = `<div class="subitems">${rc.parts.map(p => `<div class="subitem"><span>${esc(p.it.name)}</span><span class="amt">${fr == null ? '' : qtyFmt(Number(p.it.qty) * fr) + ' ' + esc(p.it.unit)}</span><span class="lead"></span>${p.cost != null && fr != null ? `<span>${money(r2(p.cost * fr))}</span>` : `<button class="setprice" data-act="goto-price" data-name="${esc(p.e.name)}">${p.why === 'needgpu' ? 'Add grams per item' : 'Set price'}</button>`}</div>`).join('')}</div>`;
      }
      return `<div class="item"><div style="min-width:0"><span style="font-size:17px">${esc(e.name)}</span><span class="amt">${qtyFmt(e.qty)} ${esc(e.unit)}</span>${note}${toggle}</div><span class="lead"></span>${cell}</div>${subs}`;
    }).join('');
    return `<section class="meal"><div class="meal-head"><h2>${esc(g)}</h2><span class="kcal">${n0(kcal)} kcal</span><span class="cost">${money(r2(cost))}</span></div><div style="margin-top:8px">${items}</div></section>`;
  }).join('');

  const budget = S.budget > 0 ? S.budget : null;
  const left = budget ? r2(budget - sm.cost) : 0;
  const pct = budget ? Math.min(100, Math.round(sm.cost / budget * 100)) : 0;

  return `
  <div class="pagehead">
    <h1 class="h1" id="h1" tabindex="-1">${esc(dLong(day))}</h1>
    <div style="display:flex;gap:8px">
      <button class="iconbtn" data-act="prev-day" aria-label="Previous day"${idx <= 0 ? ' disabled' : ''}>${IC.left}</button>
      <button class="iconbtn" data-act="next-day" aria-label="Next day"${idx >= dates.length - 1 ? ' disabled' : ''}>${IC.right}</button>
    </div>
    ${dates.length > 7 ? `<label class="sr" for="daysel">Pick a day</label><select class="field" id="daysel">${dates.slice().reverse().map(d => `<option value="${d}"${d === day ? ' selected' : ''}>${esc(dMed(d))}</option>`).join('')}</select>` : ''}
    ${bad.length ? `<a class="status warn" href="#prices" data-act="unpriced-link">${IC.info}${bad.length} ${bad.length === 1 ? 'food needs' : 'foods need'} a price</a>` : `<a class="status" href="#prices">${IC.check}All ${names.length} foods priced</a>`}
  </div>
  <div class="strip" role="group" aria-label="Pick a day">${wt.map(x => `<button class="daybtn" data-act="pick-day" data-date="${x.d}" aria-pressed="${x.d === day}"><i style="height:${Math.max(3, Math.round(x.t / wmax * 28))}px"></i><small>${esc(dShort(x.d))}</small><b>${money(x.t)}</b></button>`).join('')}</div>
  <div class="cols" style="margin-top:32px">
    <div class="card main2" style="padding:8px 32px 16px">${mealHtml}<p class="muted" style="margin:16px 0 8px;font-size:13px">Select any price to change it for this day only. Your standard prices stay as they are.</p></div>
    <aside class="side">
      <div class="card" style="padding:28px 28px 24px">
        <div class="pricetag"><span class="n">${money(sm.cost)}</span><span class="l">for the day</span></div>
        ${sm.saved > 0.004 ? `<p style="margin-top:16px;color:var(--brand-dark)">${offerNames.length === 1 ? `Your offer on ${esc(offerNames[0])}` : `Your ${offerNames.length} offers`} saved you ${money(sm.saved)} today.</p>` : ''}
        ${sm.unpriced ? `<p style="margin-top:12px;font-size:14px">Totals leave out ${sm.unpriced} ${sm.unpriced === 1 ? 'item' : 'items'} without a price.</p>` : ''}
        <div style="margin-top:22px">
          ${budget ? `<div class="row" style="justify-content:space-between;font-size:14px"><span>Daily budget ${money(budget)}</span><b>${left >= 0 ? money(left) + ' left' : money(-left) + ' over'}</b></div>
          <div class="bar" role="img" aria-label="${pct} percent of the daily budget used" style="margin-top:8px"><div style="width:${pct}%${left < 0 ? ';background:var(--ink)' : ''}"></div></div>
          <button class="btn link" data-act="budget">Change budget</button>` : `<button class="btn outline" data-act="budget">Set a daily budget</button>`}
        </div>
      </div>
      <div class="card statline" style="padding:24px 28px">
        ${pp != null ? `<div><div class="big">${money(pp)}</div><div class="muted" style="font-size:13px">per 100 g protein</div></div>` : ''}
        ${pk != null ? `<div><div class="big">${money(pk)}</div><div class="muted" style="font-size:13px">per 1,000 kcal</div></div>` : ''}
        <div><div class="big">${n0(sm.pro)} g</div><div class="muted" style="font-size:13px">protein, ${n0(sm.kcal)} kcal</div></div>
      </div>
      ${swap ? `<div class="card" style="padding:24px 28px"><h2 style="font-size:17px">A cheaper way to hit your protein</h2>
        <p style="margin-top:10px">Swap the ${qtyFmt(swap.qty)} ${esc(swap.unit)} of ${esc(swap.from)} for ${qtyFmt(swap.qty)} ${esc(swap.unit)} of ${esc(swap.to)}. It saves ${money(swap.saving)}${swap.dPro >= 1 ? ' and adds ' + n0(swap.dPro) + ' g of protein' : ' and keeps the protein about the same'}.</p>
        <p class="muted" style="margin-top:8px;font-size:13px">Based on your own prices and today's offers.</p></div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <button class="btn primary" style="flex:1 1 160px" data-act="share-image">Make share image</button>
        <button class="btn" style="flex:1 1 160px" data-act="copy-day">Copy as text</button>
      </div>
    </aside>
  </div>`;
}

/* ============ view: prices ============ */
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
function fmtAmount(m) {
  const parts = [];
  if (m.g > 0) parts.push(m.g >= 1000 ? nf1.format(m.g / 1000) + ' kg' : Math.round(m.g) + ' g');
  if (m.ml > 0) parts.push(m.ml >= 1000 ? nf1.format(m.ml / 1000) + ' l' : Math.round(m.ml) + ' ml');
  if (m.cnt > 0) parts.push(`${nf1.format(m.cnt)} ${m.unit}${m.cnt === 1 || /s$/.test(m.unit) ? '' : 's'}`);
  return parts.join(' + ');
}
// Total logged as grams or ml. Foods logged as pieces count by grams per item when you have set it.
function amountKey(name) {
  const m = IDX.meta.get(name), gpu = Number((S.prices[name] || {}).gpu) || 0;
  return m.g + m.ml + m.cnt * gpu;
}
const DEFAULT_CATS = ['Meat', 'Fish and seafood', 'Eggs', 'Dairy', 'Grains', 'Bread and bakery', 'Vegetables', 'Fruit', 'Legumes', 'Nuts and seeds', 'Oils and fats', 'Sweets and snacks', 'Drinks', 'Supplements', 'Sauces and spices', 'Ready meals', 'Other'];
const catOf = n => S.cats[n] || (S.recipes[n] ? 'Recipes' : ((IDX.meta.get(n) || {}).cat || 'Uncategorized'));
function estInfo(name) {
  if (S.recipes[name] || Number((S.prices[name] || {}).gpu) > 0) return 0;
  let g = 0, q = 0;
  for (const e of IDX.byName.get(name) || []) { if (e.type !== 'count') continue; const gm = gramsOf(e, 0); if (gm) { g += gm.g; q += e.qty; } }
  return q > 0 ? g / q : 0;
}
function subText(name, iss) {
  const m = IDX.meta.get(name), r = S.recipes[name];
  const pre = { noprice: 'Needs a price. ', needgpu: `Needs grams per ${/^(serving|portion|dose)s?$/.test(m.unit) ? m.unit : 'item'}. `, recipe: 'Some ingredients need a price. ', needyield: 'Needs the recipe weight in grams. ' }[iss] || '';
  if (!m.n) return pre + 'Used as a recipe ingredient';
  let t = `${pre}${r ? 'Recipe. ' : ''}Logged ${m.n} ${m.n === 1 ? 'time' : 'times'}, ${fmtAmount(m)}`;
  const est = estInfo(name);
  if (est) t += `. One ${m.unit} is about ${Math.round(est)} g, estimated from your calories`;
  return t;
}
function offerCounts() {
  const m = new Map();
  for (const r of S.ranges) m.set(r.name, (m.get(r.name) || 0) + 1);
  for (const d in S.overrides) for (const n in S.overrides[d]) m.set(n, (m.get(n) || 0) + 1);
  return m;
}
function priceRow(name, oc) {
  const p = S.prices[name], m = IDX.meta.get(name), iss = issue(name), sp = spend(name), o = oc.get(name) || 0, rec = S.recipes[name], est = estInfo(name);
  const vol = m.vol > m.mass;
  const sub = subText(name, iss), k = m.members.length;
  return `<tr data-name="${esc(name)}"${iss ? ' class="needs"' : ''}>
    <th scope="row"><div class="fname">${esc(name)}${o ? ` <span class="offer-tag">${o} ${o === 1 ? 'offer' : 'offers'}</span>` : ''}${catOf(name) !== 'Uncategorized' ? `<span class="catlab">${esc(catOf(name))}</span>` : ''}</div><div class="sub sl">${esc(sub)}</div><details class="more"><summary>Details</summary><div class="moreb">${m.custom || S.foods[name] ? `<div><button class="btn link" data-act="edit-food" data-name="${esc(name)}">Edit nutrition</button></div>` : ''}<div class="sub"><input class="catin" list="catlist" data-cat aria-label="Category of ${esc(name)}" placeholder="Add a category" value="${esc(catOf(name) === 'Uncategorized' ? '' : catOf(name))}"></div>${macroLine(name) ? `<div class="sub">${esc(macroLine(name))}</div>` : ''}${m.extra ? '' : `<div class="sub acts">${k ? `Includes ${k} other ${k === 1 ? 'name' : 'names'}. ` : ''}<button class="btn link" data-act="merge" data-name="${esc(name)}" aria-label="Merge ${esc(name)} with another food">${k ? 'Manage merges' : 'Merge'}</button>${rec ? '' : `<button class="btn link" data-act="edit-recipe" data-name="${esc(name)}" aria-label="Make ${esc(name)} a recipe with ingredients">Make a recipe</button>`}</div>`}</div></details></th>
    ${rec ? `<td colspan="3"><div class="muted" style="font-size:14px">Recipe with ${rec.items.length} ${rec.items.length === 1 ? 'ingredient' : 'ingredients'}, ${esc(rec.servings)} ${Number(rec.servings) === 1 ? 'serving' : 'servings'}</div><button class="btn link" data-act="edit-recipe" data-name="${esc(name)}">Edit recipe</button></td>` : `
    <td><div class="money-in"><span>${esc(currencySymbol())}</span><input type="text" inputmode="decimal" data-f="price" aria-label="Price of ${esc(name)}" placeholder="0.00" value="${p.price === '' ? '' : esc(p.price)}"></div></td>
    <td><select class="field" data-f="basis" aria-label="Price unit for ${esc(name)}">
      <option value="kg"${p.basis === 'kg' ? ' selected' : ''}>per ${vol ? 'litre' : 'kg'}</option>
      <option value="100"${p.basis === '100' ? ' selected' : ''}>per ${vol ? '100 ml' : '100 g'}</option>
      <option value="unit"${p.basis === 'unit' ? ' selected' : ''}>per ${m.countFirst ? esc(m.unit) : 'item'}</option></select></td>
    <td><input class="field gpu" type="text" inputmode="decimal" data-f="gpu" aria-label="Grams per ${esc(m.unit)} for ${esc(name)}" placeholder="${est ? 'about ' + Math.round(est) : 'optional'}" value="${p.gpu === '' ? '' : esc(p.gpu)}"></td>`}
    <td class="r sp">${sp.count ? money(sp.total) : '<span class="muted">Not counted</span>'}</td></tr>`;
}
function macros(name, per) {
  const m = IDX.meta.get(name);
  if (!m) return null;
  if (per === 'kcal') return m.tk > 0 ? { p: m.tp / m.tk * 100, c: m.tc / m.tk * 100, f: m.tf / m.tk * 100, b: m.tb / m.tk * 100 } : null;
  return m.mq >= 50 ? { p: m.mp / m.mq * 100, c: m.mc / m.mq * 100, f: m.mf / m.mq * 100, b: m.mb / m.mq * 100 } : null;
}
function macroLine(name) {
  const per = S.sort.endsWith('k') ? 'kcal' : 'g', x = macros(name, per);
  return x ? `Per 100 ${per}: ${nf1.format(x.p)} g protein, ${nf1.format(x.c)} g carbs, ${nf1.format(x.f)} g fat, ${nf1.format(x.b)} g fiber` : '';
}
const MAC = { pro: ['Protein', 'p'], carb: ['Carbs', 'c'], fat: ['Fat', 'f'], fiber: ['Fiber', 'b'] };
const SORTS = { freq: ['Times logged', 'most often logged first', 'least often logged first'], amount: ['Total amount logged', 'largest total amount first', 'smallest total amount first'], spent: ['Total spent', 'highest total spent first', 'lowest total spent first'], name: ['Name', 'A to Z', 'Z to A'] };
for (const [k, [label]] of Object.entries(MAC)) {
  SORTS[k + '100'] = [`${label} per 100 g`, `most ${label.toLowerCase()} per 100 g first`, `least ${label.toLowerCase()} per 100 g first`];
  SORTS[k + '100k'] = [`${label} per 100 kcal`, `most ${label.toLowerCase()} per 100 kcal first`, `least ${label.toLowerCase()} per 100 kcal first`];
}
function filteredFoods() {
  const oc = offerCounts();
  const nOf = n => IDX.meta.get(n).n;
  const mk = S.sort.match(/^(pro|carb|fat|fiber)100(k?)$/);
  const val = new Map([...IDX.meta.keys()].map(n => [n, mk ? (() => { const x = macros(n, mk[2] ? 'kcal' : 'g'); return x ? x[MAC[mk[1]][1]] : -1; })() : S.sort === 'amount' ? amountKey(n) : S.sort === 'spent' ? spend(n).total : nOf(n)]));
  let names = [...IDX.meta.keys()].sort(S.sort === 'name'
    ? (a, b) => a.localeCompare(b)
    : (a, b) => val.get(b) - val.get(a) || nOf(b) - nOf(a) || a.localeCompare(b));
  if (S.flip) names.reverse();
  const q = S.filter.trim().toLowerCase();
  if (q) names = names.filter(n => n.toLowerCase().includes(q) || IDX.meta.get(n).members.some(x => x.toLowerCase().includes(q)));
  if (S.cat) names = names.filter(n => catOf(n) === S.cat);
  if (S.chip === 'unpriced') names = names.filter(n => issue(n));
  if (S.chip === 'offers') names = names.filter(n => oc.get(n));
  return { names, oc };
}
function priceBodyHtml() {
  const { names, oc } = filteredFoods();
  const limited = !S.showAll && !S.filter && !S.cat && S.chip === 'all' && names.length > 12;
  const shown = limited ? names.slice(0, 12) : names;
  const total = IDX.meta.size;
  const rows = shown.length ? shown.map(n => priceRow(n, oc)).join('') : `<tr><td colspan="5" style="padding:24px 20px" class="muted">No foods match. Clear the search or choose another filter.</td></tr>`;
  const foot = `<span class="muted" style="font-size:14px">Showing ${shown.length} of ${total} foods, ${SORTS[S.sort][S.flip ? 2 : 1]}</span>${limited ? '<button class="btn link" data-act="toggle-all">Show all foods</button>' : (S.showAll && total > 12 && !S.filter && !S.cat && S.chip === 'all' ? '<button class="btn link" data-act="toggle-all">Show fewer</button>' : '')}`;
  return { rows, foot };
}
/* ---- merging foods ---- */
const STOP = new Set(['raw', 'fresh', 'with', 'the', 'and', 'of', 'in', 'classic', 'skin', 'whole']);
function toks(name) {
  return new Set(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOP.has(t)).map(t => t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}
const pairKey = (a, b) => [a, b].sort().join('|');
function mergeSuggestions() {
  const names = [...IDX.meta.keys()], T = names.map(toks), out = [];
  for (let i = 0; i < names.length; i++) {
    if (!T[i].size) continue;
    for (let j = i + 1; j < names.length; j++) {
      if (!T[j].size) continue;
      let inter = 0; for (const t of T[i]) if (T[j].has(t)) inter++;
      if (!inter) continue;
      const mn = Math.min(T[i].size, T[j].size), mx = Math.max(T[i].size, T[j].size), un = T[i].size + T[j].size - inter;
      if (!((inter === mn && inter / mx >= 0.5) || inter / un >= 0.7)) continue;
      if (S.nomerge.includes(pairKey(names[i], names[j]))) continue;
      const [keep, drop] = IDX.meta.get(names[i]).n >= IDX.meta.get(names[j]).n ? [names[i], names[j]] : [names[j], names[i]];
      out.push({ keep, drop, w: IDX.meta.get(keep).n + IDX.meta.get(drop).n });
    }
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 6);
}
function doMerge(src, target) {
  S.merges[src] = target;
  const ps = S.prices[src], pt = S.prices[target];
  if (ps && ps.price !== '' && ps.price != null && (!pt || pt.price === '' || pt.price == null)) S.prices[target] = { ...ps };
  for (const d in S.overrides) {
    if (S.overrides[d][src] != null) { if (S.overrides[d][target] == null) S.overrides[d][target] = S.overrides[d][src]; delete S.overrides[d][src]; }
  }
  for (const r of S.ranges) if (r.name === src) r.name = target;
  if (S.recipes[src]) { if (!S.recipes[target]) S.recipes[target] = S.recipes[src]; delete S.recipes[src]; }
  indexRanges(); reindex(); ensurePrices(); saveAll();
}
function openMerge(name) {
  const dlg = $('#dlg'), m = IDX.meta.get(name); dlg.classList.remove('wide');
  if (!m) return;
  const others = [...IDX.meta.keys()].filter(n => n !== name).sort((a, b) => IDX.meta.get(b).n - IDX.meta.get(a).n || a.localeCompare(b));
  dlg.innerHTML = `<form id="mform" method="dialog">
    <h2 id="dlg-title" style="font-size:20px">Merge foods</h2>
    <p class="muted" style="font-size:14px">Count <b>${esc(name)}</b> as another food. Its entries then share that food's name and price. Your Cronometer data is not changed, and you can undo this.</p>
    <div><label for="mt">Merge into</label><input class="field" style="width:100%" id="mt" list="mlist" autocomplete="off" placeholder="Start typing a food name"><datalist id="mlist">${others.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
    <div id="merr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    ${m.members.length ? `<div><div style="font-weight:600;font-size:14px">Already merged into ${esc(name)}</div>${m.members.map(x => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--line2)"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(x)}</span><button type="button" class="btn link" data-act="unmerge" data-src="${esc(x)}">Undo</button></div>`).join('')}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">Merge</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
  </form>`;
  $('#mform').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = $('#mt').value.trim();
    if (!IDX.meta.has(t) || t === name) { $('#merr').textContent = 'Choose a food from the list.'; $('#mt').focus(); return; }
    dlg.close(); doMerge(name, t); render(); toast(`Merged into ${t}`);
  });
  dlg.showModal(); $('#mt').focus();
}


/* ---- barcode lookup: Open Food Facts first, USDA FoodData Central as a fallback ---- */
const r1 = x => Math.round(x * 10) / 10;
async function lookupBarcode(raw) {
  const code = String(raw || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) throw new Error('Enter the digits printed under the barcode (8 to 14 numbers).');
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json(), pr = j && j.status === 1 && j.product;
      if (pr) {
        const n = pr.nutriments || {}, kj = Number(n['energy_100g']);
        const kcal = Number.isFinite(Number(n['energy-kcal_100g'])) ? Number(n['energy-kcal_100g']) : Number.isFinite(kj) ? kj / 4.184 : 0;
        const nm = [String(pr.brands || '').split(',')[0].trim(), String(pr.product_name || '').trim()].filter(Boolean).join(' ');
        if (nm) return { name: nm.slice(0, 60), kcal: r1(kcal), pro: r1(Number(n['proteins_100g']) || 0), carb: r1(Number(n['carbohydrates_100g']) || 0), fat: r1(Number(n['fat_100g']) || 0), source: 'Open Food Facts' };
      }
    }
  } catch (e) { /* fall through to the second source */ }
  try {
    const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${code}&dataType=Branded&pageSize=5&api_key=DEMO_KEY`);
    if (r.ok) {
      const j = await r.json(), f = (j.foods || []).find(x => String(x.gtinUpc || '').replace(/^0+/, '') === code.replace(/^0+/, ''));
      if (f) {
        const g = id => { const x = (f.foodNutrients || []).find(y => String(y.nutrientNumber) === id); return x ? Number(x.value) || 0 : 0; };
        const nm = [String(f.brandName || f.brandOwner || '').trim(), String(f.description || '').trim()].filter(Boolean).join(' ');
        return { name: nm.slice(0, 60), kcal: r1(g('208')), pro: r1(g('203')), carb: r1(g('205')), fat: r1(g('204')), source: 'USDA FoodData Central' };
      }
    }
  } catch (e) { /* not found */ }
  return null;
}
const scanFormats = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'];
const nativeScanner = () => window.MealNative && MealNative.isNative && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.BarcodeScanner;
const canScan = () => !!nativeScanner() || ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
let _stream = null;
function stopScan() { if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; } const v = $('#fvid'); if (v) { v.srcObject = null; v.hidden = true; } }
async function scanBarcode() {
  const NP = nativeScanner();
  if (NP) {
    try { const a = await NP.isGoogleBarcodeScannerModuleAvailable(); if (a && a.available === false) { await NP.installGoogleBarcodeScannerModule(); throw new Error('Getting the scanner ready. Try again in a few seconds.'); } } catch (e) { if (/ready/.test(e.message)) throw e; }
    const r = await NP.scan({ formats: scanFormats });
    return r && r.barcodes && r.barcodes[0] ? r.barcodes[0].rawValue : '';
  }
  const v = $('#fvid'), det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  v.srcObject = _stream; v.hidden = false; await v.play();
  return new Promise((resolve, reject) => {
    const t0 = Date.now(), tick = async () => {
      if (!_stream) return reject(new Error('cancelled'));
      try { const c = await det.detect(v); if (c.length) { stopScan(); return resolve(c[0].rawValue); } } catch (e) { /* keep trying */ }
      if (Date.now() - t0 > 45000) { stopScan(); return reject(new Error('No barcode found. Type the number instead.')); }
      setTimeout(tick, 250);
    };
    tick();
  });
}

/* ---- your own foods ---- */
function openFood(name) {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const cf = name ? S.foods[name] : null, p = name ? S.prices[name] : null, sym = currencySymbol();
  const v = x => x === undefined || x === null || x === '' ? '' : esc(x);
  const per = cf ? cf.per : '100g';
  dlg.innerHTML = `<form id="fform" method="dialog" novalidate>
    <h2 id="dlg-title" style="font-size:20px">${cf ? 'Edit food' : 'Add a food'}</h2>
    <p class="muted" style="font-size:14px">Enter what the label says and what you pay. Then use it in meals and rankings. No other app needed.</p>
    ${cf ? '' : `<div class="bc"><label for="fbc">Barcode</label><div class="bcrow"><input class="field" id="fbc" inputmode="numeric" autocomplete="off" placeholder="Type the number under the barcode"><button type="button" class="btn" id="fbl">Look up</button>${canScan() ? '<button type="button" class="btn" id="fscan">Scan</button>' : ''}</div><video id="fvid" playsinline muted hidden></video><div id="fbs" class="sub" role="status"></div></div>`}
    <div><label for="fn">Name</label><input class="field" style="width:100%" id="fn" maxlength="60" autocomplete="off" placeholder="For example, Greek yogurt"${cf ? ' readonly' : ''} value="${v(name)}"></div>
    <div><label for="fper">Nutrition is for</label><select class="field" style="width:100%" id="fper"><option value="100g"${per === '100g' ? ' selected' : ''}>100 g (or 100 ml)</option><option value="item"${per === 'item' ? ' selected' : ''}>1 item or serving</option></select></div>
    <div class="fgrid"><div><label for="fk">Calories</label><input class="field" id="fk" inputmode="decimal" placeholder="kcal" value="${v(cf && cf.kcal)}"></div><div><label for="fp">Protein (g)</label><input class="field" id="fp" inputmode="decimal" placeholder="0" value="${v(cf && cf.pro)}"></div><div><label for="fc">Carbs (g)</label><input class="field" id="fc" inputmode="decimal" placeholder="0" value="${v(cf && cf.carb)}"></div><div><label for="ff">Fat (g)</label><input class="field" id="ff" inputmode="decimal" placeholder="0" value="${v(cf && cf.fat)}"></div></div>
    <div class="fgrid"><div><label for="fpr">Price (${esc(sym)})</label><input class="field" id="fpr" inputmode="decimal" placeholder="optional" value="${v(p && p.price)}"></div><div><label for="fpb">Price is per</label><select class="field" id="fpb"><option value="kg"${p && p.basis === 'kg' ? ' selected' : ''}>kg or litre</option><option value="100"${!p || p.basis === '100' ? ' selected' : ''}>100 g or 100 ml</option><option value="unit"${p && p.basis === 'unit' ? ' selected' : ''}>item</option></select></div></div>
    <div id="fgw"${per === 'item' ? '' : ' hidden'}><label for="fg">Grams per item (optional)</label><input class="field" style="width:100%" id="fg" inputmode="decimal" placeholder="Lets a per-kg price work for items" value="${v(p && p.gpu)}"></div>
    <div id="ferr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">${cf ? 'Save' : 'Add food'}</button><button type="button" class="btn" data-act="close-dlg">Cancel</button>${cf ? `<button type="button" class="btn link" data-act="del-food" data-name="${esc(name)}">Delete</button>` : ''}</div>
  </form>`;
  const fill = r => { $('#fn').value = r.name; $('#fper').value = '100g'; $('#fgw').hidden = true; $('#fk').value = r.kcal; $('#fp').value = r.pro; $('#fc').value = r.carb; $('#ff').value = r.fat; };
  const doLookup = async code => {
    const st = $('#fbs'); st.textContent = 'Looking it up...';
    try { const r = await lookupBarcode(code); if (r) { fill(r); st.textContent = `Found in ${r.source}. Check the values, then add your price. Per 100 g.`; $('#fpr').focus(); } else st.textContent = 'Not found in Open Food Facts or USDA FoodData Central. Enter it by hand.'; }
    catch (e) { st.textContent = e.message; }
  };
  if ($('#fbl')) {
    $('#fbl').addEventListener('click', () => doLookup($('#fbc').value));
    $('#fbc').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); doLookup($('#fbc').value); } });
  }
  if ($('#fscan')) $('#fscan').addEventListener('click', async () => {
    const st = $('#fbs'); st.textContent = '';
    try { const c = await scanBarcode(); if (c) { $('#fbc').value = c; doLookup(c); } }
    catch (e) { stopScan(); if (!/cancel/i.test(String(e && e.message))) st.textContent = String(e && e.message || 'Could not open the camera.').slice(0, 140); }
  });
  dlg.addEventListener('close', stopScan, { once: true });
  $('#fper').addEventListener('change', () => { $('#fgw').hidden = $('#fper').value !== 'item'; if ($('#fper').value === 'item' && !$('#fpb').dataset.t) $('#fpb').value = 'unit'; });
  $('#fform').addEventListener('submit', ev => {
    ev.preventDefault();
    const nm = $('#fn').value.trim().replace(/\s+/g, ' '), err = t => { $('#ferr').textContent = t; };
    if (!nm) { err('Enter a name.'); $('#fn').focus(); return; }
    if (!cf && IDX.meta.has(canon(nm)) && !S.foods[nm]) { err('A food with this name already exists. Set its price on the Prices tab.'); return; }
    if (!cf && S.foods[nm]) { err('You already added this food. Search for it on the Prices tab to edit it.'); return; }
    const kcal = num($('#fk').value), pro = num($('#fp').value), carb = num($('#fc').value), fat = num($('#ff').value);
    if ([$('#fk').value, $('#fp').value, $('#fc').value, $('#ff').value].some(x => x.trim() && (!Number.isFinite(parseFloat(x.replace(',', '.'))) || parseFloat(x.replace(',', '.')) < 0))) { err('Nutrition values must be numbers, zero or more.'); return; }
    if (!(kcal > 0) && !(pro > 0) && !(carb > 0) && !(fat > 0)) { err('Enter at least the calories or one nutrient.'); $('#fk').focus(); return; }
    const prs = $('#fpr').value.trim(), price = prs === '' ? '' : num(prs);
    if (prs !== '' && (!/^\d+([.,]\d+)?$/.test(prs) || price < 0)) { err('Price must be a number, zero or more.'); $('#fpr').focus(); return; }
    const gpu = num($('#fg').value);
    S.foods[nm] = { per: $('#fper').value, kcal, pro, carb, fat };
    S.prices[nm] = { price, basis: $('#fpb').value, gpu: $('#fper').value === 'item' && gpu > 0 ? gpu : '' };
    S.started = true; reindex(); ensurePrices(); saveAll(); dlg.close(); render(); toast(cf ? 'Food saved' : `${nm} added`);
  });
  dlg.showModal(); (cf ? $('#fk') : $('#fn')).focus();
}
function counts() {
  const all = IDX.meta.size; let un = 0;
  for (const n of IDX.meta.keys()) if (issue(n)) un++;
  const offers = offerCounts().size;
  return { all, un, offers };
}
function pricesView() {
  const c = counts(), { rows, foot } = priceBodyHtml();
  const offerList = [];
  for (const d in S.overrides) for (const n in S.overrides[d]) offerList.push({ k: d, d, n, v: S.overrides[d][n] });
  for (const r of S.ranges) offerList.push({ k: r.from, r, n: r.name, v: r.price });
  offerList.sort((a, b) => b.k.localeCompare(a.k) || a.n.localeCompare(b.n));
  return `
  <div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Your prices</h1><button class="btn primary sm" data-act="add-food">Add a food</button></div>
  <p class="lede">Set a price once and it applies to every day you logged that food. Use an offer when a price was different on one day.</p>
  <div class="notice" id="unp" role="status"${c.un ? '' : ' hidden'}>${IC.info}<div id="unp-t">${unpText(c.un)}</div></div>
  <datalist id="catlist">${[...new Set([...DEFAULT_CATS, ...[...IDX.meta.keys()].map(catOf)])].filter(k => k !== 'Uncategorized').sort().map(k => `<option value="${esc(k)}"></option>`).join('')}</datalist>
  <div class="cols" style="margin-top:24px">
    <div class="main2" style="flex:2 1 640px">
      ${(() => {
        const unc = [...IDX.meta.keys()].filter(n => catOf(n) === 'Uncategorized').sort((a, b) => IDX.meta.get(b).n - IDX.meta.get(a).n || a.localeCompare(b));
        if (!unc.length) return '';
        const stale = ![...IDX.meta.values()].some(m => m.cat) && !Object.keys(S.cats).length;
        const head = `<button type="button" class="unctoggle" data-act="toggle-unc" aria-expanded="${S.uncOpen ? 'true' : 'false'}"><span class="t">Foods without a category (${unc.length})</span><span class="muted">${S.uncOpen ? 'Hide' : 'Show'}</span></button>`;
        if (!S.uncOpen) return `<div class="card" style="padding:16px 24px;margin-bottom:24px">${head}</div>`;
        return `<div class="card" style="padding:20px 24px;margin-bottom:24px">${head}
          <p class="muted" style="margin-top:10px;font-size:14px">${stale ? 'No categories came in with your saved data, because it was imported before categories were read. Import your Cronometer export again to bring them in, or assign them here.' : 'Cronometer did not give these a category.'} Click a field to pick from the list, or type your own.</p>
          <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th scope="col">Food</th><th scope="col" class="r">Logged</th><th scope="col">Category</th></tr></thead><tbody>${unc.slice(0, 40).map(n => `<tr data-name="${esc(n)}"><th scope="row" style="font-weight:400">${esc(n)}</th><td class="r">${IDX.meta.get(n).n}</td><td><input class="field" style="width:100%;min-width:180px" list="catlist" data-cat aria-label="Category of ${esc(n)}" placeholder="Pick or type a category"></td></tr>`).join('')}</tbody></table></div>
          ${unc.length > 40 ? `<p class="muted" style="margin-top:8px;font-size:13px">Showing the 40 most logged. The rest appear as you assign these.</p>` : ''}</div>`;
      })()}
      <div class="ptools">
        <div class="search">${IC.search}<input type="search" id="q" aria-label="Search foods" placeholder="Search foods" value="${esc(S.filter)}"></div>
        <div role="group" aria-label="Filter foods" style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="chip" data-act="chip" data-chip="all" aria-pressed="${S.chip === 'all'}">All <span id="c-all">${c.all}</span></button>
          <button class="chip" data-act="chip" data-chip="unpriced" aria-pressed="${S.chip === 'unpriced'}">No price <span id="c-un">${c.un}</span></button>
          <button class="chip" data-act="chip" data-chip="offers" aria-pressed="${S.chip === 'offers'}">With offers <span id="c-of">${c.offers}</span></button>
        </div>
      </div>
      <div class="ptools2">
        <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">Sort by <select class="field" id="sortsel">${[['Logging', ['freq', 'amount', 'spent', 'name']], ['Nutrients per 100 g', Object.keys(SORTS).filter(k => /^(pro|carb|fat|fiber)100$/.test(k))], ['Nutrients per 100 kcal', Object.keys(SORTS).filter(k => /^(pro|carb|fat|fiber)100k$/.test(k))]].map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}"${S.sort === k ? ' selected' : ''}>${SORTS[k][0]}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">Category <select class="field" id="catsel"><option value="">All</option>${(() => { const m = new Map(); for (const n of IDX.meta.keys()) m.set(catOf(n), (m.get(catOf(n)) || 0) + 1); return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `<option value="${esc(k)}"${S.cat === k ? ' selected' : ''}>${esc(k)} (${v})</option>`).join(''); })()}</select></label>
        <button class="btn sm" data-act="flip" aria-pressed="${S.flip}">${S.sort === 'name' ? (S.flip ? 'Z to A' : 'A to Z') : (S.flip ? 'Lowest first' : 'Highest first')}</button>
        <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">Currency <select class="field" id="cur">${CURRENCIES.map(x => `<option${x === S.currency ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <div class="tablewrap" style="margin-top:16px"><table>
        <thead><tr><th scope="col" aria-sort="${S.sort === 'name' ? (S.flip ? 'descending' : 'ascending') : 'none'}"><button class="thbtn" data-act="sort-col" data-sort="name">Food${S.sort === 'name' ? (S.flip ? ' \u2191' : ' \u2193') : ''}</button></th><th scope="col">Price</th><th scope="col">Per</th><th scope="col">Grams per serving or item</th><th scope="col" class="r" aria-sort="${S.sort === 'spent' ? (S.flip ? 'ascending' : 'descending') : 'none'}"><button class="thbtn" data-act="sort-col" data-sort="spent">Spent${S.sort === 'spent' ? (S.flip ? ' \u2191' : ' \u2193') : ''}</button></th></tr></thead>
        <tbody id="pbody">${rows}</tbody></table></div>
      <div id="pfoot" style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px">${foot}</div>
      <p class="muted" style="margin-top:8px;max-width:620px;font-size:13px">Grams per item is only needed when a food is logged one way and priced another, for example eggs logged as items but priced per kg.</p>
    </div>
    <aside class="side">
      ${(() => {
        const sg = mergeSuggestions();
        return sg.length ? `<div class="card" style="padding:24px 24px 16px">
          <h2 style="font-size:17px">Possible duplicates</h2>
          <p class="muted" style="margin-top:8px;font-size:14px">These look like the same food. Merging counts them as one food with one price.</p>
          <div style="margin-top:12px">${sg.map(x => `<div style="padding:14px 0;border-top:1px solid var(--line2)"><div style="font-size:14px;overflow-wrap:anywhere">${esc(x.drop)}</div><div class="muted" style="font-size:13px;margin:2px 0;overflow-wrap:anywhere">and ${esc(x.keep)}</div>
            <div style="display:flex;gap:16px"><button class="btn link" data-act="merge-now" data-drop="${esc(x.drop)}" data-keep="${esc(x.keep)}">Merge</button><button class="btn link" data-act="not-same" data-drop="${esc(x.drop)}" data-keep="${esc(x.keep)}">Not the same</button></div></div>`).join('')}</div>
        </div>` : '';
      })()}
      <div class="card" style="padding:24px 24px 16px">
        <h2 style="font-size:17px">Offers and price changes</h2>
        <p class="muted" style="margin-top:8px;font-size:14px">Your standard price covers every date. Add a price for one day, a shopping trip or a period, and it replaces the standard price on those dates.</p>
        <div style="margin-top:12px">${offerList.length ? offerList.map(o => {
          const base = S.prices[o.n] && S.prices[o.n].price !== '' ? S.prices[o.n].price : null;
          const when = o.r ? (o.r.to ? `${dMed(o.r.from)} to ${dMed(o.r.to)}` : `From ${dMed(o.r.from)}`) : dMed(o.d);
          const edit = o.r ? `data-id="${esc(o.r.id)}"` : `data-date="${o.d}" data-name="${esc(o.n)}"`;
          return `<div style="padding:14px 0;border-top:1px solid var(--line2)"><div style="display:flex;align-items:baseline;gap:10px"><span class="offer-tag">${o.r ? 'Period' : 'Offer'}</span><b>${esc(o.n)}</b></div>
          <div style="margin-top:6px;font-size:14px">${esc(when)}: ${money(o.v)} per ${esc(basisText(S.prices[o.n] ? S.prices[o.n].basis : 'kg', o.n))}${base != null ? ` <span class="muted">(usually ${money(base)})</span>` : ''}</div>
          <div style="display:flex;gap:16px"><button class="btn link" data-act="offer" ${edit}>Edit</button>${o.r ? `<button class="btn link" data-act="del-range" data-id="${esc(o.r.id)}">Remove</button>` : `<button class="btn link" data-act="del-offer" data-date="${o.d}" data-name="${esc(o.n)}">Remove</button>`}</div></div>`;
        }).join('') : '<p class="muted" style="padding:14px 0;border-top:1px solid var(--line2);font-size:14px">No offers yet.</p>'}</div>
        <button class="btn primary" style="width:100%;margin-bottom:12px" data-act="offer">Add an offer or price change</button>
      </div>
      ${window.MealSync && MealSync.cardHtml() ? `<div style="margin-bottom:24px">${MealSync.cardHtml()}</div>` : ''}
      <div class="card" style="padding:24px">
        <h2 style="font-size:17px">Keep your prices safe</h2>
        <p class="muted" style="margin-top:8px;font-size:14px">Without signing in, everything is saved in this browser only. Download a backup to keep a copy or move it to another device.</p>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn sm" data-act="backup">Download backup</button><button class="btn sm" data-act="restore">Restore backup</button></div>
        <button class="btn link" style="margin-top:8px" data-act="reset">Delete all data from this browser</button>
      </div>
    </aside>
  </div>`;
}
const unpText = k => `<strong>${k} ${k === 1 ? 'food needs' : 'foods need'} a price.</strong> Totals leave ${k === 1 ? 'it' : 'them'} out until you add one.`;

/* ============ view: trends ============ */
const tOf = d => Date.parse(d + 'T00:00:00Z') / 864e5;
const wkStart = d => isoAdd(d, -((dObj(d).getDay() + 6) % 7));
const METRICS = [
  { id: 'pro', title: 'Cost per 100 g protein', den: 'pro', scale: 100, min: 10 },
  { id: 'carb', title: 'Cost per 100 g carbs', den: 'carb', scale: 100, min: 20 },
  { id: 'fat', title: 'Cost per 100 g fat', den: 'fat', scale: 100, min: 5 },
  { id: 'fiber', title: 'Cost per 10 g fiber', den: 'fiber', scale: 10, min: 5 },
  { id: 'kcal', title: 'Cost per 1,000 kcal', den: 'kcal', scale: 1000, min: 300 }
];
// A point needs at least half of that period's calories to have a price, otherwise the ratio would be misleading.
const covered = s => s.kall > 0 && s.kcal / s.kall >= 0.5;
const ratio = (m, s, force) => (force || covered(s)) && s[m.den] >= m.min && s.cost > 0 ? s.cost / s[m.den] * m.scale : null;
const zero = d => ({ d, cost: 0, kcal: 0, kall: 0, pro: 0, carb: 0, fat: 0, fiber: 0, n: 0, days: 0 });
function dayStat(d) {
  const o = zero(d);
  for (const e of IDX.byDate.get(d)) {
    const c = costOf(e); o.kall += e.kcal; if (c.cost == null) continue;
    o.cost += c.cost; o.kcal += e.kcal; o.pro += e.pro; o.carb += e.carb; o.fat += e.fat; o.fiber += e.fiber || 0; o.n++;
  }
  o.days = o.n ? 1 : 0;
  return o;
}
const addTo = (a, b) => { for (const k of ['cost', 'kcal', 'kall', 'pro', 'carb', 'fat', 'fiber', 'n', 'days']) a[k] += b[k]; return a; };
function niceMax(v) {
  const raw = (v || 1) * 1.08, mag = Math.pow(10, Math.floor(Math.log10(raw / 4)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag * 4 >= raw) return k * mag * 4;
  return raw;
}
function chartFrame(label, inner, ymax, xl) {
  const W = 600, H = 240, L = 58, R = 16, T = 14, B = 32;
  const fmt = v => ymax >= 10 ? money0(v) : money(v);
  const grid = [0, 1, 2, 3, 4].map(i => { const v = ymax * i / 4, y = T + (1 - v / ymax) * (H - T - B); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line2)"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${esc(fmt(v))}</text>`; }).join('');
  const xs = xl.map(([x, t, a]) => `<text x="${x}" y="${H - 8}" text-anchor="${a}" font-size="12" fill="var(--muted)">${esc(t)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto;display:block">${grid}${inner}${xs}</svg>`;
}
function lineChart(pts, ma, label, weekly) {
  const W = 600, H = 240, L = 58, R = 16, T = 14, B = 32, all = pts.concat(ma || []);
  const x0 = Math.min(...all.map(p => tOf(p.d))), x1 = Math.max(...all.map(p => tOf(p.d)));
  const ymax = niceMax(Math.max(...all.map(p => p.v)));
  const X = d => L + (x1 > x0 ? (tOf(d) - x0) / (x1 - x0) : 0.5) * (W - L - R), Y = v => T + (1 - v / ymax) * (H - T - B);
  const first = all.reduce((a, p) => tOf(p.d) < tOf(a) ? p.d : a, all[0].d), last = all.reduce((a, p) => tOf(p.d) > tOf(a) ? p.d : a, all[0].d);
  const xl = [[X(first), dDM(first), 'start'], [X(last), dDM(last), 'end']];
  if (x1 - x0 >= 20) { const mid = isoAdd(first, Math.round((x1 - x0) / 2)); xl.splice(1, 0, [X(mid), dDM(mid), 'middle']); }
  const line = (ma || pts).map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
  const dots = weekly
    ? pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4" fill="var(--brand)"><title>Week of ${esc(dDM(p.d))}: ${esc(money(p.v))}</title></circle>`).join('')
    : pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.5" fill="var(--muted)" fill-opacity=".5"><title>${esc(dDM(p.d))}: ${esc(money(p.v))}</title></circle>`).join('');
  return chartFrame(label, `${dots}<path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`, ymax, xl);
}
function barChart(pts, label) {
  const W = 600, H = 240, L = 58, R = 16, T = 14, B = 32, n = pts.length;
  const ymax = niceMax(Math.max(...pts.map(p => p.v))), bw = (W - L - R) / n, Y = v => T + (1 - v / ymax) * (H - T - B);
  const bars = pts.map((p, i) => { const x = L + i * bw + bw * 0.15, w = bw * 0.7, y = Y(p.v); return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y).toFixed(1)}" rx="3" fill="var(--brand)"><title>Week of ${esc(dDM(p.d))}: ${esc(money(p.v))} a day</title></rect>${n <= 14 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${esc(money(p.v))}</text>` : ''}`; }).join('');
  const xl = [[L + bw / 2, dDM(pts[0].d), 'start'], [L + (n - 0.5) * bw, dDM(pts[n - 1].d), 'end']];
  return chartFrame(label, bars, ymax, n > 1 ? xl : [xl[0]]);
}
/* ---- price history: one point each time a food's price changes ---- */
const PH_COL = ['#2E9E7C', '#E5484D', '#4C8DF6', '#D9A21B', '#A66BD6', '#F08A24'];
function pricePerKg(name, date) {
  const pi = priceInfo(name, date);
  if (!pi) return null;
  if (pi.basis === 'kg') return pi.price;
  if (pi.basis === '100') return pi.price * 10;
  return pi.gpu > 0 ? pi.price / pi.gpu * 1000 : undefined;
}
function phSeries(name, from, last) {
  const pts = []; let prev = null;
  for (let d = from; d <= last; d = isoAdd(d, 1)) {
    const v = pricePerKg(name, d);
    if (v === undefined) return { pts: [], nopk: true };
    if (v == null) continue;
    if (prev == null || Math.abs(v - prev) > 1e-9) { pts.push({ d, v, was: prev, offer: !!priceInfo(name, d).offer }); prev = v; }
  }
  return { pts, nopk: false };
}
function priceHistoryCard(from, last) {
  const foods = [...IDX.meta.keys()].filter(n => !S.recipes[n]).sort((a, b) => a.localeCompare(b));
  let sel = store.get('phist', null);
  if (!Array.isArray(sel)) sel = foods.map(n => ({ n, c: phSeries(n, from, last).pts.length })).filter(x => x.c > 0).sort((a, b) => b.c - a.c || IDX.meta.get(b.n).n - IDX.meta.get(a.n).n).slice(0, 3).map(x => x.n);
  sel = sel.filter(n => IDX.meta.has(n) && !S.recipes[n]).slice(0, 6); S.ph = sel;
  const data = sel.map((n, i) => ({ n, col: PH_COL[i % PH_COL.length], ...phSeries(n, from, last) }));
  const plot = data.filter(x => x.pts.length);
  let chart = '';
  if (plot.length) {
    const W = 600, H = 240, L = 58, R = 16, T = 14, B = 32, x0 = tOf(from), x1 = tOf(last);
    const ymax = niceMax(Math.max(...plot.flatMap(x => x.pts.map(p => p.v))));
    const X = d => L + (x1 > x0 ? (tOf(d) - x0) / (x1 - x0) : 0.5) * (W - L - R), Y = v => T + (1 - v / ymax) * (H - T - B);
    const inner = plot.map(x => {
      const path = x.pts.map((p, i) => i ? `H${X(p.d).toFixed(1)}V${Y(p.v).toFixed(1)}` : `M${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('') + `H${X(last).toFixed(1)}`;
      const dots = x.pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4.5" fill="${x.col}" stroke="#fff" stroke-width="1.5"><title>${esc(x.n)}, ${esc(dMed(p.d))}: ${esc(money(p.v))} per kg${p.offer ? ' (offer)' : ''}</title></circle>`).join('');
      return `<path d="${path}" fill="none" stroke="${x.col}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    }).join('');
    const xl = [[L, dDM(from), 'start'], [W - R, dDM(last), 'end']];
    if (x1 - x0 >= 20) xl.splice(1, 0, [L + (W - L - R) / 2, dDM(isoAdd(from, Math.round((x1 - x0) / 2))), 'middle']);
    chart = chartFrame('Price per kg over time for ' + plot.map(x => x.n).join(', '), inner, ymax, xl);
  }
  const chips = data.map(x => `<span class="phchip"><i style="background:${x.col}" aria-hidden="true"></i>${esc(x.n)}<button type="button" class="btn link" data-act="ph-del" data-name="${esc(x.n)}" aria-label="Remove ${esc(x.n)} from the chart">Remove</button></span>`).join('');
  const notes = data.map(x => x.nopk ? `<p class="muted" style="font-size:13px;margin-top:6px">${esc(x.n)} is priced per item. Add its grams per item on the Prices tab to chart it per kg.</p>` : !x.pts.length ? `<p class="muted" style="font-size:13px;margin-top:6px">${esc(x.n)} has no price in this period.</p>` : '').join('');
  const list = plot.map(x => `<h3 style="font-size:16px;margin-top:12px">${esc(x.n)}</h3><ul style="margin:4px 0 0 18px;font-size:14px">${x.pts.map(p => `<li>${esc(dMed(p.d))}: ${esc(money(p.v))} per kg${p.was != null ? `, from ${esc(money(p.was))}` : ''}${p.offer ? ', offer' : ''}</li>`).join('')}</ul>`).join('');
  return `<div class="card tcard" id="phist" style="margin-top:24px"><h2>Price history</h2>
    <p class="muted" style="margin-top:4px;font-size:14px">Each dot is a day the price changed, for the period chosen above. Prices are shown per kg so foods share one chart. Add up to 6 foods.</p>
    <div class="phbar"><input class="field" id="phq" list="phlist" placeholder="Add a food" autocomplete="off" aria-label="Add a food to the chart"><button type="button" class="btn sm" data-act="ph-add">Add food</button></div>
    <datalist id="phlist">${foods.filter(n => !sel.includes(n)).map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div class="phchips">${chips || '<span class="muted" style="font-size:14px">No foods chosen yet.</span>'}</div>
    ${chart || (sel.length ? '' : '')}${notes}
    ${plot.length ? `<details style="margin-top:12px"><summary>List every change</summary>${list}</details>` : ''}</div>`;
}
function phAdd(raw) {
  const n = canon(String(raw || '').trim()); if (!n) return;
  if (!IDX.meta.has(n) || S.recipes[n]) { toast('Choose a food from the list.'); return; }
  if (S.ph.includes(n)) return;
  if (S.ph.length >= 6) { toast('Remove a food first. The chart shows up to 6.'); return; }
  S.ph = S.ph.concat(n); store.set('phist', S.ph); render();
}
function trendsCost() {
  const dates = IDX.dates, last = dates[dates.length - 1];
  const from = S.trange > 0 ? isoAdd(last, -(S.trange - 1)) : dates[0];
  const days = dates.filter(d => d >= from).map(dayStat).filter(s => s.n > 0 && s.cost > 0);
  const ph = '';
  const head = `<div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:16px;align-items:center">
    <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">Show <select class="field" id="tgrain"><option value="day"${S.grain === 'day' ? ' selected' : ''}>Each day</option><option value="week"${S.grain === 'week' ? ' selected' : ''}>Each week</option></select></label>
    <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:14px">Period <select class="field" id="trange">${[[30, 'Last 30 days'], [90, 'Last 90 days'], [180, 'Last 6 months'], [0, 'All days']].map(([v, t]) => `<option value="${v}"${S.trange === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
  </div>`;
  if (!days.length) return `${head}${ph}<div class="notice" style="margin-top:24px">${IC.info}<div>No priced days in this period yet. Add prices on the Prices tab and the charts appear here.</div></div>`;
  const wk = new Map();
  for (const s of days) { const w = wkStart(s.d); wk.set(w, addTo(wk.get(w) || zero(w), s)); }
  const weeks = [...wk.values()].filter(w => w.days >= 3 && covered(w)).sort((a, b) => a.d.localeCompare(b.d));
  const total = days.reduce((a, s) => addTo(a, s), zero(''));
  const weekly = S.grain === 'week';
  const cards = METRICS.map(m => {
    let pts, ma = null, note;
    if (weekly) {
      pts = weeks.map(w => ({ d: w.d, v: ratio(m, w) })).filter(p => p.v != null);
      note = 'Each point is one week with at least 3 logged days.';
    } else {
      pts = days.map(s => ({ d: s.d, v: ratio(m, s) })).filter(p => p.v != null);
      ma = days.map(s => { const w = zero(s.d); for (const x of days) if (tOf(x.d) <= tOf(s.d) && tOf(x.d) > tOf(s.d) - 7) addTo(w, x); return { d: s.d, v: ratio(m, w) }; }).filter(p => p.v != null);
      note = 'Dots are single days. The line is the average of the last 7 days.';
    }
    const avg = ratio(m, total, true);
    if (pts.length < 2 || avg == null) return `<div class="card tcard"><h2>${m.title}</h2><p class="muted" style="margin-top:12px">Not enough priced days yet.</p></div>`;
    const cur = (ma || pts)[(ma || pts).length - 1];
    const prev = weekly && pts.length > 1 ? pts[pts.length - 2].v : null;
    const delta = prev ? Math.round((cur.v - prev) / prev * 100) : null;
    const best = pts.reduce((a, p) => p.v < a.v ? p : a, pts[0]);
    return `<div class="card tcard"><h2>${m.title}</h2>
      <div style="display:flex;align-items:baseline;gap:12px;margin-top:8px"><span class="tbig">${money(cur.v)}</span><span class="muted" style="font-size:14px">${weekly ? 'latest week' : 'last 7 days'}${delta != null && delta !== 0 ? `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% on the week before` : ''}</span></div>
      <p class="muted" style="margin-top:4px;font-size:14px">Average ${money(avg)}. Lowest ${money(best.v)} ${weekly ? 'in the week of' : 'on'} ${esc(dMed(best.d))}.</p>
      ${lineChart(pts, ma, `${m.title}, ${weekly ? 'by week' : 'by day'}`, weekly)}
      <p class="muted" style="font-size:13px;margin-top:4px">${note}</p></div>`;
  }).join('');
  let weekCard = '';
  if (weeks.length >= 2) {
    const pts = weeks.map(w => ({ d: w.d, v: w.cost / w.days }));
    const cur = pts[pts.length - 1].v, avg = pts.reduce((a, p) => a + p.v, 0) / pts.length;
    weekCard = `<div class="card tcard"><h2>Average daily cost, by week</h2>
      <div style="display:flex;align-items:baseline;gap:12px;margin-top:8px"><span class="tbig">${money(cur)}</span><span class="muted" style="font-size:14px">latest week</span></div>
      <p class="muted" style="margin-top:4px;font-size:14px">Average across weeks ${money(avg)} a day.</p>
      ${barChart(pts, 'Average daily cost by week')}
      <p class="muted" style="font-size:13px;margin-top:4px">Weeks with at least 3 logged days. Days with no priced food are left out.</p></div>`;
  }
  const byCat = new Map();
  for (const d of dates.filter(x => x >= from)) for (const e of IDX.byDate.get(d)) { const c = costOf(e); if (c.cost != null) byCat.set(catOf(e.name), (byCat.get(catOf(e.name)) || 0) + c.cost); }
  const catRows = [...byCat].sort((a, b) => b[1] - a[1]), catTotal = catRows.reduce((a, r) => a + r[1], 0);
  const catCard = catRows.length ? `<div class="card tcard"><h2>Where the money goes, by category</h2>
    <div style="margin-top:12px">${catRows.slice(0, 12).map(([k, v]) => `<div class="catrow"><div class="catname">${esc(k)}</div><div class="catbar" role="img" aria-label="${esc(k)}: ${esc(money(v))}, ${Math.round(v / catTotal * 100)} percent"><i style="width:${(v / catRows[0][1] * 100).toFixed(1)}%"></i></div><div class="catval">${money(v)} <span class="muted">${Math.round(v / catTotal * 100)}%</span></div></div>`).join('')}</div>
    ${catRows.length === 1 && catRows[0][0] === 'Uncategorized' ? `<p class="muted" style="font-size:13px;margin-top:8px">Every food is uncategorized. Import your Cronometer export again to bring in its categories, or assign them on the Prices tab.</p>` : ''}${catRows.length > 12 ? `<p class="muted" style="font-size:13px;margin-top:8px">Plus ${catRows.length - 12} smaller categories.</p>` : ''}</div>` : '';
  const allKcal = dates.filter(x => x >= from).reduce((a, d) => a + IDX.byDate.get(d).reduce((b, e) => b + e.kcal, 0), 0);
  const pctAll = allKcal > 0 ? Math.round(total.kcal / allKcal * 100) : 0;
  const cov = pctAll < 95 ? `<div class="notice" style="margin-top:24px">${IC.info}<div><strong>Prices cover ${pctAll}% of the calories you logged in this period.</strong> Days and weeks with fewer than half their calories priced are left out of the charts. Price more foods on the Prices tab to fill them in.</div></div>` : '';
  return `${head}${cov}${ph}<div class="trendgrid" style="margin-top:24px">${cards}${weekCard}${catCard}</div>`;
}

const VM = { pro: ['Protein', 'p', 'g'], carb: ['Carbs', 'c', 'g'], fat: ['Fat', 'f', 'g'], kcal: ['Calories', 'k', 'kcal'] };
function valueRows(macro) {
  const k = VM[macro][1], date = IDX.dates[IDX.dates.length - 1] || mealToday(), out = [];
  for (const name of IDX.meta.keys()) {
    if (S.recipes[name]) continue;
    const pi = priceInfo(name, date); if (!pi || !(pi.price > 0)) continue;
    let per = null;
    if (pi.basis === 'unit') { const o = perUnit(name, 'item'); if (o) per = o[k] / pi.price; }
    else { const o = perUnit(name, 'g'); if (o) per = o[k] / (pi.basis === 'kg' ? pi.price / 1000 : pi.price / 100); }
    if (!(per > 0)) continue;
    out.push({ name, v: per, price: `${money(pi.price)} / ${pi.basis === 'kg' ? 'kg' : pi.basis === '100' ? '100 g' : 'item'}` });
  }
  return out.sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
}
function valueCard() {
  const m = S.vmacro in VM ? S.vmacro : 'pro', rows = valueRows(m), shown = S.vall ? rows : rows.slice(0, 10), sym = currencySymbol();
  const seg = `<div class="seg" role="group" aria-label="Nutrient">${Object.entries(VM).map(([k, v]) => `<button type="button" data-act="vmacro" data-v="${k}" aria-pressed="${k === m}">${v[0]}</button>`).join('')}</div>`;
  const unit = VM[m][2] === 'g' ? `g of ${VM[m][0].toLowerCase()}` : 'kcal';
  const body = rows.length ? `<table class="vtab"><thead><tr><th scope="col">Food</th><th scope="col" class="r">Price</th><th scope="col" class="r">${esc(unit === 'kcal' ? 'kcal' : 'g')} per ${esc(sym)}1</th></tr></thead><tbody>${shown.map((r, i) => `<tr><td><span class="rk">${i + 1}</span>${esc(r.name)}</td><td class="r muted">${esc(r.price)}</td><td class="r"><b>${r.v >= 100 ? Math.round(r.v) : r.v.toFixed(1)}</b></td></tr>`).join('')}</tbody></table>
    ${rows.length > 10 ? `<button class="btn link" data-act="vall">${S.vall ? 'Show the top 10' : `Show all ${rows.length}`}</button>` : ''}
    <p class="muted" style="font-size:13px;margin-top:8px">Higher is better value. Uses each food's current price and nutrition. Foods without a price or nutrition are left out.</p>`
    : `<div class="notice" style="margin-top:16px">${IC.info}<div>Nothing to rank yet. Add a food with its nutrition and price, or set prices on the Prices tab.</div></div><p style="margin-top:12px"><button class="btn primary" data-act="add-food">Add a food</button></p>`;
  return `<div class="card pad" style="margin-top:16px"><h2 style="font-size:17px">${esc(unit === 'kcal' ? 'Calories' : cap(unit))} per ${esc(sym)}1 spent</h2><div style="margin-top:12px">${seg}</div><div style="margin-top:12px">${body}</div></div>`;
}
function trendsView() {
  const dates = IDX.dates, last = dates[dates.length - 1];
  const view = !dates.length ? 'value' : (['value', 'cost', 'prices'].includes(S.tview) ? S.tview : 'cost');
  const seg = dates.length ? `<div class="seg" role="group" aria-label="Trends view" style="margin-top:16px">${[['cost', 'Cost over time'], ['value', 'Best value'], ['prices', 'Price history']].map(([k, t]) => `<button type="button" data-act="tview" data-v="${k}" aria-pressed="${k === view}">${t}</button>`).join('')}</div>` : '';
  const head = `<h1 class="h1" id="h1" tabindex="-1">Trends</h1>
  <p class="lede">${view === 'value' ? 'Rank your foods by how much protein, carbs, fat or calories each currency unit buys.' : view === 'prices' ? 'How the price of single foods changed, one point for every price change.' : 'How the price of your protein, carbs, fat, fiber and calories moves over time. Only foods with a price are counted.'}</p>${seg}`;
  if (view === 'value') return head + valueCard();
  if (view === 'prices') { const from = S.trange > 0 ? isoAdd(last, -(S.trange - 1)) : dates[0]; return head + `<div style="margin-top:16px">${priceHistoryCard(from, last)}</div>`; }
  return head + trendsCost();
}

/* ============ view: week ============ */
function proteinRank(es) {
  // Only foods where protein is a real share of the calories (about 30% or more), so oats and pasta do not top the list.
  const m = new Map();
  for (const e of es) {
    const c = costOf(e, false); if (c.cost == null) continue;
    const o = m.get(e.name) || { cost: 0, pro: 0, kcal: 0 }; o.cost += c.cost; o.pro += e.pro; o.kcal += e.kcal; m.set(e.name, o);
  }
  return [...m].filter(([, o]) => o.pro >= 5 && o.kcal > 0 && o.pro * 4 / o.kcal >= 0.3).map(([name, o]) => ({ name, v: o.cost / o.pro * 100 })).sort((a, b) => a.v - b.v).slice(0, 6);
}
function weekView() {
  const dates = IDX.dates, last = dates[dates.length - 1];
  if (!dates.length) return emptyDiary('Week');
  const first = S.range ? isoAdd(last, -(S.range - 1)) : dates[0];
  const inWin = dates.filter(d => d >= first);
  const sums = new Map(inWin.map(d => [d, summarize(IDX.byDate.get(d))]));
  const total = r2([...sums.values()].reduce((a, s) => a + s.cost, 0));
  const nd = inWin.length, avg = nd ? total / nd : 0;
  const pro = [...sums.values()].reduce((a, s) => a + s.pro, 0);
  const es = inWin.flatMap(d => IDX.byDate.get(d));
  const unp = [...sums.values()].reduce((a, s) => a + s.unpriced, 0);
  const budget = S.budget > 0 ? S.budget : null;

  let cstart = S.range ? (first < dates[0] ? dates[0] : first) : dates[Math.max(0, dates.length - 60)];
  if (!S.range && isoAdd(last, -89) > cstart) cstart = isoAdd(last, -89);
  const cdays = []; for (let d = cstart; d <= last; d = isoAdd(d, 1)) cdays.push(d);
  const vals = cdays.map(d => sums.has(d) ? sums.get(d).cost : (IDX.byDate.has(d) ? summarize(IDX.byDate.get(d)).cost : 0));
  const top = Math.max(...vals, budget || 0, 1) * 1.12, H = 210;
  const over = budget ? cdays.filter((d, i) => vals[i] > budget) : [];
  const nB = cdays.length, step = Math.ceil(nB / 15);
  const title = !inWin.length ? '' : inWin[0] === last ? dLong(last) : `${dMed(inWin[0])} to ${dMed(last)}`;

  const meals = new Map();
  for (const d of inWin) {
    const day = new Map();
    for (const e of IDX.byDate.get(d)) { const c = costOf(e); if (c.cost != null) day.set(e.group, (day.get(e.group) || 0) + c.cost); }
    for (const [g, v] of day) { const o = meals.get(g) || { sum: 0, n: 0 }; o.sum += v; o.n++; meals.set(g, o); }
  }
  const mealRows = [...meals].sort((a, b) => { const r = g => { const i = GROUP_ORDER.indexOf(g.toLowerCase()); return i < 0 ? 50 : i; }; return r(a[0]) - r(b[0]); });

  const bySpend = new Map();
  for (const e of es) { const c = costOf(e); if (c.cost != null) bySpend.set(e.name, (bySpend.get(e.name) || 0) + c.cost); }
  const topSpend = [...bySpend].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSpend = topSpend.length ? topSpend[0][1] : 1;
  const rank = proteinRank(es), maxRank = rank.length ? rank[rank.length - 1].v : 1;

  let sub = '';
  if (budget) sub = over.length === 0 ? `Every day came in under your ${money(budget)} budget.` : over.length === 1 ? `${dFmt(over[0], { weekday: 'long' })} ran ${money(r2(vals[cdays.indexOf(over[0])] - budget))} over your ${money(budget)} budget.` : `${over.length} days ran over your ${money(budget)} budget.`;
  else sub = 'Set a daily budget on the Day screen to mark the days that go over.';

  return `
  <div class="pagehead">
    <h1 class="h1" id="h1" tabindex="-1">${esc(title)}</h1>
    <label class="muted" style="display:flex;align-items:center;gap:10px;font-size:14px">Range <select class="field" id="range">${[[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [0, 'Everything imported']].map(([v, l]) => `<option value="${v}"${S.range === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  ${unp ? `<div class="notice" role="status">${IC.info}<div><strong>${unp} ${unp === 1 ? 'entry has' : 'entries have'} no price.</strong> Totals leave them out. <a href="#prices">Add prices</a></div></div>` : ''}
  <div class="card kpis">
    <div><div class="v">${money(total)}</div><div class="k">spent on food in ${nd} ${nd === 1 ? 'day' : 'days'}</div></div>
    <div><div class="v">${money(avg)}</div><div class="k">average day</div></div>
    <div><div class="v">${money0(avg * 30)}</div><div class="k">per 30 days at this pace</div></div>
    <div><div class="v">${pro > 0 && total > 0 ? money(total / (pro / 100)) : 'n/a'}</div><div class="k">per 100 g protein, on average</div></div>
  </div>
  <div class="cols" style="margin-top:28px">
    <section class="card main2" style="padding:24px 28px 20px">
      <h2 style="font-size:17px">Cost by day</h2>
      <p class="muted" style="margin-top:6px;font-size:14px">${esc(sub)}</p>
      <div class="chart">
        ${budget ? `<div class="hline" style="bottom:${budget / top * H}px;border-color:var(--ink)"></div>` : ''}
        ${nd ? `<div class="hline" style="bottom:${avg / top * H}px;border-color:var(--field)"></div>` : ''}
        <div class="cols2">${cdays.map((d, i) => `<div class="c">${nB <= 10 ? `<b>${money(vals[i])}</b>` : ''}<i title="${esc(dMed(d))}: ${money(vals[i])}" style="height:${vals[i] ? Math.max(2, vals[i] / top * H) : 0}px;background:${budget && vals[i] > budget ? 'var(--ink)' : 'var(--bar)'}"></i></div>`).join('')}</div>
      </div>
      <div class="xlabels">${cdays.map((d, i) => `<span>${nB <= 10 ? esc(dShort(d)) : (i % step === 0 ? esc(dFmt(d, { day: 'numeric' })) : '')}</span>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--bar)"></i>${budget ? 'Within budget' : 'Daily cost'}</span>${budget ? '<span><i style="background:var(--ink)"></i>Over budget</span>' : ''}${budget ? `<span><i style="width:22px;height:0;background:none;border-top:2px dashed var(--ink);border-radius:0"></i>Budget ${esc(money(budget))}</span>` : ''}<span><i style="width:22px;height:0;background:none;border-top:2px dashed #7C8A83;border-radius:0"></i>Average ${esc(money(avg))}</span></div>
    </section>
    <section class="card third" style="padding:24px 28px">
      <h2 style="font-size:17px">Average cost per meal</h2>
      <div style="margin-top:14px">${mealRows.map(([g, o]) => `<div class="row" style="padding:11px 0;font-size:17px"><span>${esc(g)}</span><span class="lead"></span><span>${money(o.sum / o.n)}</span></div>`).join('')}
        <div class="row" style="margin-top:8px;padding-top:14px;border-top:1px solid var(--ink);justify-content:space-between"><b>Average day</b><span class="big" style="font-size:28px">${money(avg)}</span></div></div>
    </section>
  </div>
  <div class="cols" style="margin-top:28px">
    <section class="card half" style="padding:24px 28px">
      <h2 style="font-size:17px">Where the money went</h2>
      <p class="muted" style="margin-top:6px;font-size:14px">Your biggest foods by spend.</p>
      <div style="margin-top:12px">${topSpend.map(([n, v]) => `<div class="brow"><div class="n"><div>${esc(n)}</div><div class="sub">${total ? Math.round(v / total * 100) : 0}% of spend</div></div><div class="b bar"><div style="width:${v / maxSpend * 100}%"></div></div><div class="a">${money(r2(v))}</div></div>`).join('') || '<p class="muted">Add prices to see this.</p>'}</div>
    </section>
    <section class="card half" style="padding:24px 28px">
      <h2 style="font-size:17px">Cheapest protein</h2>
      <p class="muted" style="margin-top:6px;font-size:14px">What 100 g of protein costs from each food, using your standard prices.</p>
      <div style="margin-top:12px">${rank.map((r, i) => `<div class="brow"><div class="n">${esc(r.name)}</div><div class="b bar"><div style="width:${r.v / maxRank * 100}%;background:${i === 0 ? 'var(--brand)' : 'var(--bar)'}"></div></div><div class="a">${money(r.v)}</div></div>`).join('') || '<p class="muted">Add prices to see this.</p>'}</div>
      <p class="muted" style="margin-top:10px;font-size:13px">Shorter is cheaper. Foods without a price are left out.</p>
    </section>
  </div>
  <div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:10px">
    <button class="btn primary" data-act="share-image">Make share image</button>
    <button class="btn" data-act="copy-week">Copy week as text</button>
    <button class="btn" data-act="export-csv">Download CSV</button>
  </div>`;
}

/* ============ render + routing ============ */
function render() {
  const sc0 = $('#scroller'), keep = sc0 ? sc0.scrollTop : 0;
  document.body.classList.remove('drawer-open');
  $('#app').innerHTML = hasData() ? appView() : importView();
  { const sc = $('#scroller'); if (sc && keep) sc.scrollTop = keep; }
  document.title = (hasData() ? cap(S.tab) + ' | ' : '') + 'Meal cost calculator | Coach Leonidas';
}
function route() {
  const h = location.hash.replace('#', '');
  const t = ['day', 'prices', 'week', 'trends', 'meals'].includes(h) ? h : 'day';
  const changed = t !== S.tab;
  S.tab = t;
  S.error = '';
  render();
  if (changed) { window.scrollTo(0, 0); const sc = $('#scroller'); if (sc) sc.scrollTop = 0; const h1 = $('#h1'); if (h1) h1.focus({ preventScroll: true }); }
}
function go(tab) { if (location.hash === '#' + tab) { S.tab = tab; render(); } else location.hash = tab; }
let _toast;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toast); _toast = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ============ persistence ============ */
let _save;
function saveSoon() { clearTimeout(_save); _save = setTimeout(saveAll, 250); }
function saveAll() { store.set('prices', S.prices); store.set('overrides', S.overrides); store.set('budget', S.budget); store.set('currency', S.currency); store.set('merges', S.merges); store.set('nomerge', S.nomerge); store.set('sort', S.sort); store.set('flip', S.flip); store.set('ranges', S.ranges); store.set('cats', S.cats); store.set('recipes', S.recipes); store.set('meals', S.meals); store.set('foods', S.foods); store.set('started', S.started); store.set('tview', S.tview); store.set('vmacro', S.vmacro); store.set('grain', S.grain); store.set('trange', S.trange); }
function saveEntries() { store.set('entries', S.entries.map(({ src, ...r }) => ({ ...r, name: src !== undefined ? src : r.name }))); }

/* ============ import ============ */
function mergeEntries(list) {
  const dates = new Set(list.map(e => e.date));
  S.entries = S.entries.filter(e => !dates.has(e.date)).concat(list).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  reindex(); ensurePrices();
  saveEntries(); saveAll();
  S.day = IDX.dates[IDX.dates.length - 1];
}
function importText(text) {
  try {
    const list = parseCronometer(text);
    const firstTime = !Object.values(S.prices).some(p => p.price !== '' && p.price != null);
    mergeEntries(list);
    S.error = '';
    toast(`${list.length} entries from ${new Set(list.map(e => e.date)).size} days imported`);
    const nextTab = firstTime ? 'prices' : 'day';
    if (location.hash === '#' + nextTab) route(); else location.hash = nextTab;
  } catch (err) {
    S.error = err.message || 'Could not read this file.';
    render();
  }
}
async function handleFile(file) {
  if (!file) return;
  if (file.size > 30e6) { S.error = 'This file is larger than 30 MB. Export a shorter date range from Cronometer.'; render(); return; }
  try { importText(await file.text()); } catch (e) { S.error = 'Could not read this file.'; render(); }
}

/* sample data */
function loadSample() {
  const F = {
    oats: ['Oats, rolled', '80 g', 311, 10.5, 53, 5.5, 2.2, 'kg'], milk: ['Milk, whole', '250 ml', 160, 8.5, 12, 8.5, 1.2, 'kg'],
    banana: ['Banana', '1 medium', 105, 1.3, 27, 0.4, 0.25, 'unit'], eggs: ['Eggs, whole, large', '3 large', 216, 18.9, 1.1, 14.3, 0.35, 'unit'],
    skyr: ['Skyr, plain', '200 g', 126, 22, 8, 0.4, 7, 'kg'], blue: ['Blueberries', '100 g', 57, 0.7, 14, 0.3, 2.4, '100'],
    whey: ['Whey protein powder', '30 g', 120, 24, 3, 1.5, 30, 'kg'], chicken: ['Chicken breast, cooked', '200 g', 330, 62, 0, 7, 11, 'kg'],
    rice: ['Basmati rice, cooked', '250 g', 325, 6.5, 70, 0.8, 1.2, 'kg'], broc: ['Broccoli', '150 g', 51, 4.2, 10, 0.6, 3.2, 'kg'],
    oil: ['Olive oil', '1 tbsp', 119, 0, 0, 13.5, 0.12, 'unit'], salmon: ['Salmon, cooked', '180 g', 374, 40, 0, 22, 24, 'kg'],
    sweet: ['Sweet potato, baked', '250 g', 225, 4, 52, 0.3, 2.5, 'kg'], greens: ['Mixed salad greens', '80 g', 14, 1.2, 2.6, 0.2, 9, 'kg'],
    beef: ['Beef mince, 5% fat', '200 g', 244, 40, 0, 9, 10, 'kg'], pasta: ['Pasta, cooked', '300 g', 470, 17, 92, 2.7, 1, 'kg'],
    passata: ['Tomato passata', '150 g', 42, 2, 8, 0.3, 1.8, 'kg'], avo: ['Avocado', '0.5 medium', 120, 1.5, 6.4, 11, 1.2, 'unit'],
    cottage: ['Cottage cheese', '200 g', 196, 22, 6, 9, 6, 'kg'], almonds: ['Almonds', '30 g', 174, 6.4, 6.5, 15, 14, 'kg'],
    apple: ['Apple', '1 medium', 95, 0.5, 25, 0.3, 0.4, 'unit'], choc: ['Dark chocolate, 85%', '20 g', 120, 2, 6, 10, 25, 'kg']
  };
  const plan = [
    { Breakfast: ['oats', 'milk', 'banana', 'whey'], Lunch: ['chicken', 'rice', 'broc', 'oil'], Dinner: ['salmon', 'sweet', 'greens', 'oil'], Snacks: ['almonds', 'apple'] },
    { Breakfast: ['eggs', 'skyr', 'blue'], Lunch: ['beef', 'pasta', 'passata', 'greens'], Dinner: ['chicken', 'rice', 'broc', 'avo'], Snacks: ['choc', 'skyr'] },
    { Breakfast: ['oats', 'milk', 'blue', 'whey'], Lunch: ['salmon', 'rice', 'greens', 'oil'], Dinner: ['beef', 'sweet', 'broc'], Snacks: ['cottage', 'apple'] }
  ];
  const times = { Breakfast: '08:00', Lunch: '13:00', Dinner: '19:30', Snacks: '16:00' };
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const today = isoOf(new Date());
  const lines = ['Day,Time,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g)'];
  for (let i = 0; i < 7; i++) {
    const d = isoAdd(today, i - 6), p = plan[i % 3];
    for (const g of Object.keys(p)) for (const k of p[g]) { const f = F[k]; lines.push([d, times[g], g, q(f[0]), q(f[1]), f[2], f[3], f[4], f[5]].join(',')); }
  }
  const prices = {};
  for (const k in F) prices[F[k][0]] = { price: F[k][6], basis: F[k][7], gpu: '' };
  Object.assign(S.prices, prices);
  S.overrides[today] = { 'Salmon, cooked': 16 };
  importText(lines.join('\n'));
}

/* ============ offers + budget dialog ============ */
function openOffer(date, name, id) {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const dates = IDX.dates.slice().reverse();
  const foods = [...IDX.meta.keys()].filter(n => !S.recipes[n]).sort((a, b) => a.localeCompare(b));
  const rg = id ? S.ranges.find(r => r.id === id) : null;
  const d0 = rg ? rg.from : (date || S.day || dates[0]);
  name = rg ? rg.name : (name && foods.includes(name) ? name : foods[0]);
  const mode0 = rg ? (rg.to ? 'range' : 'from') : 'day';
  dlg.innerHTML = `<form id="oform" method="dialog">
    <h2 id="dlg-title" style="font-size:20px">${rg ? 'Change this price' : 'Price for a day or a period'}</h2>
    <p class="muted" style="font-size:14px">Your standard price applies to every date. Use this when a price was different on one day, for one shop trip, or from a date onward.</p>
    <div><label for="of">Food</label><select class="field" id="of">${foods.map(n => `<option${n === name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div><label for="om">Applies to</label><select class="field" id="om"><option value="day"${mode0 === 'day' ? ' selected' : ''}>One day</option><option value="range"${mode0 === 'range' ? ' selected' : ''}>A date range</option><option value="from"${mode0 === 'from' ? ' selected' : ''}>From a date onward</option></select></div>
    <div style="display:flex;gap:12px"><div style="flex:1"><label for="od" id="odlabel">Day</label><input class="field" style="width:100%" type="date" id="od" value="${esc(d0)}"></div><div style="flex:1" id="otwrap"><label for="ot">Last day</label><input class="field" style="width:100%" type="date" id="ot" value="${esc(rg && rg.to ? rg.to : d0)}"></div></div>
    <div><label for="op" id="oplabel">Price</label><div class="money-in wide"><span>${esc(currencySymbol())}</span><input id="op" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${rg ? esc(rg.price) : ''}"></div><div class="sub" id="oinfo" style="margin-top:6px"></div></div>
    <div id="oerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">Save price</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
    <button type="button" class="btn link" id="odel" data-act="dlg-del"${rg ? ` data-id="${esc(rg.id)}"` : ' hidden'}>Remove this price</button>
  </form>`;
  const refresh = (fill) => {
    const d = $('#od').value, n = $('#of').value, m = $('#om').value, p = S.prices[n];
    $('#odlabel').textContent = m === 'day' ? 'Day' : 'First day';
    $('#otwrap').hidden = m !== 'range';
    $('#oplabel').textContent = `Price, per ${basisText(p ? p.basis : 'kg', n)}`;
    if (!rg && fill) {
      const cur = m === 'day' && S.overrides[d] ? S.overrides[d][n] : null;
      $('#op').value = cur != null ? cur : '';
      $('#odel').hidden = cur == null;
    }
    $('#oinfo').textContent = p && p.price !== '' ? `Your standard price is ${money(Number(p.price))} per ${basisText(p.basis, n)}.` : 'You have not set a standard price for this food yet.';
  };
  ['od', 'of', 'om'].forEach(k => $('#' + k).addEventListener('change', () => refresh(true)));
  $('#oform').addEventListener('submit', ev => {
    ev.preventDefault();
    const n = $('#of').value, m = $('#om').value, f = $('#od').value, t = $('#ot').value, v = $('#op').value.trim().replace(',', '.');
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(f)) { $('#oerr').textContent = 'Choose the first day.'; $('#od').focus(); return; }
    if (m === 'range' && (!iso.test(t) || t < f)) { $('#oerr').textContent = 'Choose a last day that is the same as or after the first day.'; $('#ot').focus(); return; }
    if (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) { $('#oerr').textContent = 'Enter a price, for example 4.50.'; $('#op').focus(); return; }
    if (rg) S.ranges = S.ranges.filter(r => r.id !== rg.id);
    if (m === 'day') (S.overrides[f] = S.overrides[f] || {})[n] = Number(v);
    else S.ranges.push({ id: Math.random().toString(36).slice(2, 9), name: n, from: f, to: m === 'range' ? t : '', price: Number(v) });
    indexRanges(); saveAll(); dlg.close();
    if (IDX.byDate.has(f)) S.day = f;
    render(); toast('Price saved');
  });
  refresh(!rg);
  if (!dlg.open) dlg.showModal();
  $('#op').focus();
}
/* ---- recipe editor ---- */
let REC = null;
function openRecipe(name) {
  const cur = S.recipes[name];
  REC = { name, servings: cur ? cur.servings : 1, yieldG: cur ? cur.yieldG : '', items: cur ? cur.items.map(x => ({ ...x })) : [{ name: '', qty: '', unit: 'g' }], isNew: !cur };
  drawRecipe();
  const dlg = $('#dlg'); if (!dlg.open) dlg.showModal();
  const f = $('#rform input[data-r="name"]'); if (f) f.focus();
}
function drawRecipe() {
  const dlg = $('#dlg'); dlg.classList.add('wide');
  const foods = [...IDX.meta.keys()].filter(n => n !== REC.name && !S.recipes[n]).sort((a, b) => a.localeCompare(b));
  dlg.innerHTML = `<form id="rform" method="dialog">
    <h2 id="dlg-title" style="font-size:20px">Recipe: ${esc(REC.name)}</h2>
    <p class="muted" style="font-size:14px">Cronometer exports a recipe as a single line, so list its ingredients here. Each logged serving is costed from your ingredient prices.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:1 1 160px"><label for="rs">Servings it makes</label><input class="field" style="width:100%" id="rs" inputmode="decimal" value="${esc(REC.servings)}"></div><div style="flex:1 1 220px"><label for="ry">Total weight in grams (needed if you log it in grams)</label><input class="field" style="width:100%" id="ry" inputmode="decimal" placeholder="optional" value="${esc(REC.yieldG)}"></div></div>
    <div id="rrows">${REC.items.map((it, i) => `<div class="rrow"><input class="field" data-r="name" list="rlist" aria-label="Ingredient ${i + 1}" placeholder="Ingredient" autocomplete="off" value="${esc(it.name)}"><input class="field" data-r="qty" inputmode="decimal" aria-label="Amount" placeholder="Amount" value="${esc(it.qty)}"><select class="field" data-r="unit" aria-label="Unit">${['g', 'ml', 'item'].map(u => `<option value="${u}"${it.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select><button type="button" class="btn link" data-act="rec-del" data-i="${i}" aria-label="Remove ingredient ${i + 1}">Remove</button></div>`).join('')}</div>
    <datalist id="rlist">${foods.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div><button type="button" class="btn sm" data-act="rec-add">Add ingredient</button></div>
    <div class="sub" id="rprev" aria-live="polite"></div>
    <div id="rerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">Save recipe</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
    ${REC.isNew ? '' : '<button type="button" class="btn link" data-act="rec-delete">Remove this recipe</button>'}
  </form>`;
  $('#rform').addEventListener('submit', ev => { ev.preventDefault(); saveRecipe(); });
  previewRecipe();
}
function syncRecipe() {
  if (!$('#rform')) return;
  REC.servings = $('#rs').value; REC.yieldG = $('#ry').value;
  REC.items = [...document.querySelectorAll('#rrows .rrow')].map(r => ({ name: $('[data-r=name]', r).value, qty: $('[data-r=qty]', r).value, unit: $('[data-r=unit]', r).value }));
}
function recipeFromDraft() {
  const items = REC.items.map(i => ({ name: canon(i.name.trim()), qty: num(i.qty), unit: i.unit })).filter(i => i.name && i.qty > 0);
  return { servings: num(REC.servings) > 0 ? num(REC.servings) : 1, yieldG: num(REC.yieldG) > 0 ? num(REC.yieldG) : '', items };
}
function previewRecipe() {
  const el = $('#rprev'); if (!el) return;
  syncRecipe();
  const r = recipeFromDraft();
  if (!r.items.length) { el.textContent = ''; return; }
  const rc = recipeCostOf(r, IDX.dates[IDX.dates.length - 1]);
  el.textContent = rc.cost != null
    ? `The whole recipe costs ${money(rc.cost)} at your latest prices, ${money(rc.cost / r.servings)} per serving.`
    : `${rc.missing} ${rc.missing === 1 ? 'ingredient needs' : 'ingredients need'} a price. After saving, add ${rc.missing === 1 ? 'it' : 'them'} on the Prices tab.`;
}
function saveRecipe() {
  syncRecipe();
  const r = recipeFromDraft(), err = m => { $('#rerr').textContent = m; };
  if (!r.items.length) return err('Add at least one ingredient with a name and an amount.');
  if (r.items.some(i => i.name === REC.name)) return err('A recipe cannot contain itself.');
  if (r.items.some(i => S.recipes[i.name])) return err('An ingredient cannot be another recipe.');
  S.recipes[REC.name] = r;
  reindex(); ensurePrices(); saveAll(); $('#dlg').close(); render(); toast('Recipe saved');
}
/* ============ meal builder ============ */
const MB = { draft: null, cmp: [], date: '' };
const newDraft = () => ({ name: '', servings: '1', orig: '', items: [{ name: '', qty: '', unit: 'g' }] });
const mealDate = () => MB.date || IDX.dates[IDX.dates.length - 1] || mealToday();
const mealToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let _nc = { idx: null, m: new Map() };
// Nutrition per 1 g (or ml) or per 1 item, taken from how the food was logged in your export.
function perUnit(name, unit, noCross) {
  const u = unit === 'item' ? 'item' : 'g';
  if (_nc.idx !== IDX) _nc = { idx: IDX, m: new Map() };
  const key = `${name}|${u}|${noCross ? 1 : 0}`;
  if (_nc.m.has(key)) return _nc.m.get(key);
  let out = null, q = 0, k = 0, p = 0, c = 0, f = 0, b = 0;
  for (const e of IDX.byName.get(name) || []) {
    if ((u === 'item') !== (e.type === 'count')) continue;
    q += e.qty; k += e.kcal; p += e.pro; c += e.carb; f += e.fat; b += e.fiber || 0;
  }
  if (q > 0) out = { k: k / q, p: p / q, c: c / q, f: f / q, b: b / q };
  const cf = S.foods[name];
  if (!out && cf && (cf.per === 'item') === (u === 'item')) { const d = u === 'item' ? 1 : 100; out = { k: cf.kcal / d, p: cf.pro / d, c: cf.carb / d, f: cf.fat / d, b: 0 }; }
  if (!out && !noCross) {
    const gpu = Number((S.prices[name] || {}).gpu) || 0, r = S.recipes[name];
    if (gpu > 0) {
      const o = perUnit(name, u === 'item' ? 'g' : 'item', true), s = u === 'item' ? gpu : 1 / gpu;
      if (o) out = { k: o.k * s, p: o.p * s, c: o.c * s, f: o.f * s, b: o.b * s };
    }
    if (!out && r && r.items.length) {
      const t = { k: 0, p: 0, c: 0, f: 0, b: 0 }; let ok = true;
      for (const it of r.items) {
        const o = perUnit(canon(it.name), it.unit === 'item' ? 'item' : 'g'), q2 = Number(it.qty) || 0;
        if (!o) { ok = false; break; }
        t.k += o.k * q2; t.p += o.p * q2; t.c += o.c * q2; t.f += o.f * q2; t.b += o.b * q2;
      }
      const den = u === 'item' ? (Number(r.servings) > 0 ? Number(r.servings) : 1) : Number(r.yieldG);
      if (ok && den > 0) out = { k: t.k / den, p: t.p / den, c: t.c / den, f: t.f / den, b: t.b / den };
    }
  }
  _nc.m.set(key, out);
  return out;
}
function mealStats(m, date) {
  const t = { cost: 0, k: 0, p: 0, c: 0, f: 0, b: 0, noPrice: 0, noNut: 0, parts: [], sv: Number(m.servings) > 0 ? Number(m.servings) : 1 };
  for (const it of m.items) {
    const name = canon(it.name), q = Number(it.qty) || 0;
    const c = costOf(ingEntry({ ...it, name }, date)), o = perUnit(name, it.unit === 'item' ? 'item' : 'g');
    if (c.cost == null) t.noPrice++; else t.cost += c.cost;
    const n = o ? { k: o.k * q, p: o.p * q, c: o.c * q, f: o.f * q, b: o.b * q } : null;
    if (!n) t.noNut++; else { t.k += n.k; t.p += n.p; t.c += n.c; t.f += n.f; t.b += n.b; }
    t.parts.push({ it, name, cost: c.cost, why: c.why, n });
  }
  t.cost = r2(t.cost);
  return t;
}
function mealSync() {
  const f = $('#mform'); if (!f || !MB.draft) return;
  MB.draft.name = $('#mn').value; MB.draft.servings = $('#ms').value;
  MB.draft.items = [...f.querySelectorAll('.mrow')].map(r => ({ name: $('[data-m=name]', r).value, qty: $('[data-m=qty]', r).value, unit: $('[data-m=unit]', r).value }));
}
function mealFromDraft() {
  const d = MB.draft;
  return { servings: num(d.servings) > 0 ? num(d.servings) : 1, items: d.items.map(i => ({ name: canon(i.name.trim()), qty: num(i.qty), unit: i.unit })).filter(i => i.name && i.qty > 0 && IDX.meta.has(i.name)) };
}
const WHY = { noprice: 'No price yet.', needgpu: 'Needs grams per item on the Prices tab.', recipe: 'A recipe ingredient has no price.', needyield: 'The recipe needs a total weight.' };
function rowInfo(it, date) {
  const name = canon(String(it.name || '').trim()), q = num(it.qty);
  if (!name && !q) return '';
  if (!name) return 'Choose a food or recipe.';
  if (!IDX.meta.has(name)) return 'Not in your log. Choose one from the list.';
  if (!(q > 0)) return 'Enter an amount.';
  const c = costOf(ingEntry({ ...it, name, qty: q }, date)), o = perUnit(name, it.unit === 'item' ? 'item' : 'g');
  const bits = [];
  if (c.cost != null) bits.push(money(c.cost));
  else bits.push(`${esc(WHY[c.why] || 'No price yet.')}${c.why === 'noprice' || c.why === 'needgpu' || c.why === 'recipe' ? ` <button type="button" class="btn link" data-act="goto-price" data-name="${esc(name)}">Set price</button>` : ''}`);
  if (o) bits.push(`${n0(o.k * q)} kcal`, `${nf1.format(o.p * q)} g protein`); else bits.push('nutrition unknown');
  return bits.join(', ');
}
function mealRowHtml(it, i, date) {
  return `<div class="mitem"><div class="mrow"><input class="field" data-m="name" list="mlist" aria-label="Ingredient ${i + 1}" placeholder="Food or recipe" autocomplete="off" value="${esc(it.name)}"><input class="field" data-m="qty" inputmode="decimal" aria-label="Amount of ingredient ${i + 1}" placeholder="Amount" value="${esc(it.qty)}"><select class="field" data-m="unit" aria-label="Unit of ingredient ${i + 1}">${['g', 'ml', 'item'].map(u => `<option value="${u}"${it.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select><button type="button" class="btn link" data-act="meal-del-row" data-i="${i}" aria-label="Remove ingredient ${i + 1}">Remove</button></div><div class="sub mi">${rowInfo(it, date)}</div></div>`;
}
function mealTotalsHtml(m, date) {
  if (!m.items.length) return '<p class="muted">Add an ingredient with an amount to see what the meal costs.</p>';
  const t = mealStats(m, date), sv = t.sv, budget = S.budget > 0 ? S.budget : null;
  const rows = [['Cost', money(t.cost), money(t.cost / sv)], ['Calories', `${n0(t.k)} kcal`, `${n0(t.k / sv)} kcal`], ['Protein', `${nf1.format(t.p)} g`, `${nf1.format(t.p / sv)} g`], ['Carbs', `${nf1.format(t.c)} g`, `${nf1.format(t.c / sv)} g`], ['Fat', `${nf1.format(t.f)} g`, `${nf1.format(t.f / sv)} g`], ['Fiber', `${nf1.format(t.b)} g`, `${nf1.format(t.b / sv)} g`]];
  const extra = [];
  if (t.p > 0 && t.cost > 0) extra.push(`${money(t.cost / (t.p / 100))} per 100 g protein`);
  if (t.k > 0 && t.cost > 0) extra.push(`${money(t.cost / (t.k / 1000))} per 1,000 kcal`);
  if (budget && t.cost > 0) extra.push(`${n0(t.cost / sv / budget * 100)}% of your daily budget per serving`);
  return `${t.noPrice ? '' : `<div class="pricetag sm"><span class="n">${esc(money(t.cost / sv))}</span><span class="l">${sv === 1 ? 'for the meal' : 'per serving'}</span></div>`}
    ${t.noPrice ? `<p class="sub" style="color:var(--offer-ink)">${t.noPrice} ${t.noPrice === 1 ? 'ingredient has' : 'ingredients have'} no price, so the cost below is not complete.</p>` : ''}
    ${t.noNut ? `<p class="sub">${t.noNut} ${t.noNut === 1 ? 'ingredient has' : 'ingredients have'} no nutrition data, so the totals are not complete.</p>` : ''}
    <table class="mtab"><thead><tr><th scope="col"><span class="vh">Nutrient</span></th><th scope="col">Whole meal</th><th scope="col">Per serving</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>
    ${extra.length ? `<p class="sub" style="margin-top:10px">${extra.map(esc).join('<br>')}</p>` : ''}
    <p class="sub" style="margin-top:10px">Prices as of ${esc(dMed(date))}.</p>`;
}
function mealListHtml(date) {
  const names = Object.keys(S.meals).sort((a, b) => a.localeCompare(b));
  if (!names.length) return '<p class="muted">No saved meals yet. Build one above and choose Save meal.</p>';
  return names.map(n => {
    const m = S.meals[n], t = mealStats(m, date), sv = t.sv;
    return `<div class="card pad mcard" data-name="${esc(n)}">
      <div class="mhead"><h3>${esc(n)}</h3><div class="mcost">${t.noPrice ? '<span>Needs prices</span>' : `${esc(money(t.cost / sv))} <span>per serving</span>`}</div></div>
      <div class="sub">${n0(t.k / sv)} kcal, ${nf1.format(t.p / sv)} g protein, ${nf1.format(t.c / sv)} g carbs, ${nf1.format(t.f / sv)} g fat, ${nf1.format(t.b / sv)} g fiber per serving. ${m.items.length} ${m.items.length === 1 ? 'ingredient' : 'ingredients'}, ${nf1.format(sv)} ${sv === 1 ? 'serving' : 'servings'}.</div>
      ${t.noPrice ? `<div class="sub" style="color:var(--offer-ink)">${t.noPrice} ${t.noPrice === 1 ? 'ingredient needs' : 'ingredients need'} a price.</div>` : ''}
      <div class="macts"><button type="button" class="btn sm" data-act="meal-edit" data-name="${esc(n)}">Edit</button><button type="button" class="btn sm" data-act="meal-dup" data-name="${esc(n)}">Duplicate</button><button type="button" class="btn sm" data-act="meal-diary" data-name="${esc(n)}">Add to diary</button><button type="button" class="btn sm" data-act="meal-delete" data-name="${esc(n)}">Delete</button><label class="cmp"><input type="checkbox" data-cmp="${esc(n)}"${MB.cmp.includes(n) ? ' checked' : ''}> Compare</label></div>
    </div>`;
  }).join('');
}
function mealCompareHtml(date) {
  MB.cmp = MB.cmp.filter(n => S.meals[n]);
  if (MB.cmp.length < 2) return MB.cmp.length === 1 ? '<p class="sub" style="margin-top:12px">Tick Compare on one more meal to see them side by side.</p>' : '';
  const [a, b] = MB.cmp, A = mealStats(S.meals[a], date), B = mealStats(S.meals[b], date);
  const ps = (t, k) => t[k] / t.sv;
  const rows = [
    ['Cost per serving', t => t.cost / t.sv, v => money(v), 'low', t => t.noPrice],
    ['Calories', t => ps(t, 'k'), v => `${n0(v)} kcal`],
    ['Protein', t => ps(t, 'p'), v => `${nf1.format(v)} g`],
    ['Carbs', t => ps(t, 'c'), v => `${nf1.format(v)} g`],
    ['Fat', t => ps(t, 'f'), v => `${nf1.format(v)} g`],
    ['Fiber', t => ps(t, 'b'), v => `${nf1.format(v)} g`],
    ['Cost per 100 g protein', t => t.p > 0 ? t.cost / (t.p / 100) : null, v => money(v), 'low', t => t.noPrice],
    ['Cost per 1,000 kcal', t => t.k > 0 ? t.cost / (t.k / 1000) : null, v => money(v), 'low', t => t.noPrice]
  ];
  const cell = (t, o, other, f, flag, bad) => { const v = f(t); if (v == null || (bad && bad(t))) return '<td class="muted">Not available</td>'; const w = flag === 'low' && f(other) != null && !(bad && bad(other)) && v < f(other) - 1e-9; return `<td${w ? ' class="win"' : ''}>${esc(o(v))}${w ? ' <span class="lowtag">lower</span>' : ''}</td>`; };
  const diff = !A.noPrice && !B.noPrice ? (A.cost / A.sv === B.cost / B.sv ? 'Both meals cost the same per serving.' : `${A.cost / A.sv < B.cost / B.sv ? a : b} costs ${money(Math.abs(A.cost / A.sv - B.cost / B.sv))} less per serving.`) : 'One of these meals has ingredients without a price, so its cost is not complete.';
  return `<div class="card pad" style="margin-top:16px"><h3 style="font:700 20px var(--display)">Compare</h3><p class="sub" style="margin-top:4px">${esc(diff)}</p>
    <table class="mtab cmpt"><thead><tr><th scope="col"><span class="vh">Measure</span></th><th scope="col">${esc(a)}</th><th scope="col">${esc(b)}</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th>${cell(A, r[2], B, r[1], r[3], r[4])}${cell(B, r[2], A, r[1], r[3], r[4])}</tr>`).join('')}</tbody></table></div>`;
}
function mealsView() {
  if (!MB.draft) MB.draft = newDraft();
  const d = MB.draft, date = mealDate();
  const foods = [...IDX.meta.keys()].sort((a, b) => a.localeCompare(b));
  return `
  <h1 class="h1" id="h1" tabindex="-1">Meal builder</h1>
  <p class="lede">Pick foods and recipes, set amounts, and see what a meal costs and what is in it. The cost is always worked out from your current prices.</p>
  <datalist id="mlist">${foods.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  <div class="cols" style="margin-top:24px">
    <form id="mform" class="card pad main2" style="flex:2 1 560px" novalidate>
      <h2 style="font-size:17px">${d.orig ? `Editing ${esc(d.orig)}` : 'New meal'}</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
        <div style="flex:2 1 200px"><label for="mn">Meal name</label><input class="field" style="width:100%" id="mn" autocomplete="off" placeholder="For example, Chicken rice bowl" value="${esc(d.name)}"></div>
        <div style="flex:1 1 110px"><label for="ms">Servings</label><input class="field" style="width:100%" id="ms" inputmode="decimal" value="${esc(d.servings)}"></div>
        <div style="flex:1 1 150px"><label for="mdate">Prices as of</label><input class="field" style="width:100%" type="date" id="mdate" value="${esc(date)}"></div>
      </div>
      <div id="mrows" style="margin-top:16px">${d.items.map((it, i) => mealRowHtml(it, i, date)).join('')}</div>
      <div><button type="button" class="btn sm" data-act="meal-add">Add ingredient</button></div>
      <div id="merr" class="sub" style="color:var(--offer-ink);margin-top:10px" role="alert"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button type="submit" class="btn primary" style="flex:1 1 160px">Save meal</button><button type="button" class="btn" data-act="meal-new">${d.orig ? 'New meal' : 'Clear'}</button></div>
    </form>
    <div class="side"><div class="card pad" id="mtot" aria-live="polite">${mealTotalsHtml(mealFromDraft(), date)}</div></div>
  </div>
  <h2 style="font-size:18px;margin-top:32px">Saved meals</h2>
  <div id="mcmp">${mealCompareHtml(date)}</div>
  <div id="mlist2" class="mlist">${mealListHtml(date)}</div>`;
}
function mealRefresh(all) {
  if (!MB.draft || !$('#mform')) return;
  const date = mealDate(), m = mealFromDraft();
  $('#mtot').innerHTML = mealTotalsHtml(m, date);
  const infos = document.querySelectorAll('#mform .mi');
  MB.draft.items.forEach((it, i) => { if (infos[i]) infos[i].innerHTML = rowInfo(it, date); });
  if (all) { $('#mcmp').innerHTML = mealCompareHtml(date); $('#mlist2').innerHTML = mealListHtml(date); }
}
function saveMeal() {
  mealSync();
  const d = MB.draft, name = d.name.trim().replace(/\s+/g, ' '), err = m => { $('#merr').textContent = m; };
  if (!name) return err('Give the meal a name.');
  const named = d.items.filter(i => i.name.trim() || String(i.qty).trim());
  const bad = named.find(i => !IDX.meta.has(canon(i.name.trim())));
  if (bad) return err(`${bad.name.trim() ? `"${bad.name.trim()}" is not a food in your log` : 'An ingredient has no food'}. Choose one from the list.`);
  const noQty = named.find(i => !(num(i.qty) > 0));
  if (noQty) return err(`Enter an amount for ${noQty.name.trim()}.`);
  const m = mealFromDraft();
  if (!m.items.length) return err('Add at least one ingredient with an amount.');
  if (S.meals[name] && name !== d.orig) return err('A meal with this name already exists. Choose another name, or edit that meal.');
  if (d.orig && d.orig !== name) { delete S.meals[d.orig]; MB.cmp = MB.cmp.map(n => n === d.orig ? name : n); }
  S.meals[name] = m; d.orig = name; d.name = name;
  saveAll(); render(); toast('Meal saved');
}
function loadMeal(name, copy) {
  const m = S.meals[name]; if (!m) return;
  let nm = name;
  if (copy) { nm = `${name} copy`; for (let i = 2; S.meals[nm]; i++) nm = `${name} copy ${i}`; }
  MB.draft = { name: nm, servings: String(m.servings), orig: copy ? '' : name, items: m.items.map(i => ({ name: i.name, qty: String(i.qty), unit: i.unit })) };
  render(); window.scrollTo(0, 0); { const sc = $('#scroller'); if (sc) sc.scrollTop = 0; } const f = $('#mn'); if (f) f.focus({ preventScroll: true });
}
function openDiary(name) {
  const m = S.meals[name]; if (!m) return;
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  dlg.innerHTML = `<form id="dform" method="dialog">
    <h2 id="dlg-title" style="font-size:20px">Add to diary</h2>
    <p class="muted" style="font-size:14px">Adds each ingredient of ${esc(name)} to the day you choose, so it counts in Day, Week and Trends. A later Cronometer export that covers that day replaces these lines.</p>
    <div><label for="dd">Day</label><input class="field" style="width:100%" type="date" id="dd" value="${esc(mealToday())}"></div>
    <div><label for="dg">Meal</label><select class="field" style="width:100%" id="dg">${['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(g => `<option>${g}</option>`).join('')}</select></div>
    <div><label for="dsv">Servings eaten</label><input class="field" style="width:100%" id="dsv" inputmode="decimal" value="1"></div>
    <div id="derr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">Add to diary</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
  </form>`;
  $('#dform').addEventListener('submit', ev => {
    ev.preventDefault();
    const date = $('#dd').value, eaten = num($('#dsv').value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('#derr').textContent = 'Choose a day.'; return; }
    if (!(eaten > 0)) { $('#derr').textContent = 'Enter how many servings you ate.'; return; }
    addToDiary(name, date, $('#dg').value, eaten);
  });
  if (!dlg.open) dlg.showModal();
  $('#dd').focus();
}
function addToDiary(name, date, group, eaten) {
  const m = S.meals[name], k = eaten / (Number(m.servings) > 0 ? Number(m.servings) : 1), list = [];
  for (const it of m.items) {
    const n = canon(it.name), q = r2(it.qty * k), o = perUnit(n, it.unit === 'item' ? 'item' : 'g');
    if (!(q > 0)) continue;
    list.push({ date, group, name: n, src: n, qty: q, unit: it.unit, type: it.unit === 'item' ? 'count' : it.unit === 'ml' ? 'volume' : 'mass', kcal: o ? r2(o.k * q) : 0, pro: o ? r2(o.p * q) : 0, carb: o ? r2(o.c * q) : 0, fat: o ? r2(o.f * q) : 0, fiber: o ? r2(o.b * q) : 0 });
  }
  S.entries = S.entries.concat(list).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  reindex(); ensurePrices(); saveEntries(); saveAll();
  S.day = date; $('#dlg').close(); go('day'); toast(`Added to ${dMed(date)}`);
}

function openBudget() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  dlg.innerHTML = `<form id="bform" method="dialog">
    <h2 id="dlg-title" style="font-size:20px">Daily budget</h2>
    <p class="muted" style="font-size:14px">Set what you want to spend on food each day. It shows on the Day and Week screens. Leave it empty to remove it.</p>
    <div><label for="bv">Budget per day</label><div class="money-in wide"><span>${esc(currencySymbol())}</span><input id="bv" type="text" inputmode="decimal" placeholder="0.00" value="${S.budget ? esc(S.budget) : ''}" autocomplete="off"></div></div>
    <div id="berr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px"><button type="submit" class="btn primary" style="flex:1">Save budget</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
  </form>`;
  $('#bform').addEventListener('submit', ev => {
    ev.preventDefault();
    const v = $('#bv').value.trim().replace(',', '.');
    if (v === '') S.budget = null;
    else if (!Number.isFinite(Number(v)) || Number(v) <= 0) { $('#berr').textContent = 'Enter an amount above zero, or leave it empty.'; return; }
    else S.budget = Number(v);
    saveAll(); dlg.close(); render(); toast(S.budget ? 'Budget saved' : 'Budget removed');
  });
  $('#dlg').showModal(); $('#bv').focus();
}

/* ============ exports ============ */
function download(name, blob) {
  if (window.MealNative && MealNative.isNative) { MealNative.save(name, blob).catch(e => { if (!/cancel|dismiss/i.test(String(e && e.message))) toast('Could not save the file.'); }); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv() {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Date', 'Meal', 'Food', 'Amount', `Cost (${S.currency})`, 'Offer', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)'].join(',')];
  for (const e of S.entries) {
    const c = costOf(e);
    rows.push([e.date, e.group, e.name, qtyFmt(e.qty) + ' ' + e.unit, c.cost == null ? '' : c.cost.toFixed(2), c.offer ? 'yes' : '', Math.round(e.kcal), e.pro.toFixed(1), e.carb.toFixed(1), e.fat.toFixed(1), (e.fiber || 0).toFixed(1)].map(q).join(','));
  }
  download('meal-costs.csv', new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  toast('CSV downloaded');
}
function backup() {
  const data = { app: 'mealcost', version: 1, currency: S.currency, budget: S.budget, prices: S.prices, overrides: S.overrides, merges: S.merges, ranges: S.ranges, recipes: S.recipes, meals: S.meals, foods: S.foods, cats: S.cats };
  download('meal-cost-prices.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  toast('Backup downloaded');
}
async function restore(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'mealcost' || typeof d.prices !== 'object' || !d.prices) throw new Error('bad');
    for (const [n, p] of Object.entries(d.prices)) {
      if (!p || typeof p !== 'object') continue;
      const price = p.price === '' || p.price == null ? '' : Number(p.price);
      const gpu = p.gpu === '' || p.gpu == null ? '' : Number(p.gpu);
      S.prices[n] = { price: Number.isFinite(price) && price >= 0 ? price : '', basis: ['kg', '100', 'unit'].includes(p.basis) ? p.basis : '100', gpu: Number.isFinite(gpu) && gpu > 0 ? gpu : '' };
    }
    for (const [dt, o] of Object.entries(d.overrides || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt) || !o || typeof o !== 'object') continue;
      for (const [n, v] of Object.entries(o)) if (Number.isFinite(Number(v)) && Number(v) >= 0) (S.overrides[dt] = S.overrides[dt] || {})[n] = Number(v);
    }
    for (const r of Array.isArray(d.ranges) ? d.ranges : []) {
      if (!r || typeof r.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.from) || (r.to && !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) || !Number.isFinite(Number(r.price))) continue;
      const rr = { id: String(r.id || Math.random().toString(36).slice(2, 9)), name: r.name, from: r.from, to: r.to || '', price: Number(r.price) };
      S.ranges = S.ranges.filter(x => x.id !== rr.id).concat(rr);
    }
    for (const [n, r] of Object.entries(d.recipes && typeof d.recipes === 'object' ? d.recipes : {})) {
      if (!r || !Array.isArray(r.items)) continue;
      S.recipes[n] = { servings: Number(r.servings) > 0 ? Number(r.servings) : 1, yieldG: Number(r.yieldG) > 0 ? Number(r.yieldG) : '', items: r.items.filter(i => i && typeof i.name === 'string' && ['g', 'ml', 'item'].includes(i.unit) && Number(i.qty) > 0).map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit })) };
    }
    for (const [n, m] of Object.entries(d.meals && typeof d.meals === 'object' ? d.meals : {})) {
      if (!m || !Array.isArray(m.items)) continue;
      const items = m.items.filter(i => i && typeof i.name === 'string' && ['g', 'ml', 'item'].includes(i.unit) && Number(i.qty) > 0).map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit }));
      if (items.length) S.meals[n] = { servings: Number(m.servings) > 0 ? Number(m.servings) : 1, items };
    }
    for (const [n, f] of Object.entries(d.foods && typeof d.foods === 'object' ? d.foods : {})) {
      if (!f || typeof f !== 'object') continue;
      const nn = x => Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : 0;
      S.foods[n] = { per: f.per === 'item' ? 'item' : '100g', kcal: nn(f.kcal), pro: nn(f.pro), carb: nn(f.carb), fat: nn(f.fat) };
    }
    for (const [a, b] of Object.entries(d.cats && typeof d.cats === 'object' ? d.cats : {})) if (typeof b === 'string' && b.trim()) S.cats[a] = b.trim();
    for (const [a, b] of Object.entries(d.merges || {})) if (typeof b === 'string' && a !== b && b) S.merges[a] = b;
    if (CURRENCIES.includes(d.currency)) S.currency = d.currency;
    if (d.budget > 0) S.budget = Number(d.budget);
    indexRanges(); reindex(); ensurePrices();
    saveAll(); render(); toast(S.entries.length || Object.keys(S.foods).length ? 'Backup restored' : 'Prices restored. Now drop in your Cronometer export.');
  } catch (e) { S.error = 'That file is not a Meal cost backup.'; render(); }
}
function dayText(d) {
  const es = IDX.byDate.get(d), sm = summarize(es);
  const parts = groupEntries(es).map(([g, l]) => `${g} ${money(r2(l.reduce((a, e) => a + (costOf(e).cost || 0), 0)))}`);
  const bits = [];
  if (sm.pro > 0 && sm.cost > 0) bits.push(`${money(sm.cost / (sm.pro / 100))} per 100 g protein`);
  if (sm.kcal > 0 && sm.cost > 0) bits.push(`${money(sm.cost / (sm.kcal / 1000))} per 1,000 kcal`);
  return `${dLong(d)}: ${money(sm.cost)}\n${parts.join(' | ')}\n${bits.join(', ')}\nWork out yours for free: ${SITE}`;
}
async function copyText(t, ok) {
  try { await navigator.clipboard.writeText(t); toast(ok); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(ok); } catch (e2) { toast('Could not copy. Select the text and copy it manually.'); }
    ta.remove();
  }
}
function weekText() {
  const dates = IDX.dates, last = dates[dates.length - 1], first = S.range ? isoAdd(last, -(S.range - 1)) : dates[0];
  const win = dates.filter(d => d >= first), tot = r2(win.reduce((a, d) => a + summarize(IDX.byDate.get(d)).cost, 0));
  const avg = win.length ? tot / win.length : 0;
  return `${dMed(win[0])} to ${dMed(last)}: ${money(tot)} on food\nAverage day ${money(avg)}, about ${money0(avg * 30)} per 30 days\nWork out yours for free: ${SITE}`;
}

/* share image */
async function shareImage() {
  const day = S.day || IDX.dates[IDX.dates.length - 1];
  const es = IDX.byDate.get(day), sm = summarize(es);
  try {
    await Promise.all([document.fonts.load('800 100px "Bricolage Grotesque"'), document.fonts.load('700 40px "Bricolage Grotesque"'), document.fonts.load('400 40px "IBM Plex Sans"')]);
  } catch (e) { /* fall back to system fonts */ }
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const D = '"Bricolage Grotesque","IBM Plex Sans",sans-serif', B = '"IBM Plex Sans",system-ui,sans-serif';
  c.fillStyle = '#C25A2B'; c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.font = `800 34px ${D}`; c.textAlign = 'left'; c.fillText('Coach Leonidas', 88, 122);
  c.textAlign = 'right'; c.font = `400 30px ${B}`; c.fillStyle = '#CFE6DB'; c.fillText(dFmt(day, { weekday: 'long', day: 'numeric', month: 'short' }), W - 88, 122);
  c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `800 88px ${D}`; c.fillText('My day of eating cost', 88, 292);
  // tag
  const amount = money(sm.cost);
  let fs = 232; c.font = `800 ${fs}px ${D}`;
  while (c.measureText(amount).width > 640 && fs > 90) { fs -= 8; c.font = `800 ${fs}px ${D}`; }
  const tw = c.measureText(amount).width, tx = 88, ty = 340, th = Math.round(fs * 1.17), tW = tw + 104 + 110;
  c.fillStyle = '#FFD43B'; c.beginPath();
  c.moveTo(tx, ty); c.lineTo(tx + tW - 84, ty); c.lineTo(tx + tW, ty + th / 2); c.lineTo(tx + tW - 84, ty + th); c.lineTo(tx, ty + th); c.closePath(); c.fill();
  c.fillStyle = '#C25A2B'; c.beginPath(); c.arc(tx + 52, ty + th / 2, 16, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1B2430'; c.font = `800 ${fs}px ${D}`; c.fillText(amount, tx + 104, ty + th / 2 + fs * 0.34);
  // meal lines
  const groups = groupEntries(es).map(([g, l]) => [g, r2(l.reduce((a, e) => a + (costOf(e).cost || 0), 0))]).slice(0, 6);
  const gap = Math.min(82, 400 / Math.max(groups.length, 1));
  let y = 720;
  for (const [g, v] of groups) {
    c.font = `400 42px ${B}`; c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(g, 88, y);
    const gw = c.measureText(g).width; c.textAlign = 'right'; const vs = money(v); c.fillText(vs, W - 88, y);
    const vw = c.measureText(vs).width;
    c.strokeStyle = '#8CBFA9'; c.lineWidth = 4; c.lineCap = 'round'; c.setLineDash([0, 13]);
    c.beginPath(); c.moveTo(88 + gw + 18, y - 2); c.lineTo(W - 88 - vw - 18, y - 2); c.stroke(); c.setLineDash([]);
    y += gap;
  }
  // stats
  c.textAlign = 'left';
  const pp = sm.pro > 0 && sm.cost > 0 ? money(sm.cost / (sm.pro / 100)) : null;
  let sx = 88;
  const stat = (big, small) => { c.fillStyle = '#fff'; c.font = `700 72px ${D}`; c.fillText(big, sx, 1130); c.fillStyle = '#CFE6DB'; c.font = `400 28px ${B}`; c.fillText(small, sx, 1172); c.font = `700 72px ${D}`; sx += Math.max(c.measureText(big).width, 300) + 72; };
  if (pp) stat(pp, 'per 100 g protein');
  stat(n0(sm.pro) + ' g', `protein in ${n0(sm.kcal)} kcal`);
  c.strokeStyle = '#8CBFA9'; c.lineWidth = 2; c.beginPath(); c.moveTo(88, 1236); c.lineTo(W - 88, 1236); c.stroke();
  c.fillStyle = '#fff'; c.font = `400 30px ${B}`; c.fillText(`Work out yours for free at ${SITE}`, 88, 1286);
  cv.toBlob(b => { if (b) { download(`meal-cost-${day}.png`, b); toast('Image downloaded'); } else toast('Could not make the image.'); }, 'image/png');
}

/* ============ events ============ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, d = t.dataset;
  if (a !== 'drawer' && t.closest('#drawer')) document.body.classList.remove('drawer-open');
  switch (a) {
    case 'import': $('#file').click(); break;
    case 'add-food': openFood(); break;
    case 'edit-food': openFood(d.name); break;
    case 'del-food': if (confirm(`Remove ${d.name} from your foods?`)) { delete S.foods[d.name]; if (!(IDX.byName.get(d.name) || []).length) delete S.prices[d.name]; reindex(); saveAll(); $('#dlg').close(); render(); toast('Food removed'); } break;
    case 'start-manual': S.started = true; saveAll(); go('prices'); break;
    case 'tview': S.tview = d.v; saveAll(); render(); break;
    case 'vmacro': S.vmacro = d.v; S.vall = false; saveAll(); render(); break;
    case 'vall': S.vall = !S.vall; render(); break;
    case 'drawer': document.body.classList.toggle('drawer-open'); t.setAttribute('aria-expanded', document.body.classList.contains('drawer-open')); break;
    case 'drawer-close': document.body.classList.remove('drawer-open'); break;
    case 'sample': loadSample(); break;
    case 'pick-day': S.day = d.date; render(); break;
    case 'prev-day': { const i = IDX.dates.indexOf(S.day); if (i > 0) { S.day = IDX.dates[i - 1]; render(); } break; }
    case 'next-day': { const i = IDX.dates.indexOf(S.day); if (i < IDX.dates.length - 1) { S.day = IDX.dates[i + 1]; render(); } break; }
    case 'offer': openOffer(d.date, d.name, d.id); break;
    case 'del-offer': if (S.overrides[d.date]) { delete S.overrides[d.date][d.name]; if (!Object.keys(S.overrides[d.date]).length) delete S.overrides[d.date]; saveAll(); render(); toast('Offer removed'); } break;
    case 'dlg-del': {
      if (d.id) { S.ranges = S.ranges.filter(r => r.id !== d.id); indexRanges(); }
      else { const dt = $('#od').value, n = $('#of').value; if (S.overrides[dt]) { delete S.overrides[dt][n]; if (!Object.keys(S.overrides[dt]).length) delete S.overrides[dt]; } }
      saveAll(); $('#dlg').close(); render(); toast('Price removed'); break;
    }
    case 'close-dlg': $('#dlg').close(); break;
    case 'ph-add': { const q = $('#phq'); if (q && q.value.trim()) phAdd(q.value); break; }
    case 'ph-del': S.ph = S.ph.filter(n => n !== d.name); store.set('phist', S.ph); render(); break;
    case 'meal-add': mealSync(); MB.draft.items.push({ name: '', qty: '', unit: 'g' }); render(); { const r = document.querySelectorAll('#mform .mrow'); const f = r.length && $('[data-m=name]', r[r.length - 1]); if (f) f.focus(); } break;
    case 'meal-del-row': mealSync(); MB.draft.items.splice(Number(d.i), 1); if (!MB.draft.items.length) MB.draft.items.push({ name: '', qty: '', unit: 'g' }); render(); break;
    case 'meal-new': MB.draft = newDraft(); render(); { const f = $('#mn'); if (f) f.focus(); } break;
    case 'meal-edit': loadMeal(d.name, false); break;
    case 'meal-dup': loadMeal(d.name, true); toast('Copy opened. Rename it and save.'); break;
    case 'meal-diary': openDiary(d.name); break;
    case 'meal-delete':
      if (confirm(`Delete the meal "${d.name}"?`)) {
        delete S.meals[d.name]; MB.cmp = MB.cmp.filter(n => n !== d.name);
        if (MB.draft && MB.draft.orig === d.name) MB.draft.orig = '';
        saveAll(); render(); toast('Meal deleted');
      }
      break;
    case 'budget': openBudget(); break;
    case 'goto-price': S.filter = d.name; S.chip = 'all'; go('prices'); break;
    case 'unpriced-link': S.chip = 'unpriced'; S.filter = ''; break;
    case 'chip': S.chip = d.chip; S.showAll = false; render(); break;
    case 'toggle-all': S.showAll = !S.showAll; refreshPriceBody(); break;
    case 'flip': S.flip = !S.flip; saveAll(); render(); break;
    case 'sort-col': if (S.sort === d.sort) S.flip = !S.flip; else { S.sort = d.sort; S.flip = false; } saveAll(); render(); break;
    case 'edit-recipe': openRecipe(d.name); break;
    case 'toggle-unc': S.uncOpen = !S.uncOpen; render(); break;
    case 'toggle-recipe': if (S.open.has(d.key)) S.open.delete(d.key); else S.open.add(d.key); render(); break;
    case 'rec-add': syncRecipe(); REC.items.push({ name: '', qty: '', unit: 'g' }); drawRecipe(); break;
    case 'rec-del': syncRecipe(); REC.items.splice(Number(d.i), 1); if (!REC.items.length) REC.items.push({ name: '', qty: '', unit: 'g' }); drawRecipe(); break;
    case 'rec-delete': delete S.recipes[REC.name]; reindex(); ensurePrices(); saveAll(); $('#dlg').close(); render(); toast('Recipe removed'); break;
    case 'del-range': S.ranges = S.ranges.filter(r => r.id !== d.id); indexRanges(); saveAll(); render(); toast('Price removed'); break;
    case 'merge': openMerge(d.name); break;
    case 'merge-now': doMerge(d.drop, d.keep); render(); toast(`Merged into ${d.keep}`); break;
    case 'not-same': S.nomerge.push(pairKey(d.drop, d.keep)); saveAll(); render(); break;
    case 'unmerge': delete S.merges[d.src]; reindex(); ensurePrices(); saveAll(); { const cur = canon(d.src); $('#dlg').close(); render(); toast(`${d.src} is separate again`); void cur; } break;
    case 'export-csv': exportCsv(); break;
    case 'theme': { const t = MealTheme.cycle(); render(); toast('Theme: ' + cap(t)); break; }
    case 'backup': backup(); break;
    case 'restore': $('#pfile').click(); break;
    case 'reset':
      if (confirm('Delete all imported entries, prices and offers from this browser? This cannot be undone.')) {
        store.clear(); S.entries = []; S.prices = {}; S.overrides = {}; S.merges = {}; S.nomerge = []; S.ranges = []; S.recipes = {}; S.meals = {}; S.foods = {}; S.started = false; MB.draft = null; MB.cmp = []; S.cats = {}; indexRanges(); S.budget = null; S.day = null; S.filter = ''; S.chip = 'all'; reindex();
        history.replaceState(null, '', location.pathname); S.tab = 'day'; render(); toast('All data deleted');
      }
      break;
    case 'share-image': shareImage(); break;
    case 'copy-day': copyText(dayText(S.day), 'Copied. Paste it into your post.'); break;
    case 'copy-week': copyText(weekText(), 'Copied. Paste it into your post.'); break;
  }
});

function refreshPriceBody() {
  const { rows, foot } = priceBodyHtml();
  const b = $('#pbody'), f = $('#pfoot'); if (b) b.innerHTML = rows; if (f) f.innerHTML = foot;
}
function refreshMeta() {
  const c = counts();
  const un = $('#unp'); if (un) { un.hidden = !c.un; $('#unp-t').innerHTML = unpText(c.un); }
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#c-all', c.all); set('#c-un', c.un); set('#c-of', c.offers);
}
function refreshRow(tr) {
  const name = tr.dataset.name, iss = issue(name), sp = spend(name), m = IDX.meta.get(name);
  tr.classList.toggle('needs', !!iss);
  $('.sl', tr).textContent = subText(name, iss);
  $('.sp', tr).innerHTML = sp.count ? esc(money(sp.total)) : '<span class="muted">Not counted</span>';
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.closest && t.closest('#rform')) { previewRecipe(); return; }
  if (t.closest && t.closest('#mform')) { mealSync(); if (t.id === 'mdate') { MB.date = t.value; mealRefresh(true); } else mealRefresh(false); return; }
  if (t.id === 'q') { S.filter = t.value; S.showAll = false; refreshPriceBody(); return; }
  const f = t.dataset && t.dataset.f; if (!f) return;
  const tr = t.closest('tr'); if (!tr) return;
  const p = S.prices[tr.dataset.name]; if (!p) return;
  if (f === 'price' || f === 'gpu') {
    const v = t.value.trim().replace(',', '.');
    if (v === '') p[f] = '';
    else if (Number.isFinite(Number(v)) && Number(v) >= 0) p[f] = Number(v);
    else return;
  }
  saveSoon(); refreshRow(tr); refreshMeta();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'phq') { phAdd(t.value); return; }
  if (t.dataset && t.dataset.cmp !== undefined) {
    MB.cmp = MB.cmp.filter(n => n !== t.dataset.cmp);
    if (t.checked) { MB.cmp.push(t.dataset.cmp); if (MB.cmp.length > 2) MB.cmp.shift(); }
    mealRefresh(true); return;
  }
  if (t.dataset && t.dataset.cat !== undefined) {
    const n = t.closest('[data-name]').dataset.name, v = t.value.trim();
    if (v) S.cats[n] = v; else delete S.cats[n];
    saveAll(); render(); toast(v ? `Category set to ${v}` : 'Category cleared'); return;
  }
  if (t.dataset && t.dataset.f === 'basis') { const tr = t.closest('tr'); S.prices[tr.dataset.name].basis = t.value; saveSoon(); refreshRow(tr); refreshMeta(); }
  else if (t.id === 'cur') { S.currency = t.value; saveAll(); render(); }
  else if (t.id === 'sortsel') { S.sort = SORTS[t.value] ? t.value : 'freq'; S.flip = false; saveAll(); render(); }
  else if (t.id === 'catsel') { S.cat = t.value; S.showAll = false; render(); }
  else if (t.id === 'tgrain') { S.grain = t.value === 'day' ? 'day' : 'week'; saveAll(); render(); }
  else if (t.id === 'trange') { S.trange = Number(t.value) || 0; saveAll(); render(); }
  else if (t.id === 'range') { S.range = Number(t.value); render(); }
  else if (t.id === 'daysel') { S.day = t.value; render(); }
  else if (t.id === 'file') { handleFile(t.files[0]); t.value = ''; }
  else if (t.id === 'pfile') { restore(t.files[0]); t.value = ''; }
});
window.addEventListener('dragover', e => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); });
window.addEventListener('dragleave', () => { const d = $('#drop'); if (d) d.classList.remove('over'); });
window.addEventListener('drop', e => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) handleFile(f); });
document.addEventListener('submit', e => { if (e.target.id === 'mform') { e.preventDefault(); saveMeal(); } });
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => { if (!window.__mcNoSave) saveAll(); });

/* ============ start ============ */
if (store.get('parser', 1) < 2) {
  // Entries saved by an older version: re-read amounts such as "2.00 x 100.0 g" that were stored as item counts.
  S.entries = S.entries.map(e => { if (e.type !== 'count') return e; const a = parseAmount(`${e.qty} ${e.unit}`); return { ...e, qty: a.qty, unit: a.unit, type: a.type }; });
  if (S.entries.length) saveEntries();
  store.set('parser', 2);
}
indexRanges(); reindex(); ensurePrices();
route();
if (window.MealSync) { MealSync.onchange = () => render(); MealSync.init(); }
window.__mealcost = { S, parseCronometer, costOf, summarize, macros, catOf, recipeCostOf, IDX: () => IDX };

if ('serviceWorker' in navigator && !(window.MealNative && MealNative.isNative) && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
