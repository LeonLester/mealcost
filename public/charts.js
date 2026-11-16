/* Charts: a Cronometer-style chart library. Loaded after diary.js and before app.js's first render; uses app globals only when called. */
'use strict';

const CH_DEF = { id: 'energy', range: 30, from: '', to: '', days: 'all', trend: false, target: true, zoom: false, nut: 'pro', bio: 'Weight', ca: 'n:kcal', cb: 'w' };
let _chs = null;
function chs() {
  if (!_chs) { let s = null; try { s = store.get('chui', null); } catch (e) { s = null; } _chs = Object.assign({}, CH_DEF, s && typeof s === 'object' ? s : {}); }
  return _chs;
}
function chSave() { try { store.set('chui', chs()); } catch (e) { /* view mode or storage off */ } }
function chHidden() { try { const h = store.get('chhide', []); return Array.isArray(h) ? h : []; } catch (e) { return []; } }

const MIN_COMPLETE_KCAL = 800;
const CH_CHARTS = [
  ['energy', 'Energy consumed', 'Protein, carbs and fat as stacked energy, against your calorie goal'],
  ['nutrient', 'Single nutrient', 'Any nutrient you track, against its target'],
  ['score', 'Nutrition score', 'How close each day came to every target you have set'],
  ['electro', 'Electrolytes', 'Sodium, potassium, magnesium and calcium against their targets'],
  ['cost', 'Food cost', 'What each day of food cost'],
  ['biometric', 'Single biometric', 'Weight or any measurement you have imported or logged'],
  ['wbf', 'Weight and body fat', 'Both on one chart, two axes'],
  ['wwaist', 'Weight and waist', 'Both on one chart, two axes'],
  ['bphr', 'Blood pressure and heart rate', 'Systolic, diastolic and resting heart rate'],
  ['lipid', 'Lipid panel', 'Total, HDL and LDL cholesterol and triglycerides'],
  ['gki', 'Glucose Ketone Index', 'Glucose in mmol/L over ketones in mmol/L'],
  ['custom', 'Custom chart', 'Any two things on one chart, two axes']
];
const CH_UNAVAILABLE = ['Sleep stages', 'Continuous glucose monitor traces', 'Calcium absorption'];

/* ---------- data ---------- */
function chDays(st) {
  const today = todayIso();
  let from, to = today;
  if (st.range === 'all') {
    const ds = [...IDX.byDate.keys()].concat(S.weights.map(w => w.date), ...Object.values(S.bio).map(m => m.pts.map(q => q.date))).sort();
    from = ds.length ? ds[0] : isoAdd(today, -29);
  } else if (st.range === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(st.from) && /^\d{4}-\d{2}-\d{2}$/.test(st.to) && st.from <= st.to) { from = st.from; to = st.to; }
  else from = isoAdd(today, -(Number(st.range) > 0 ? Number(st.range) : 30) + 1);
  const out = []; for (let d = from; d <= to && out.length < 4000; d = isoAdd(d, 1)) out.push(d);
  return out;
}
function chDayVal(d, st, f) {
  const es = IDX.byDate.get(d), has = !!(es && es.length), today = todayIso();
  if (!has) return st.days === 'all' && d <= today ? { v: 0 } : null;
  const t = nutTotals(es);
  if (st.days === 'complete' && t.kcal < MIN_COMPLETE_KCAL) return null;
  return { v: f(t, es) };
}
const chNutVal = k => t => NUT_CORE.some(n => n.k === k) ? t[k] : (t.x[k] || 0);
const chNutMeta = k => NUT_CORE.find(n => n.k === k) || NUT_X.find(n => n.k === k);
function chNutPts(k, days, st) { const f = chNutVal(k), o = []; for (const d of days) { const r = chDayVal(d, st, f); if (r) o.push({ date: d, v: Math.round(r.v * 100) / 100 }); } return o; }
function chScore(t, ks) {
  const parts = [];
  for (const k of ks) {
    const g = goalFor(k); if (!(g > 0)) continue;
    const v = chNutVal(k)(t), m = chNutMeta(k), lim = m && m.kind === 'limit';
    parts.push(k === 'kcal' ? 1 - Math.min(1, Math.abs(v - g) / g) : lim ? (v <= g ? 1 : g / v) : Math.min(1, v / g));
  }
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100) : null;
}
function chScorePts(ks, days, st) { const o = []; for (const d of days) { const r = chDayVal(d, st, t => chScore(t, ks)); if (r && r.v != null) o.push({ date: d, v: r.v }); } return o; }
function chWeightPts(days) { const a = days[0], b = days[days.length - 1]; return S.weights.filter(w => w.date >= a && w.date <= b).map(w => ({ date: w.date, v: wShow(w.kg) })); }
const CH_BIO = {
  bf: /body\s*fat/i, waist: /waist/i, sys: /systolic/i, dia: /diastolic/i, hr: /heart\s*rate|pulse/i,
  tc: /total\s*chol|^cholesterol$/i, hdl: /hdl/i, ldl: /ldl/i, tg: /triglycer/i, glu: /glucose/i, ket: /ketone/i
};
function chBioName(id) { return Object.keys(S.bio).find(k => CH_BIO[id].test(k)) || null; }
// Convert a stored value to mmol/L when its unit says mg/dL; the factors are the standard ones for each substance.
const CH_MG = { glu: 18.016, tc: 38.67, hdl: 38.67, ldl: 38.67, tg: 88.57 };
function chBioPts(name, days, id) {
  const m = S.bio[name]; if (!m) return [];
  const a = days[0], b = days[days.length - 1], conv = id && CH_MG[id] && /mg\s*\/?\s*dl/i.test(m.unit) ? CH_MG[id] : 1;
  return m.pts.filter(q => q.date >= a && q.date <= b).map(q => ({ date: q.date, v: Math.round(q.v / conv * 100) / 100 }));
}
const chBioUnit = (name, id) => { const m = S.bio[name]; return m ? (id && CH_MG[id] && /mg\s*\/?\s*dl/i.test(m.unit) ? 'mmol/L' : m.unit) : ''; };

