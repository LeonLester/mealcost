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
  set(k, v) { try { localStorage.setItem('mcc.' + k, JSON.stringify(v)); return true; } catch (e) { toast('Could not save in this browser. Storage may be full or blocked.'); return false; } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('mcc.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ } }
};

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK', 'CHF', 'PLN', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD'];
const S = {
  entries: store.get('entries', []),
  prices: store.get('prices', {}),
  overrides: store.get('overrides', {}),
  currency: store.get('currency', 'EUR'),
  budget: store.get('budget', null),
  tab: 'day', day: null, range: 7, filter: '', chip: 'all', showAll: false, error: ''
};
if (!CURRENCIES.includes(S.currency)) S.currency = 'EUR';

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
const dMed = d => dFmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const pad = n => String(n).padStart(2, '0');
const isoOf = x => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
const isoAdd = (d, n) => { const x = dObj(d); x.setDate(x.getDate() + n); return isoOf(x); };

/* ============ icons ============ */
const IC = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  upload: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#12614A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E6A75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>'
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
    carbs: find('carbs', 'carbohydrates'), fat: find('fat (g)', 'fat')
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
  const tok = l.split(/[\s(]/)[0].replace(/\.$/, '');
  switch (tok) {
    case 'g': case 'gram': case 'grams': case 'gr': return { qty, unit: 'g', type: 'mass' };
    case 'kg': return { qty: qty * 1000, unit: 'g', type: 'mass' };
    case 'mg': return { qty: qty / 1000, unit: 'g', type: 'mass' };
    case 'oz': return { qty: qty * 28.3495, unit: 'g', type: 'mass' };
    case 'lb': case 'lbs': return { qty: qty * 453.592, unit: 'g', type: 'mass' };
    case 'ml': return { qty, unit: 'ml', type: 'volume' };
    case 'l': case 'liter': case 'litre': return { qty: qty * 1000, unit: 'ml', type: 'volume' };
    default: return { qty, unit: raw || 'serving', type: 'count' };
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
      kcal: num(r[c.kcal]), pro: num(r[c.protein]), carb: num(r[c.carbs]), fat: num(r[c.fat])
    });
  }
  if (!out.length) throw new Error('No food entries found in this file.');
  return out;
}

