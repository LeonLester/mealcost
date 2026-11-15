/* Export everything the user has as one zip (JSON plus one spreadsheet per table), and read that zip back. Loaded before app.js. */
'use strict';

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = -1; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

// A zip with stored (uncompressed) entries. Every unzip tool opens it, and the files stay readable if anything goes wrong.
function zipStore(files) {
  const te = new TextEncoder(), now = new Date();
  const dt = ((now.getFullYear() - 1980) << 9 | (now.getMonth() + 1) << 5 | now.getDate()) & 0xFFFF, tm = (now.getHours() << 11 | now.getMinutes() << 5 | now.getSeconds() >> 1) & 0xFFFF;
  const parts = [], cds = []; let off = 0;
  for (const f of files) {
    const name = te.encode(f.name), data = typeof f.data === 'string' ? te.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true); cd.setUint16(12, tm, true); cd.setUint16(14, dt, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
    cds.push(cd.buffer, name);
    off += 30 + name.length + data.length;
  }
  const cdSize = cds.reduce((a, b) => a + (b.byteLength !== undefined ? b.byteLength : b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cds, end.buffer], { type: 'application/zip' });
}
// Read one file out of a zip: stored, or deflated by another tool.
async function zipRead(file, want) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65600); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return null;
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true), td = new TextDecoder();
  for (let k = 0; k < n && p + 46 <= buf.length && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nl)).replace(/^.*\//, '');
    if (name === want) {
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = buf.subarray(start, start + csize);
      if (method === 0) return td.decode(raw);
      if (method === 8) return await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      return null;
    }
    p += 46 + nl + xl + cl;
  }
  return null;
}

const csvQ = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
const csvOf = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(csvQ).join(',')).join('\r\n') + '\r\n';
const xnum = v => v === '' || v == null || !Number.isFinite(Number(v)) ? '' : String(Math.round(Number(v) * 1000) / 1000);

function exportData() {
  return {
    app: 'mealcost', version: 2, exported: new Date().toISOString(), currency: S.currency, budget: S.budget,
    entries: S.entries.map(({ src, ...r }) => ({ ...r, name: src !== undefined ? src : r.name })),
    prices: S.prices, overrides: S.overrides, merges: S.merges, nomerge: S.nomerge, ranges: S.ranges, recipes: S.recipes, meals: S.meals, foods: S.foods, cats: S.cats, pantry: S.pantry,
    goals: S.goals, plan: S.plan, weights: S.weights, wunit: S.wunit
  };
}
function exportFiles() {
  const cur = S.currency, d = exportData(), files = [];
  const add = (name, text) => files.push({ name, data: text });
  add('data.json', JSON.stringify(d, null, 2));
  add('diary.csv', csvOf(['Date', 'Meal', 'Food', 'Amount', 'Unit', `Cost (${cur})`, 'Offer', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)'], S.entries.map(e => {
    const c = costOf(e); return [e.date, e.group, e.src !== undefined ? e.src : e.name, xnum(e.qty), e.unit, c.cost == null ? '' : c.cost.toFixed(2), c.offer ? 'yes' : '', xnum(e.kcal), xnum(e.pro), xnum(e.carb), xnum(e.fat), xnum(e.fiber)];
  })));
  add('prices.csv', csvOf(['Food', 'Price', 'Per', 'Grams per item'], Object.entries(S.prices).map(([n, p]) => [n, p.price === '' ? '' : xnum(p.price), p.basis === 'kg' ? 'kg or litre' : p.basis === 'unit' ? 'item' : '100 g or 100 ml', p.gpu === '' ? '' : xnum(p.gpu)])));
  add('price-periods.csv', csvOf(['Food', 'From', 'To', 'Price'], S.ranges.map(r => [r.name, r.from, r.to || '', xnum(r.price)])));
  add('one-day-offers.csv', csvOf(['Date', 'Food', 'Price'], Object.entries(S.overrides).flatMap(([dt, o]) => Object.entries(o).map(([n, v]) => [dt, n, xnum(v)]))));
  add('foods.csv', csvOf(['Food', 'Per', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)'], Object.entries(S.foods).map(([n, f]) => [n, f.per === 'item' ? '1 item' : '100 g or 100 ml', xnum(f.kcal), xnum(f.pro), xnum(f.carb), xnum(f.fat), xnum(f.fiber)])));
  add('recipes.csv', csvOf(['Recipe', 'Servings', 'Yield (g)', 'Ingredient', 'Amount', 'Unit'], Object.entries(S.recipes).flatMap(([n, r]) => r.items.map(i => [n, r.servings, r.yieldG === '' ? '' : r.yieldG, i.name, xnum(i.qty), i.unit]))));
  add('meals.csv', csvOf(['Meal', 'Slot', 'Servings', 'Ingredient', 'Amount', 'Unit'], Object.entries(S.meals).flatMap(([n, m]) => m.items.map(i => [n, m.slot || '', m.servings, i.name, xnum(i.qty), i.unit]))));
  add('weights.csv', csvOf(['Date', 'Weight (kg)'], S.weights.map(w => [w.date, xnum(w.kg)])));
  add('pantry.csv', csvOf(['Food', 'Amount', 'Unit'], Object.entries(S.pantry).map(([n, v]) => [n, xnum(v.qty), v.unit])));
  const g = S.goals;
  add('goals.csv', csvOf(['Name', 'Value'], g ? [['kcal', g.kcal], ['protein_g', g.pro], ['carbs_g', g.carb], ['fat_g', g.fat], ['fiber_g', g.fiber]].concat(Object.entries(g.x || {}).map(([k, v]) => [k, v])) : []));
  add('README.txt', `Meal cost export, ${d.exported}\r\n\r\ndata.json holds everything in one file. Open Meal cost, go to Account and data, and restore this zip or data.json to bring it back.\r\nThe .csv files hold the same data, one table each, and open in any spreadsheet.\r\nAmounts use grams or millilitres, or items. Prices are in ${cur}.\r\n`);
  return files;
}
function exportAll() {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`meal-cost-export-${stamp}.zip`, zipStore(exportFiles()));
    toast('Export downloaded');
  } catch (e) { toast('Could not make the export.'); }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-act="export-all"]'); if (t) exportAll(); });