/* Everything a custom chart can plot. */
function chVars() {
  const v = [];
  for (const n of NUT_CORE) v.push({ id: 'n:' + n.k, label: n.n, unit: n.u, grp: 'Nutrition', nut: n.k });
  for (const n of NUT_X) v.push({ id: 'n:' + n.k, label: n.n, unit: n.u, grp: 'Nutrition', nut: n.k });
  v.push({ id: 'cost', label: 'Food cost', unit: S.currency || '', grp: 'Nutrition' });
  v.push({ id: 'score', label: 'Nutrition score', unit: '%', grp: 'Nutrition' });
  v.push({ id: 'w', label: 'Weight', unit: S.wunit, grp: 'Body' });
  for (const k of Object.keys(S.bio)) v.push({ id: 'b:' + k, label: k, unit: S.bio[k].unit, grp: 'Body' });
  return v;
}
function chVarPts(id, days, st) {
  if (id === 'w') return chWeightPts(days);
  if (id === 'cost') { const o = []; for (const d of days) { const r = chDayVal(d, st, (t, es) => summarize(es).cost || 0); if (r) o.push({ date: d, v: Math.round(r.v * 100) / 100 }); } return o; }
  if (id === 'score') return chScorePts(chAllTargets(), days, st);
  if (id.startsWith('n:')) return chNutPts(id.slice(2), days, st);
  if (id.startsWith('b:')) return chBioPts(id.slice(2), days, null);
  return [];
}
const chAllTargets = () => NUT_CORE.map(n => n.k).concat(NUT_X.map(n => n.k)).filter(k => goalFor(k) > 0);