/* ============ indexes ============ */
let IDX = { byName: new Map(), byDate: new Map(), dates: [], meta: new Map() };
function reindex() {
  const byName = new Map(), byDate = new Map(), meta = new Map();
  for (const e of S.entries) {
    if (!byName.has(e.name)) byName.set(e.name, []);
    byName.get(e.name).push(e);
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  for (const [name, es] of byName) {
    let count = 0, mass = 0, vol = 0; const labels = {};
    for (const e of es) {
      if (e.type === 'count') { count++; const k = e.unit.toLowerCase(); labels[k] = (labels[k] || 0) + 1; }
      else if (e.type === 'volume') vol++; else mass++;
    }
    const top = Object.entries(labels).sort((a, b) => b[1] - a[1])[0];
    meta.set(name, { n: es.length, count, mass, vol, unit: top ? top[0] : 'item', countFirst: count > mass + vol });
  }
  IDX = { byName, byDate, meta, dates: [...byDate.keys()].sort() };
}

function ensurePrices() {
  for (const [name, m] of IDX.meta) {
    if (!S.prices[name]) S.prices[name] = { price: '', basis: m.countFirst ? 'unit' : '100', gpu: '' };
  }
}

/* ============ costing ============ */
function priceInfo(name, date, useOverride = true) {
  const p = S.prices[name];
  if (!p) return null;
  const ov = useOverride && S.overrides[date] ? S.overrides[date][name] : undefined;
  const price = ov != null ? ov : p.price;
  if (price === '' || price == null || !Number.isFinite(Number(price))) return null;
  return { price: Number(price), basis: p.basis, gpu: Number(p.gpu) || 0, offer: ov != null, base: p.price === '' || p.price == null ? null : Number(p.price) };
}
function calc(e, pi) {
  const { price, basis, gpu } = pi;
  if (e.type === 'count') {
    if (basis === 'unit') return e.qty * price;
    if (gpu > 0) return e.qty * gpu / (basis === 'kg' ? 1000 : 100) * price;
    return null;
  }
  if (basis === '100') return e.qty / 100 * price;
  if (basis === 'kg') return e.qty / 1000 * price;
  if (gpu > 0) return e.qty / gpu * price;
  return null;
}
function costOf(e, useOverride = true) {
  const pi = priceInfo(e.name, e.date, useOverride);
  if (!pi) return { cost: null, why: 'noprice' };
  const c = calc(e, pi);
  if (c == null) return { cost: null, why: 'needgpu' };
  return { cost: r2(c), offer: pi.offer, pi };
}
function issue(name) {
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
  <header class="topbar plain"><div class="wrap"><div class="brand"><b>Coach Leonidas</b><span>Meal cost calculator</span></div><span class="grow"></span><span class="muted">Free, private, no sign-up</span></div></header>
  <main class="wrap">
    ${S.error ? `<div class="notice error" role="alert">${IC.info}<div>${esc(S.error)}</div></div>` : ''}
    <div class="hero">
      <div style="flex:1 1 520px">
        <h1 id="h1" tabindex="-1">See what each meal really costs.</h1>
        <p class="lede" style="font-size:19px;line-height:1.55">Drop in your Cronometer export, add your grocery prices once, and get a cost for every meal, every day and every week.</p>
        <div class="drop" id="drop">
          ${IC.upload}
          <div style="flex:1 1 220px;min-width:0"><div style="font-weight:600;font-size:18px">Drop your Cronometer export here</div><div class="muted" style="font-size:15px;margin-top:4px">Food &amp; Recipe Entries, as a .csv file</div></div>
          <button class="btn primary" data-act="import">Choose file</button>
        </div>
        <div style="margin-top:18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px">
          <button class="btn outline" data-act="sample">Try it with sample data</button>
          <span class="muted" style="display:flex;align-items:center;gap:8px;font-size:15px">${IC.lock}Your file is read in this browser. Nothing is uploaded.</span>
        </div>
      </div>
      <div style="flex:1 1 420px">
        <div class="card preview" aria-label="Example of a day's cost">
          <div class="row" style="justify-content:space-between"><b>Wednesday 11 November</b><span class="muted" style="font-size:14px">Sample day</span></div>
          <div style="margin:22px 0 26px"><div class="pricetag sm"><span class="n">€9.90</span><span class="l">for the day</span></div></div>
          ${['Breakfast|€1.63', 'Lunch|€3.10', 'Dinner|€4.35|1', 'Snacks|€0.82'].map(x => { const [n, c, o] = x.split('|'); return `<div class="row" style="padding:9px 0;font-size:17px"><span>${n}</span>${o ? '<span class="offer-tag" style="margin-left:10px">1 offer</span>' : ''}<span class="lead"></span><span>${c}</span></div>`; }).join('')}
          <div class="statline" style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line)">
            <div><div class="big" style="font-size:28px">€5.85</div><div class="muted" style="font-size:14px">per 100 g protein</div></div>
            <div><div class="big" style="font-size:28px">€3.93</div><div class="muted" style="font-size:14px">per 1,000 kcal</div></div>
          </div>
        </div>
      </div>
    </div>
    <section class="steps">
      <h2>Three steps, about five minutes the first time</h2>
      <div style="display:flex;flex-wrap:wrap;gap:32px">
        <div class="s"><span class="num">1</span><div><div style="font-weight:600;font-size:18px">Export from Cronometer</div><p class="muted" style="margin-top:6px">On the web app, open Account, choose Export Data, then Food &amp; Recipe Entries. Pick your dates and download the CSV.</p></div></div>
        <div class="s"><span class="num">2</span><div><div style="font-weight:600;font-size:18px">Drop the file in</div><p class="muted" style="margin-top:6px">Your entries load straight away. Import a newer export any time: days you already have are updated, not duplicated.</p></div></div>
        <div class="s"><span class="num">3</span><div><div style="font-weight:600;font-size:18px">Add your prices once</div><p class="muted" style="margin-top:6px">Only foods you logged appear. Enter what you paid per kilo, per 100 g or per item. Prices are saved for next time.</p></div></div>
      </div>
    </section>
  </main>
  ${siteFooter()}`;
}
function siteFooter() {
  return `<footer class="site wrap">A free tool from Coach Leonidas for people who track their food and their budget. <a href="https://coachleonidas.com">coachleonidas.com</a></footer>`;
}

/* ============ view: shell ============ */
function appView() {
  const body = S.tab === 'prices' ? pricesView() : S.tab === 'week' ? weekView() : dayView();
  return `
  <header class="topbar"><div class="wrap">
    <div class="brand"><b>Coach Leonidas</b><span>Meal cost calculator</span></div>
    <nav class="tabs" aria-label="Sections">${['day', 'prices', 'week'].map(t => `<a class="tab" href="#${t}"${S.tab === t ? ' aria-current="page"' : ''}>${cap(t)}</a>`).join('')}</nav>
    <div class="tools"><button class="btn sm" data-act="import">Add export</button><button class="btn sm" data-act="export-csv">Download CSV</button></div>
  </div></header>
  <main class="wrap">${S.error ? `<div class="notice error" role="alert">${IC.info}<div>${esc(S.error)}</div></div>` : ''}${body}</main>
  ${siteFooter()}`;
}

/* ============ view: day ============ */
function swapFor(es) {
  // Suggest a cheaper food with similar protein density for the priciest high-protein item.
  const rates = new Map();
  for (const [name, list] of IDX.byName) {
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
    if (e.type === 'count' || e.pro < 15) continue;
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

function dayView() {
  const dates = IDX.dates;
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
    const items = list.map(e => {
      const c = costOf(e); kcal += e.kcal;
      let cell, note = '';
      if (c.cost == null) {
        cell = `<button class="setprice" data-act="goto-price" data-name="${esc(e.name)}">${c.why === 'needgpu' ? 'Add grams per item' : 'Set price'}</button>`;
      } else {
        cost += c.cost;
        cell = `<button class="costbtn" data-act="offer" data-date="${day}" data-name="${esc(e.name)}" aria-label="Change the price of ${esc(e.name)} for this day">${c.offer ? '<span class="offer-tag">Offer</span>' : ''}<span>${money(c.cost)}</span></button>`;
        if (c.offer && c.pi.base != null) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today, usually ${money(c.pi.base)}</div>`;
        else if (c.offer) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today</div>`;
      }
      return `<div class="item"><div style="min-width:0"><span style="font-size:17px">${esc(e.name)}</span><span class="amt">${qtyFmt(e.qty)} ${esc(e.unit)}</span>${note}</div><span class="lead"></span>${cell}</div>`;
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
    <div class="card main2" style="padding:8px 32px 16px">${mealHtml}<p class="muted" style="margin:16px 0 8px;font-size:14px">Select any price to change it for this day only. Your standard prices stay as they are.</p></div>
    <aside class="side">
      <div class="card" style="padding:28px 28px 24px">
        <div class="pricetag"><span class="n">${money(sm.cost)}</span><span class="l">for the day</span></div>
        ${sm.saved > 0.004 ? `<p style="margin-top:16px;color:#0B4A37">${offerNames.length === 1 ? `Your offer on ${esc(offerNames[0])}` : `Your ${offerNames.length} offers`} saved you ${money(sm.saved)} today.</p>` : ''}
        ${sm.unpriced ? `<p style="margin-top:12px;font-size:15px">Totals leave out ${sm.unpriced} ${sm.unpriced === 1 ? 'item' : 'items'} without a price.</p>` : ''}
        <div style="margin-top:22px">
          ${budget ? `<div class="row" style="justify-content:space-between;font-size:15px"><span>Daily budget ${money(budget)}</span><b>${left >= 0 ? money(left) + ' left' : money(-left) + ' over'}</b></div>
          <div class="bar" role="img" aria-label="${pct} percent of the daily budget used" style="margin-top:8px"><div style="width:${pct}%${left < 0 ? ';background:var(--ink)' : ''}"></div></div>
          <button class="btn link" data-act="budget">Change budget</button>` : `<button class="btn outline" data-act="budget">Set a daily budget</button>`}
        </div>
      </div>
      <div class="card statline" style="padding:24px 28px">
        ${pp != null ? `<div><div class="big">${money(pp)}</div><div class="muted" style="font-size:14px">per 100 g protein</div></div>` : ''}
        ${pk != null ? `<div><div class="big">${money(pk)}</div><div class="muted" style="font-size:14px">per 1,000 kcal</div></div>` : ''}
        <div><div class="big">${n0(sm.pro)} g</div><div class="muted" style="font-size:14px">protein, ${n0(sm.kcal)} kcal</div></div>
      </div>
      ${swap ? `<div class="card" style="padding:24px 28px"><h2 style="font-size:20px">A cheaper way to hit your protein</h2>
        <p style="margin-top:10px">Swap the ${qtyFmt(swap.qty)} ${esc(swap.unit)} of ${esc(swap.from)} for ${qtyFmt(swap.qty)} ${esc(swap.unit)} of ${esc(swap.to)}. It saves ${money(swap.saving)}${swap.dPro >= 1 ? ' and adds ' + n0(swap.dPro) + ' g of protein' : ' and keeps the protein about the same'}.</p>
        <p class="muted" style="margin-top:8px;font-size:14px">Based on your own prices and today's offers.</p></div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <button class="btn primary" style="flex:1 1 160px" data-act="share-image">Make share image</button>
        <button class="btn" style="flex:1 1 160px" data-act="copy-day">Copy as text</button>
      </div>
    </aside>
  </div>`;
}

/* ============ view: prices ============ */
function offerCounts() {
  const m = new Map();
  for (const d in S.overrides) for (const n in S.overrides[d]) m.set(n, (m.get(n) || 0) + 1);
  return m;
}
function priceRow(name, oc) {
  const p = S.prices[name], m = IDX.meta.get(name), iss = issue(name), sp = spend(name), o = oc.get(name) || 0;
  const vol = m.vol > m.mass;
  const sub = iss === 'noprice' ? 'Needs a price' : iss === 'needgpu' ? 'Needs grams per item' : `Logged ${m.n} ${m.n === 1 ? 'time' : 'times'}${m.countFirst ? ', as items' : ''}`;
  return `<tr data-name="${esc(name)}"${iss ? ' class="needs"' : ''}>
    <th scope="row"><div>${esc(name)}${o ? ` <span class="offer-tag">${o} ${o === 1 ? 'offer' : 'offers'}</span>` : ''}</div><div class="sub sl">${sub}</div></th>
    <td><div class="money-in"><span>${esc(currencySymbol())}</span><input type="text" inputmode="decimal" data-f="price" aria-label="Price of ${esc(name)}" placeholder="0.00" value="${p.price === '' ? '' : esc(p.price)}"></div></td>
    <td><select class="field" data-f="basis" aria-label="Price unit for ${esc(name)}">
      <option value="kg"${p.basis === 'kg' ? ' selected' : ''}>per ${vol ? 'litre' : 'kg'}</option>
      <option value="100"${p.basis === '100' ? ' selected' : ''}>per ${vol ? '100 ml' : '100 g'}</option>
      <option value="unit"${p.basis === 'unit' ? ' selected' : ''}>per ${m.countFirst ? esc(m.unit) : 'item'}</option></select></td>
    <td><input class="field gpu" type="text" inputmode="decimal" data-f="gpu" aria-label="Grams per item for ${esc(name)}" placeholder="optional" value="${p.gpu === '' ? '' : esc(p.gpu)}"></td>
    <td class="r sp">${sp.count ? money(sp.total) : '<span class="muted">Not counted</span>'}</td></tr>`;
}
function filteredFoods() {
  const oc = offerCounts();
  let names = [...IDX.meta.keys()].sort((a, b) => IDX.meta.get(b).n - IDX.meta.get(a).n || a.localeCompare(b));
  const q = S.filter.trim().toLowerCase();
  if (q) names = names.filter(n => n.toLowerCase().includes(q));
  if (S.chip === 'unpriced') names = names.filter(n => issue(n));
  if (S.chip === 'offers') names = names.filter(n => oc.get(n));
  return { names, oc };
}
function priceBodyHtml() {
  const { names, oc } = filteredFoods();
  const limited = !S.showAll && !S.filter && S.chip === 'all' && names.length > 12;
  const shown = limited ? names.slice(0, 12) : names;
  const total = IDX.meta.size;
  const rows = shown.length ? shown.map(n => priceRow(n, oc)).join('') : `<tr><td colspan="5" style="padding:24px 20px" class="muted">No foods match. Clear the search or choose another filter.</td></tr>`;
  const foot = `<span class="muted" style="font-size:15px">Showing ${shown.length} of ${total} foods, most logged first</span>${limited ? '<button class="btn link" data-act="toggle-all">Show all foods</button>' : (S.showAll && total > 12 && !S.filter && S.chip === 'all' ? '<button class="btn link" data-act="toggle-all">Show fewer</button>' : '')}`;
  return { rows, foot };
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
  for (const d in S.overrides) for (const n in S.overrides[d]) offerList.push({ d, n, v: S.overrides[d][n] });
  offerList.sort((a, b) => b.d.localeCompare(a.d) || a.n.localeCompare(b.n));
  return `
  <h1 class="h1" id="h1" tabindex="-1">Your prices</h1>
  <p class="lede">Set a price once and it applies to every day you logged that food. Use an offer when a price was different on one day.</p>
  <div class="notice" id="unp" role="status"${c.un ? '' : ' hidden'}>${IC.info}<div id="unp-t">${unpText(c.un)}</div></div>
  <div class="cols" style="margin-top:24px">
    <div class="main2" style="flex:2 1 640px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
        <div class="search">${IC.search}<input type="search" id="q" aria-label="Search foods" placeholder="Search foods" value="${esc(S.filter)}"></div>
        <div role="group" aria-label="Filter foods" style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="chip" data-act="chip" data-chip="all" aria-pressed="${S.chip === 'all'}">All <span id="c-all">${c.all}</span></button>
          <button class="chip" data-act="chip" data-chip="unpriced" aria-pressed="${S.chip === 'unpriced'}">No price <span id="c-un">${c.un}</span></button>
          <button class="chip" data-act="chip" data-chip="offers" aria-pressed="${S.chip === 'offers'}">With offers <span id="c-of">${c.offers}</span></button>
        </div>
        <span class="grow"></span>
        <label class="muted" style="display:flex;align-items:center;gap:8px;font-size:15px">Currency <select class="field" id="cur">${CURRENCIES.map(x => `<option${x === S.currency ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <div class="tablewrap" style="margin-top:16px"><table>
        <thead><tr><th scope="col">Food</th><th scope="col">Price</th><th scope="col">Per</th><th scope="col">Grams per item</th><th scope="col" class="r">Spent</th></tr></thead>
        <tbody id="pbody">${rows}</tbody></table></div>
      <div id="pfoot" style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px">${foot}</div>
      <p class="muted" style="margin-top:8px;max-width:620px;font-size:14px">Grams per item is only needed when a food is logged one way and priced another, for example eggs logged as items but priced per kg.</p>
    </div>
    <aside class="side">
      <div class="card" style="padding:24px 24px 16px">
        <h2 style="font-size:24px">Offers</h2>
        <p class="muted" style="margin-top:8px;font-size:15px">An offer replaces your standard price for one day. Use it for sales, a different shop or a bulk buy.</p>
        <div style="margin-top:12px">${offerList.length ? offerList.map(o => {
          const base = S.prices[o.n] && S.prices[o.n].price !== '' ? S.prices[o.n].price : null;
          return `<div style="padding:14px 0;border-top:1px solid var(--line2)"><div style="display:flex;align-items:baseline;gap:10px"><span class="offer-tag">Offer</span><b>${esc(o.n)}</b></div>
          <div style="margin-top:6px;font-size:15px">${esc(dMed(o.d))}: ${money(o.v)} per ${esc(basisText(S.prices[o.n] ? S.prices[o.n].basis : 'kg', o.n))}${base != null ? ` <span class="muted">(usually ${money(base)})</span>` : ''}</div>
          <div style="display:flex;gap:16px"><button class="btn link" data-act="offer" data-date="${o.d}" data-name="${esc(o.n)}">Edit</button><button class="btn link" data-act="del-offer" data-date="${o.d}" data-name="${esc(o.n)}">Remove</button></div></div>`;
        }).join('') : '<p class="muted" style="padding:14px 0;border-top:1px solid var(--line2);font-size:15px">No offers yet.</p>'}</div>
        <button class="btn primary" style="width:100%;margin-bottom:12px" data-act="offer">Add an offer</button>
      </div>
      <div class="card" style="padding:24px">
        <h2 style="font-size:20px">Keep your prices safe</h2>
        <p class="muted" style="margin-top:8px;font-size:15px">Everything is saved in this browser only. Download a backup to use your prices on another device.</p>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn sm" data-act="backup">Download backup</button><button class="btn sm" data-act="restore">Restore backup</button></div>
        <button class="btn link" style="margin-top:8px" data-act="reset">Delete all data from this browser</button>
      </div>
    </aside>
  </div>`;
}
const unpText = k => `<strong>${k} ${k === 1 ? 'food needs' : 'foods need'} a price.</strong> Totals leave ${k === 1 ? 'it' : 'them'} out until you add one.`;

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
    <label class="muted" style="display:flex;align-items:center;gap:10px;font-size:15px">Range <select class="field" id="range">${[[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [0, 'Everything imported']].map(([v, l]) => `<option value="${v}"${S.range === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
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
      <h2 style="font-size:24px">Cost by day</h2>
      <p class="muted" style="margin-top:6px;font-size:15px">${esc(sub)}</p>
      <div class="chart">
        ${budget ? `<div class="hline" style="bottom:${budget / top * H}px;border-color:var(--ink)"></div>` : ''}
        ${nd ? `<div class="hline" style="bottom:${avg / top * H}px;border-color:#7C8A83"></div>` : ''}
        <div class="cols2">${cdays.map((d, i) => `<div class="c">${nB <= 10 ? `<b>${money(vals[i])}</b>` : ''}<i title="${esc(dMed(d))}: ${money(vals[i])}" style="height:${vals[i] ? Math.max(2, vals[i] / top * H) : 0}px;background:${budget && vals[i] > budget ? 'var(--ink)' : 'var(--bar)'}"></i></div>`).join('')}</div>
      </div>
      <div class="xlabels">${cdays.map((d, i) => `<span>${nB <= 10 ? esc(dShort(d)) : (i % step === 0 ? esc(dFmt(d, { day: 'numeric' })) : '')}</span>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--bar)"></i>${budget ? 'Within budget' : 'Daily cost'}</span>${budget ? '<span><i style="background:var(--ink)"></i>Over budget</span>' : ''}${budget ? `<span><i style="width:22px;height:0;background:none;border-top:2px dashed var(--ink);border-radius:0"></i>Budget ${esc(money(budget))}</span>` : ''}<span><i style="width:22px;height:0;background:none;border-top:2px dashed #7C8A83;border-radius:0"></i>Average ${esc(money(avg))}</span></div>
    </section>
    <section class="card third" style="padding:24px 28px">
      <h2 style="font-size:24px">Average cost per meal</h2>
      <div style="margin-top:14px">${mealRows.map(([g, o]) => `<div class="row" style="padding:11px 0;font-size:17px"><span>${esc(g)}</span><span class="lead"></span><span>${money(o.sum / o.n)}</span></div>`).join('')}
        <div class="row" style="margin-top:8px;padding-top:14px;border-top:1px solid var(--ink);justify-content:space-between"><b>Average day</b><span class="big" style="font-size:28px">${money(avg)}</span></div></div>
    </section>
  </div>
  <div class="cols" style="margin-top:28px">
    <section class="card half" style="padding:24px 28px">
      <h2 style="font-size:24px">Where the money went</h2>
      <p class="muted" style="margin-top:6px;font-size:15px">Your biggest foods by spend.</p>
      <div style="margin-top:12px">${topSpend.map(([n, v]) => `<div class="brow"><div class="n"><div>${esc(n)}</div><div class="sub">${total ? Math.round(v / total * 100) : 0}% of spend</div></div><div class="b bar"><div style="width:${v / maxSpend * 100}%"></div></div><div class="a">${money(r2(v))}</div></div>`).join('') || '<p class="muted">Add prices to see this.</p>'}</div>
    </section>
    <section class="card half" style="padding:24px 28px">
      <h2 style="font-size:24px">Cheapest protein</h2>
      <p class="muted" style="margin-top:6px;font-size:15px">What 100 g of protein costs from each food, using your standard prices.</p>
      <div style="margin-top:12px">${rank.map((r, i) => `<div class="brow"><div class="n">${esc(r.name)}</div><div class="b bar"><div style="width:${r.v / maxRank * 100}%;background:${i === 0 ? 'var(--brand)' : 'var(--bar)'}"></div></div><div class="a">${money(r.v)}</div></div>`).join('') || '<p class="muted">Add prices to see this.</p>'}</div>
      <p class="muted" style="margin-top:10px;font-size:14px">Shorter is cheaper. Foods without a price are left out.</p>
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
  $('#app').innerHTML = S.entries.length ? appView() : importView();
  document.title = (S.entries.length ? cap(S.tab) + ' | ' : '') + 'Meal cost calculator | Coach Leonidas';
}
function route() {
  const h = location.hash.replace('#', '');
  const t = ['day', 'prices', 'week'].includes(h) ? h : 'day';
  const changed = t !== S.tab;
  S.tab = t;
  S.error = '';
  render();
  if (changed) { window.scrollTo(0, 0); const h1 = $('#h1'); if (h1) h1.focus({ preventScroll: true }); }
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
function saveAll() { store.set('prices', S.prices); store.set('overrides', S.overrides); store.set('budget', S.budget); store.set('currency', S.currency); }

/* ============ import ============ */
function mergeEntries(list) {
  const dates = new Set(list.map(e => e.date));
  S.entries = S.entries.filter(e => !dates.has(e.date)).concat(list).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  reindex(); ensurePrices();
  store.set('entries', S.entries); saveAll();
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
function openOffer(date, name) {
  const dlg = $('#dlg');
  const dates = IDX.dates.slice().reverse();
  const foods = [...IDX.meta.keys()].sort((a, b) => a.localeCompare(b));
  date = date || S.day || dates[0]; name = name || foods[0];
  dlg.innerHTML = `<form id="oform" method="dialog">
    <h2 id="dlg-title" style="font-size:24px">Price for one day</h2>
    <p class="muted" style="font-size:15px">An offer replaces your standard price for that day only. Use it for a sale, a different shop or a bulk buy.</p>
    <div><label for="od">Day</label><select class="field" id="od">${dates.map(d => `<option value="${d}"${d === date ? ' selected' : ''}>${esc(dLong(d))}</option>`).join('')}</select></div>
    <div><label for="of">Food</label><select class="field" id="of">${foods.map(n => `<option${n === name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div><label for="op" id="oplabel">Price that day</label><div class="money-in wide"><span>${esc(currencySymbol())}</span><input id="op" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"></div><div class="sub" id="oinfo" style="margin-top:6px"></div></div>
    <div id="oerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" style="flex:1">Save offer</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div>
    <button type="button" class="btn link" id="odel" data-act="dlg-del" hidden>Remove this offer</button>
  </form>`;
  const refresh = () => {
    const d = $('#od').value, n = $('#of').value, p = S.prices[n];
    $('#oplabel').textContent = `Price that day, per ${basisText(p ? p.basis : 'kg', n)}`;
    const cur = S.overrides[d] && S.overrides[d][n];
    $('#op').value = cur != null ? cur : '';
    $('#odel').hidden = cur == null;
    $('#oinfo').textContent = p && p.price !== '' ? `Your usual price is ${money(Number(p.price))} per ${basisText(p.basis, n)}.` : 'You have not set a usual price for this food yet.';
  };
  $('#od').addEventListener('change', refresh); $('#of').addEventListener('change', refresh);
  $('#oform').addEventListener('submit', ev => {
    ev.preventDefault();
    const d = $('#od').value, n = $('#of').value, v = $('#op').value.trim().replace(',', '.');
    if (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) { $('#oerr').textContent = 'Enter a price, for example 4.50.'; $('#op').focus(); return; }
    (S.overrides[d] = S.overrides[d] || {})[n] = Number(v);
    saveAll(); dlg.close(); S.day = d; render(); toast('Offer saved');
  });
  refresh();
  if (!dlg.open) dlg.showModal();
  $('#op').focus();
}
function openBudget() {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form id="bform" method="dialog">
    <h2 id="dlg-title" style="font-size:24px">Daily budget</h2>
    <p class="muted" style="font-size:15px">Set what you want to spend on food each day. It shows on the Day and Week screens. Leave it empty to remove it.</p>
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv() {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Date', 'Meal', 'Food', 'Amount', `Cost (${S.currency})`, 'Offer', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)'].join(',')];
  for (const e of S.entries) {
    const c = costOf(e);
    rows.push([e.date, e.group, e.name, qtyFmt(e.qty) + ' ' + e.unit, c.cost == null ? '' : c.cost.toFixed(2), c.offer ? 'yes' : '', Math.round(e.kcal), e.pro.toFixed(1), e.carb.toFixed(1), e.fat.toFixed(1)].map(q).join(','));
  }
  download('meal-costs.csv', new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  toast('CSV downloaded');
}
function backup() {
  const data = { app: 'mealcost', version: 1, currency: S.currency, budget: S.budget, prices: S.prices, overrides: S.overrides };
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
    if (CURRENCIES.includes(d.currency)) S.currency = d.currency;
    if (d.budget > 0) S.budget = Number(d.budget);
    if (S.entries.length) ensurePrices();
    saveAll(); render(); toast('Backup restored');
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
  c.fillStyle = '#12614A'; c.fillRect(0, 0, W, H);
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
  c.fillStyle = '#12614A'; c.beginPath(); c.arc(tx + 52, ty + th / 2, 16, 0, Math.PI * 2); c.fill();
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
  switch (a) {
    case 'import': $('#file').click(); break;
    case 'sample': loadSample(); break;
    case 'pick-day': S.day = d.date; render(); break;
    case 'prev-day': { const i = IDX.dates.indexOf(S.day); if (i > 0) { S.day = IDX.dates[i - 1]; render(); } break; }
    case 'next-day': { const i = IDX.dates.indexOf(S.day); if (i < IDX.dates.length - 1) { S.day = IDX.dates[i + 1]; render(); } break; }
    case 'offer': openOffer(d.date, d.name); break;
    case 'del-offer': if (S.overrides[d.date]) { delete S.overrides[d.date][d.name]; if (!Object.keys(S.overrides[d.date]).length) delete S.overrides[d.date]; saveAll(); render(); toast('Offer removed'); } break;
    case 'dlg-del': { const dt = $('#od').value, n = $('#of').value; if (S.overrides[dt]) { delete S.overrides[dt][n]; if (!Object.keys(S.overrides[dt]).length) delete S.overrides[dt]; } saveAll(); $('#dlg').close(); render(); toast('Offer removed'); break; }
    case 'close-dlg': $('#dlg').close(); break;
    case 'budget': openBudget(); break;
    case 'goto-price': S.filter = d.name; S.chip = 'all'; go('prices'); break;
    case 'unpriced-link': S.chip = 'unpriced'; S.filter = ''; break;
    case 'chip': S.chip = d.chip; S.showAll = false; render(); break;
    case 'toggle-all': S.showAll = !S.showAll; refreshPriceBody(); break;
    case 'export-csv': exportCsv(); break;
    case 'backup': backup(); break;
    case 'restore': $('#pfile').click(); break;
    case 'reset':
      if (confirm('Delete all imported entries, prices and offers from this browser? This cannot be undone.')) {
        store.clear(); S.entries = []; S.prices = {}; S.overrides = {}; S.budget = null; S.day = null; S.filter = ''; S.chip = 'all'; reindex();
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
  $('.sl', tr).textContent = iss === 'noprice' ? 'Needs a price' : iss === 'needgpu' ? 'Needs grams per item' : `Logged ${m.n} ${m.n === 1 ? 'time' : 'times'}${m.countFirst ? ', as items' : ''}`;
  $('.sp', tr).innerHTML = sp.count ? esc(money(sp.total)) : '<span class="muted">Not counted</span>';
}

document.addEventListener('input', e => {
  const t = e.target;
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
  if (t.dataset && t.dataset.f === 'basis') { const tr = t.closest('tr'); S.prices[tr.dataset.name].basis = t.value; saveSoon(); refreshRow(tr); refreshMeta(); }
  else if (t.id === 'cur') { S.currency = t.value; saveAll(); render(); }
  else if (t.id === 'range') { S.range = Number(t.value); render(); }
  else if (t.id === 'daysel') { S.day = t.value; render(); }
  else if (t.id === 'file') { handleFile(t.files[0]); t.value = ''; }
  else if (t.id === 'pfile') { restore(t.files[0]); t.value = ''; }
});
window.addEventListener('dragover', e => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); });
window.addEventListener('dragleave', () => { const d = $('#drop'); if (d) d.classList.remove('over'); });
window.addEventListener('drop', e => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) handleFile(f); });
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', saveAll);

/* ============ start ============ */
reindex(); if (S.entries.length) ensurePrices();
route();
window.__mealcost = { S, parseCronometer, costOf, summarize, IDX: () => IDX };