/* ---------- chart definitions ---------- */
// A spec: { title, series: [{ label, unit, color, type: 'bar'|'line', axis: 0|1, stack, pts }], goal: { v, label, axis }, empty }
function chBuild(id, st, days) {
  const need = m => ({ empty: m });
  const line = (label, unit, color, pts, axis = 0, type = 'line') => ({ label, unit, color, type, axis, pts });
  if (id === 'energy') {
    const f = (k, m) => chNutPts(k, days, st).map(q => ({ date: q.date, v: Math.round(q.v * m) }));
    const g = goalFor('kcal');
    return { title: 'Energy consumed', series: [{ ...line('Protein', 'kcal', 'var(--m-pro)', f('pro', 4), 0, 'bar'), stack: 'e' }, { ...line('Carbs', 'kcal', 'var(--m-carb)', f('carb', 4), 0, 'bar'), stack: 'e' }, { ...line('Fat', 'kcal', 'var(--m-fat)', f('fat', 9), 0, 'bar'), stack: 'e' }], goal: g ? { v: g, label: 'Goal ' + n0(g) + ' kcal' } : null };
  }
  if (id === 'nutrient') {
    const k = chNutMeta(st.nut) ? st.nut : 'pro', m = chNutMeta(k), g = goalFor(k);
    return { title: m.n, series: [line(m.n, m.u, k === 'kcal' ? 'var(--m-kcal)' : k === 'pro' ? 'var(--m-pro)' : k === 'carb' ? 'var(--m-carb)' : k === 'fat' ? 'var(--m-fat)' : k === 'fiber' ? 'var(--m-fib)' : 'var(--m-lim)', chNutPts(k, days, st), 0, 'bar')], goal: g ? { v: g, label: (m.kind === 'limit' ? 'Limit ' : 'Target ') + n0(g) + ' ' + m.u } : null };
  }
  if (id === 'score') return { title: 'Nutrition score', series: [line('Score', '%', 'var(--m-carb)', chScorePts(chAllTargets(), days, st), 0, 'bar')], goal: { v: 100, label: '100' }, max: 100, note: 'Each target counts equally. A food without data for a nutrient counts as zero for it.' };
  if (id === 'electro') {
    const ks = ['sodium', 'potassium', 'magnesium', 'calcium'];
    return { title: 'Electrolytes score', series: [line('Score', '%', 'var(--m-pro)', chScorePts(ks, days, st), 0, 'bar')], goal: { v: 100, label: '100' }, max: 100, note: 'Sodium counts as a limit. Potassium, magnesium and calcium count as targets.' };
  }
  if (id === 'cost') return { title: 'Food cost', series: [line('Cost', S.currency || '', 'var(--m-cost)', chVarPts('cost', days, st), 0, 'bar')], goal: null };
  if (id === 'biometric') {
    const nm = st.bio === 'Weight' || S.bio[st.bio] ? st.bio : 'Weight';
    return nm === 'Weight' ? { title: 'Weight', series: [line('Weight', S.wunit, 'var(--m-pro)', chWeightPts(days))], goal: null } : { title: nm, series: [line(nm, S.bio[nm].unit, 'var(--m-pro)', chBioPts(nm, days, null))], goal: null };
  }
  const pair = (rid, label) => {
    const nm = chBioName(rid); if (!nm) return need(`Needs ${label} measurements. Import a biometrics file or log one.`);
    return { title: 'Weight and ' + label.toLowerCase(), series: [line('Weight', S.wunit, 'var(--m-pro)', chWeightPts(days)), line(nm, S.bio[nm].unit, 'var(--m-fat)', chBioPts(nm, days, null), 1)], goal: null };
  };
  if (id === 'wbf') return pair('bf', 'Body fat');
  if (id === 'wwaist') return pair('waist', 'Waist');
  if (id === 'bphr') {
    const s = chBioName('sys'), d = chBioName('dia'), h = chBioName('hr');
    if (!s && !d && !h) return need('Needs blood pressure or heart rate measurements. Import a biometrics file or log one.');
    const ser = []; if (s) ser.push(line(s, S.bio[s].unit, 'var(--m-pro)', chBioPts(s, days, null))); if (d) ser.push(line(d, S.bio[d].unit, 'var(--m-carb)', chBioPts(d, days, null))); if (h) ser.push(line(h, S.bio[h].unit, 'var(--m-fat)', chBioPts(h, days, null), 1));
    return { title: 'Blood pressure and heart rate', series: ser, goal: null };
  }
  if (id === 'lipid') {
    const defs = [['tc', 'var(--m-pro)'], ['hdl', 'var(--m-carb)'], ['ldl', 'var(--m-fat)'], ['tg', 'var(--m-kcal)']], ser = [];
    for (const [r, c] of defs) { const nm = chBioName(r); if (nm) ser.push(line(nm, chBioUnit(nm, r), c, chBioPts(nm, days, r))); }
    return ser.length ? { title: 'Lipid panel', series: ser, goal: null, note: 'Values in mg/dL are converted to mmol/L.' } : need('Needs cholesterol or triglyceride results. Import a biometrics file or log one.');
  }
  if (id === 'gki') {
    const g = chBioName('glu'), k = chBioName('ket'); if (!g || !k) return need('Needs both glucose and ketone measurements. Import a biometrics file or log them.');
    const gp = chBioPts(g, days, 'glu'), kp = chBioPts(k, days, null), km = new Map(kp.map(q => [q.date, q.v])), gk = [];
    for (const q of gp) { const kv = km.get(q.date); if (kv > 0) gk.push({ date: q.date, v: Math.round(q.v / kv * 10) / 10 }); }
    return { title: 'Glucose Ketone Index', series: [line('Glucose', 'mmol/L', 'var(--m-pro)', gp), line('Ketones', 'mmol/L', 'var(--m-carb)', kp), line('GKI', '', 'var(--m-fat)', gk, 1)], goal: null, note: 'GKI is glucose in mmol/L divided by ketones in mmol/L, on days with both.' };
  }
  if (id === 'custom') {
    const vs = chVars(), a = vs.find(x => x.id === st.ca) || vs[0], b = vs.find(x => x.id === st.cb);
    const ser = [line(a.label, a.unit, 'var(--m-pro)', chVarPts(a.id, days, st))]; if (b && b.id !== a.id) ser.push(line(b.label, b.unit, 'var(--m-fat)', chVarPts(b.id, days, st), 1));
    return { title: ser.map(s => s.label).join(' and '), series: ser, goal: null };
  }
  return need('Unknown chart.');
}

/* ---------- drawing ---------- */
function chCol(c, res) { return res && c.startsWith('var(') ? (res[c.slice(4, -1)] || '#888') : c; }
function chResolve() { const cs = getComputedStyle(document.documentElement), o = {}; for (const k of ['--m-kcal', '--m-pro', '--m-carb', '--m-fat', '--m-fib', '--m-lim', '--m-cost', '--ink', '--muted', '--line', '--card']) o[k] = cs.getPropertyValue(k).trim() || '#888'; return o; }
function chFmt(v) { const a = Math.abs(v); return new Intl.NumberFormat(undefined, { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 }).format(v); }
function chRoll(pts) {
  return pts.map((q, i) => { const lo = isoAdd(q.date, -6), w = pts.slice(0, i + 1).filter(p => p.date >= lo); return { date: q.date, v: w.reduce((a, p) => a + p.v, 0) / w.length }; });
}
function chSvg(spec, days, st, res) {
  const W = 760, H = 330, pl = 52, pt = 34, pb = 28, n = days.length, two = spec.series.some(s => s.axis === 1), pr = two ? 52 : 12;
  const bars = n <= 92, pw = W - pl - pr, bw = pw / n;
  const idx = new Map(days.map((d, i) => [d, i])), X = d => pl + (idx.get(d) + .5) / n * pw;
  const ink = res ? res['--ink'] : 'var(--ink)', mut = res ? res['--muted'] : 'var(--muted)', lin = res ? res['--line'] : 'var(--line)';
  const sc = [0, 1].map(a => {
    const ss = spec.series.filter(s => (s.axis || 0) === a); if (!ss.length) return null;
    const vals = [], stacks = new Map(); let allBar = true;
    for (const s of ss) {
      if (!(s.type === 'bar' && bars)) allBar = false;
      for (const q of s.pts) { if (s.stack && bars) stacks.set(q.date, (stacks.get(q.date) || 0) + q.v); else vals.push(q.v); }
    }
    vals.push(...stacks.values()); if (a === 0 && spec.goal && st.target) vals.push(spec.goal.v);
    if (!vals.length) return { lo: 0, hi: 1 };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (spec.max) hi = Math.max(hi, spec.max);
    if (allBar || (!st.zoom && lo > 0 && lo < hi * 3)) lo = Math.min(0, lo);
    if (st.zoom && !allBar) { const p = (hi - lo) * .08 || 1; lo -= p; hi += p; } else hi = hi * 1.08 || 1;
    if (hi <= lo) hi = lo + 1;
    return { lo, hi };
  });
  const Y = (a, v) => { const s = sc[a] || sc[0]; return pt + (H - pt - pb) * (1 - (v - s.lo) / (s.hi - s.lo)); };
  let g = '';
  const ticks = a => { const s = sc[a]; return [0, 1, 2, 3].map(i => s.lo + (s.hi - s.lo) * i / 3); };
  for (const v of ticks(0)) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0, v).toFixed(1)}" y2="${Y(0, v).toFixed(1)}" stroke="${lin}"/><text x="${pl - 6}" y="${(Y(0, v) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${mut}">${chFmt(v)}</text>`;
  if (two && sc[1]) for (const v of ticks(1)) g += `<text x="${W - pr + 6}" y="${(Y(1, v) + 4).toFixed(1)}" font-size="12" fill="${mut}">${chFmt(v)}</text>`;
  const step = Math.max(1, Math.ceil(n / 7));
  days.forEach((d, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${X(d).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" font-size="12" fill="${mut}">${esc(n > 120 ? dFmt(d, { month: 'short', year: '2-digit' }) : dDM(d))}</text>`; });
  if (spec.goal && st.target) { const y = Y(0, spec.goal.v); g += `<line x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${ink}" stroke-width="1" stroke-dasharray="4 4" opacity=".6"/><text x="${W - pr - 2}" y="${(y - 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${mut}">${esc(spec.goal.label)}</text>`; }
  g += `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="${lin}"/>`;
  // bars (stacked ones share a base per day)
  const base = new Map();
  for (const s of spec.series) {
    const c = chCol(s.color, res), a = s.axis || 0;
    if (s.type === 'bar' && bars) {
      for (const q of s.pts) {
        const b0 = s.stack ? (base.get(q.date) || 0) : 0, y1 = Y(a, b0 + q.v), y0 = Y(a, b0); if (s.stack) base.set(q.date, b0 + q.v);
        if (q.v <= 0 && !s.stack) continue;
        g += `<rect x="${(X(q.date) - Math.max(1, bw * .8) / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(1, bw * .8).toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${c}"><title>${esc(dMed(q.date))}: ${chFmt(q.v)} ${esc(s.unit)} ${esc(s.label)}</title></rect>`;
      }
    } else if (s.pts.length) {
      const pts = s.pts.map(q => `${X(q.date).toFixed(1)},${Y(a, q.v).toFixed(1)}`).join(' ');
      g += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
      if (s.pts.length <= 70) g += s.pts.map(q => `<circle cx="${X(q.date).toFixed(1)}" cy="${Y(a, q.v).toFixed(1)}" r="3.5" fill="${res ? res['--card'] : 'var(--card)'}" stroke="${c}" stroke-width="2"><title>${esc(dMed(q.date))}: ${chFmt(q.v)} ${esc(s.unit)} ${esc(s.label)}</title></circle>`).join('');
    }
  }
  if (st.trend) {
    const ss = spec.series.filter(s => !s.stack);
    for (const s of ss) { const tr = chRoll(s.pts); if (tr.length > 1) g += `<polyline points="${tr.map(q => `${X(q.date).toFixed(1)},${Y(s.axis || 0, q.v).toFixed(1)}`).join(' ')}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 4" opacity=".75"><title>7-day average of ${esc(s.label)}</title></polyline>`; }
  }
  let lx = pl; const leg = spec.series.map(s => { const x = lx; lx += 24 + s.label.length * 7 + (s.axis ? 34 : 0); return `<rect x="${x}" y="9" width="12" height="12" rx="2" fill="${chCol(s.color, res)}"/><text x="${x + 17}" y="20" font-size="13" fill="${ink}">${esc(s.label)}${s.axis ? ' (right axis)' : ''}</text>`; }).join('') + (st.trend ? `<line x1="${lx}" x2="${lx + 18}" y1="15" y2="15" stroke="${ink}" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx + 23}" y="20" font-size="13" fill="${ink}">7-day average</text>` : '');
  const sum = spec.series.map(s => s.pts.length ? `${s.label}: ${s.pts.length} points, latest ${chFmt(s.pts[s.pts.length - 1].v)} ${s.unit}` : `${s.label}: no data`).join('. ');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="chart-svg" viewBox="0 0 ${W} ${H}" width="${res ? W : '100%'}" ${res ? `height="${H}"` : ''} role="img" aria-label="${esc(spec.title + '. ' + sum)}" font-family="system-ui,sans-serif">${res ? `<rect width="${W}" height="${H}" fill="${res['--card']}"/>` : ''}${leg}${g}</svg>`;
}

/* ---------- view ---------- */
function chartsView() {
  const st = chs(), hidden = chHidden(), vis = CH_CHARTS.filter(c => !hidden.includes(c[0]));
  if (!vis.length) return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Charts</h1><button class="btn" data-act="ch-manage">Manage charts</button></div><div class="card pad" style="margin-top:18px;max-width:560px"><p>Every chart is hidden. Use Manage charts to show some.</p></div>`;
  const cur = vis.find(c => c[0] === st.id) || vis[0], days = chDays(st), spec = chBuild(cur[0], st, days);
  const dayRange = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, 'Year'], ['all', 'All'], ['custom', 'Custom']];
  const seg = (act, items, sel, label) => `<div class="seg" role="group" aria-label="${label}">${items.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${String(v) === String(sel)}">${l}</button>`).join('')}</div>`;
  const opt = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  let picker = '';
  if (cur[0] === 'nutrient') picker = `<label class="ch-pick">Nutrient <select class="field" id="ch-nut">${[['Core', NUT_CORE], ['Vitamins, minerals and limits', NUT_X]].map(([g, a]) => `<optgroup label="${g}">${opt(a.map(n => [n.k, n.n + ' (' + n.u + ')']), st.nut)}</optgroup>`).join('')}</select></label>`;
  if (cur[0] === 'biometric') picker = `<label class="ch-pick">Measurement <select class="field" id="ch-bio">${opt([['Weight', 'Weight']].concat(Object.keys(S.bio).map(k => [k, k])), st.bio)}</select></label>`;
  if (cur[0] === 'custom') { const vs = chVars(), grp = sel => [...new Set(vs.map(v => v.grp))].map(g => `<optgroup label="${g}">${opt(vs.filter(v => v.grp === g).map(v => [v.id, v.label + (v.unit ? ' (' + v.unit + ')' : '')]), sel)}</optgroup>`).join(''); picker = `<label class="ch-pick">Left axis <select class="field" id="ch-ca">${grp(st.ca)}</select></label><label class="ch-pick">Right axis <select class="field" id="ch-cb"><option value="">None</option>${grp(st.cb)}</select></label>`; }
  const tg = (k, on, l) => `<button class="btn sm" data-act="ch-toggle" data-k="${k}" aria-pressed="${!!on}">${l}</button>`;
  const body = spec.empty ? `<div class="card pad" style="margin-top:14px;max-width:560px"><p class="muted">${esc(spec.empty)}</p><button class="btn" style="margin-top:12px" data-act="ch-log">Log a measurement</button></div>`
    : spec.series.every(s => !s.pts.length) ? `<div class="card pad" style="margin-top:14px;max-width:560px"><p class="muted">No data in this period. Try a longer range${st.days !== 'all' ? ' or include all days' : ''}.</p></div>`
    : `<section class="card dz-sum ch-card" id="ch-print"><h2 style="font-size:17px">${esc(spec.title)}</h2>${chSvg(spec, days, st, null)}${spec.note ? `<p class="muted dz-small">${esc(spec.note)}</p>` : ''}<p class="muted dz-small">${esc(dMed(days[0]))} to ${esc(dMed(days[days.length - 1]))}, ${days.length} days. ${days.length > 92 ? 'Long ranges draw lines.' : ''}</p></section>`;
  return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Charts</h1><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="ch-log">Log a measurement</button><button class="btn" data-act="ch-manage">Manage charts</button></div></div>
  <div class="ch-tabs" role="group" aria-label="Chart">${vis.map(c => `<button class="btn sm" data-act="ch-pick" data-id="${c[0]}" aria-pressed="${c[0] === cur[0]}" title="${esc(c[2])}">${esc(c[1])}</button>`).join('')}</div>
  <div class="ch-controls">${seg('ch-range', dayRange, st.range, 'Timeframe')}${seg('ch-days', [['all', 'All days'], ['logged', 'Logged days'], ['complete', 'Completed days']], st.days, 'Days to include')}</div>
  ${st.range === 'custom' ? `<div class="ch-controls"><label class="ch-pick">From <input class="field" type="date" id="ch-from" value="${esc(st.from)}"></label><label class="ch-pick">To <input class="field" type="date" id="ch-to" value="${esc(st.to)}"></label></div>` : ''}
  <div class="ch-controls">${picker}${tg('trend', st.trend, 'Show trend')}${spec.goal || ['energy', 'nutrient'].includes(cur[0]) ? tg('target', st.target, 'Show target') : ''}${tg('zoom', st.zoom, 'Zoom to fit')}<button class="btn sm" data-act="ch-svg"${spec.empty ? ' disabled' : ''}>Download image</button><button class="btn sm" data-act="ch-csv"${spec.empty ? ' disabled' : ''}>Download data</button><button class="btn sm" data-act="ch-print">Print</button></div>
  ${body}<p class="muted dz-small" style="margin-top:10px">Completed days have at least ${MIN_COMPLETE_KCAL} kcal logged.</p>`;
}

/* ---------- actions ---------- */
function chartsAct(a, d) {
  const st = chs();
  switch (a) {
    case 'ch-pick': st.id = d.id; chSave(); render(); return true;
    case 'ch-range': st.range = /^\d+$/.test(d.v) ? Number(d.v) : d.v; if (st.range === 'custom' && !st.from) { st.to = todayIso(); st.from = isoAdd(st.to, -29); } chSave(); render(); return true;
    case 'ch-days': st.days = d.v; chSave(); render(); return true;
    case 'ch-toggle': st[d.k] = !st[d.k]; chSave(); render(); return true;
    case 'ch-manage': openChartManage(); return true;
    case 'ch-log': openMeasure(); return true;
    case 'ch-svg': { const days = chDays(st), cur = CH_CHARTS.find(c => c[0] === st.id) || CH_CHARTS[0], sp = chBuild(cur[0], st, days); if (sp.empty) return true; download(`chart-${cur[0]}.svg`, new Blob([chSvg(sp, days, st, chResolve())], { type: 'image/svg+xml' })); return true; }
    case 'ch-csv': {
      const days = chDays(st), cur = CH_CHARTS.find(c => c[0] === st.id) || CH_CHARTS[0], sp = chBuild(cur[0], st, days); if (sp.empty) return true;
      const maps = sp.series.map(s => new Map(s.pts.map(q => [q.date, q.v]))), q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      const rows = [['Date'].concat(sp.series.map(s => s.label + (s.unit ? ' (' + s.unit + ')' : ''))).map(q).join(',')];
      for (const day of days) if (maps.some(m => m.has(day))) rows.push([day].concat(maps.map(m => m.has(day) ? String(m.get(day)) : '')).join(','));
      download(`chart-${cur[0]}.csv`, new Blob([rows.join('\n') + '\n'], { type: 'text/csv' })); return true;
    }
    case 'ch-print': window.print(); return true;
    case 'ch-bio-rm': { const k = d.name; if (S.bio[k]) { delete S.bio[k]; saveAll(); openChartManage(); render(); toast('Removed ' + k); } return true; }
  }
  return false;
}
document.addEventListener('change', e => {
  const t = e.target; if (!t) return;
  const st = chs(), m = { 'ch-nut': 'nut', 'ch-bio': 'bio', 'ch-ca': 'ca', 'ch-cb': 'cb', 'ch-from': 'from', 'ch-to': 'to' }[t.id];
  if (m && t.id) { st[m] = t.value; chSave(); render(); return; }
  if (t.dataset && t.dataset.chid) {
    const h = new Set(chHidden()); if (t.checked) h.delete(t.dataset.chid); else h.add(t.dataset.chid);
    try { store.set('chhide', [...h]); } catch (er) { /* ignore */ }
    render();
  }
});

function openChartManage() {
  const dlg = $('#dlg'), hid = chHidden(); dlg.classList.remove('wide');
  const bio = Object.entries(S.bio);
  dlg.innerHTML = `<div><h2 id="dlg-title" style="font-size:20px">Manage charts</h2><p class="muted" style="font-size:14px">Choose which charts show in the Charts tab. This is saved on this device.</p>
    <div style="margin-top:10px">${CH_CHARTS.map(c => `<label class="ch-row"><input type="checkbox" data-chid="${c[0]}"${hid.includes(c[0]) ? '' : ' checked'}><span><b>${esc(c[1])}</b><small class="muted"> ${esc(c[2])}</small></span></label>`).join('')}</div>
    <p class="muted dz-small" style="margin-top:10px">Not available: ${CH_UNAVAILABLE.join(', ')}. They need device or lab data this app does not read.</p>
    ${bio.length ? `<h3 class="dz-gh" style="margin-top:14px">Saved measurements</h3>${bio.map(([k, m]) => `<div class="wrow"><span>${esc(k)}${m.unit ? ' (' + esc(m.unit) + ')' : ''}</span><b>${m.pts.length}</b><button class="btn link" data-act="ch-bio-rm" data-name="${esc(k)}" aria-label="Remove all ${esc(k)} measurements">Remove</button></div>`).join('')}` : ''}
    <div class="dlg-actions" style="margin-top:14px"><button type="button" class="btn primary" data-act="close-dlg">Done</button></div></div>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); if (!dlg.open) dlg.showModal();
}

const CH_COMMON = [['Body Fat', '%'], ['Waist', 'cm'], ['Systolic', 'mmHg'], ['Diastolic', 'mmHg'], ['Heart Rate', 'bpm'], ['Total Cholesterol', 'mmol/L'], ['HDL Cholesterol', 'mmol/L'], ['LDL Cholesterol', 'mmol/L'], ['Triglycerides', 'mmol/L'], ['Glucose', 'mmol/L'], ['Ketones', 'mmol/L']];
function openMeasure() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const names = [...new Set(CH_COMMON.map(c => c[0]).concat(Object.keys(S.bio)))];
  dlg.innerHTML = `<form id="bmform" method="dialog" novalidate><h2 id="dlg-title" style="font-size:20px">Log a measurement</h2>
    <div class="gl-f" style="margin-top:10px"><label for="bmn">Measurement</label><input class="field" id="bmn" list="bmnl" autocomplete="off" maxlength="40" placeholder="for example Body Fat"><datalist id="bmnl">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="gl-f" style="margin-top:10px"><label for="bmv">Value</label><input class="field" id="bmv" inputmode="decimal" autocomplete="off"></div>
    <div class="gl-f" style="margin-top:10px"><label for="bmu">Unit</label><input class="field" id="bmu" autocomplete="off" maxlength="12" placeholder="for example %"></div>
    <div class="gl-f" style="margin-top:10px"><label for="bmd">Day</label><input class="field" type="date" id="bmd" value="${esc(S.day || todayIso())}"></div>
    <p class="muted dz-small" style="margin-top:6px">Weight has its own Log weight button.</p>
    <div id="bmerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Save</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); if (!dlg.open) dlg.showModal(); $('#bmn').focus();
}
document.addEventListener('input', e => {
  if (e.target.id !== 'bmn') return;
  const k = e.target.value.trim().toLowerCase(), c = CH_COMMON.find(x => x[0].toLowerCase() === k), ex = Object.keys(S.bio).find(x => x.toLowerCase() === k), u = $('#bmu');
  if (u && !u.value) u.value = ex ? S.bio[ex].unit : c ? c[1] : '';
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'bmform') return;
  e.preventDefault();
  const err = m => { $('#bmerr').textContent = m; }, nm = $('#bmn').value.trim().replace(/\s+/g, ' ').slice(0, 40), date = $('#bmd').value, v = parseFloat($('#bmv').value.replace(',', '.'));
  if (!nm) return err('Enter what you measured.');
  if (/^weight$/i.test(nm)) return err('Use Log weight for weight.');
  if (!Number.isFinite(v) || Math.abs(v) >= 1e6) return err('Enter a number.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Choose a day.');
  if (!S.bio[nm] && Object.keys(S.bio).length >= 40) return err('You can keep up to 40 different measurements.');
  const key = Object.keys(S.bio).find(k => k.toLowerCase() === nm.toLowerCase()) || nm, m = S.bio[key] || (S.bio[key] = { unit: '', pts: [] });
  if (!m.unit) m.unit = $('#bmu').value.trim().replace(/[^\w%/.° -]/g, '').slice(0, 12);
  m.pts = m.pts.filter(q => q.date !== date).concat({ date, v }).sort((a, c) => a.date < c.date ? -1 : 1);
  saveAll(); $('#dlg').close(); render(); toast('Measurement saved');
});
