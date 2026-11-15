/* Nutrition model: extra nutrients, goals, energy needs. Loaded before app.js; uses app globals only when called. */
'use strict';

// Nutrients beyond kcal, protein, carbs, fat and fiber. A Cronometer export carries them; foods you add by hand do not.
// kind 'limit' means stay under it, 'target' means reach it. Defaults are common adult references and can be changed in Goals.
const NUT_X = [
  { k: 'sugar', n: 'Sugars', u: 'g', col: 'sugars (g)', kind: 'limit', def: 50, grp: 'Carbs and fats' },
  { k: 'satfat', n: 'Saturated fat', u: 'g', col: 'saturated (g)', kind: 'limit', def: 20, grp: 'Carbs and fats' },
  { k: 'omega3', n: 'Omega-3', u: 'g', col: 'omega-3 (g)', kind: 'target', def: 1.6, grp: 'Carbs and fats' },
  { k: 'chol', n: 'Cholesterol', u: 'mg', col: 'cholesterol (mg)', kind: 'limit', def: 300, grp: 'Carbs and fats' },
  { k: 'sodium', n: 'Sodium', u: 'mg', col: 'sodium (mg)', kind: 'limit', def: 2300, grp: 'Minerals' },
  { k: 'potassium', n: 'Potassium', u: 'mg', col: 'potassium (mg)', kind: 'target', def: 3400, grp: 'Minerals' },
  { k: 'calcium', n: 'Calcium', u: 'mg', col: 'calcium (mg)', kind: 'target', def: 1000, grp: 'Minerals' },
  { k: 'magnesium', n: 'Magnesium', u: 'mg', col: 'magnesium (mg)', kind: 'target', def: 400, grp: 'Minerals' },
  { k: 'iron', n: 'Iron', u: 'mg', col: 'iron (mg)', kind: 'target', def: 8, grp: 'Minerals' },
  { k: 'zinc', n: 'Zinc', u: 'mg', col: 'zinc (mg)', kind: 'target', def: 11, grp: 'Minerals' },
  { k: 'vitA', n: 'Vitamin A', u: 'µg', col: 'vitamin a (µg)', kind: 'target', def: 900, grp: 'Vitamins' },
  { k: 'vitC', n: 'Vitamin C', u: 'mg', col: 'vitamin c (mg)', kind: 'target', def: 90, grp: 'Vitamins' },
  { k: 'vitD', n: 'Vitamin D', u: 'IU', col: 'vitamin d (iu)', kind: 'target', def: 600, grp: 'Vitamins' },
  { k: 'vitK', n: 'Vitamin K', u: 'µg', col: 'vitamin k (µg)', kind: 'target', def: 120, grp: 'Vitamins' },
  { k: 'folate', n: 'Folate', u: 'µg', col: 'folate (µg)', kind: 'target', def: 400, grp: 'Vitamins' },
  { k: 'b12', n: 'Vitamin B12', u: 'µg', col: 'b12 (cobalamin) (µg)', kind: 'target', def: 2.4, grp: 'Vitamins' }
];

// The five nutrients every food has. Energy from protein and carbs is 4 kcal per gram, fat is 9.
const NUT_CORE = [
  { k: 'kcal', n: 'Energy', u: 'kcal', f: 'kcal' },
  { k: 'pro', n: 'Protein', u: 'g', f: 'pro' },
  { k: 'carb', n: 'Carbs', u: 'g', f: 'carb' },
  { k: 'fat', n: 'Fat', u: 'g', f: 'fat' },
  { k: 'fiber', n: 'Fiber', u: 'g', f: 'fiber' }
];

// Sum a list of diary entries into one nutrient total.
function nutTotals(es) {
  const t = { kcal: 0, pro: 0, carb: 0, fat: 0, fiber: 0, x: {} };
  for (const e of es) {
    t.kcal += e.kcal || 0; t.pro += e.pro || 0; t.carb += e.carb || 0; t.fat += e.fat || 0; t.fiber += e.fiber || 0;
    if (e.x) for (const k in e.x) t.x[k] = (t.x[k] || 0) + e.x[k];
  }
  return t;
}

// Per-quantity extra-nutrient rates -> an amount for a logged quantity.
function scaleX(rate, q) {
  if (!rate) return undefined;
  const o = {};
  for (const k in rate) { const v = Math.round(rate[k] * q * 100) / 100; if (v > 0) o[k] = v; }
  return Object.keys(o).length ? o : undefined;
}
function addX(a, b, m) { const o = Object.assign({}, a); for (const k in b) o[k] = (o[k] || 0) + b[k] * m; return o; }

// Daily goals. Grams for protein, carbs, fat and fiber; extra nutrients fall back to the defaults above.
function defaultGoals() { return { kcal: 2200, pro: 150, carb: 240, fat: 70, fiber: 30, x: {}, profile: null }; }
function goalFor(k) {
  const g = S.goals;
  if (!g) return null;
  if (k in g && NUT_CORE.some(n => n.k === k)) return Number(g[k]) > 0 ? Number(g[k]) : null;
  const def = NUT_X.find(n => n.k === k);
  return g.x && Number(g.x[k]) > 0 ? Number(g.x[k]) : def ? def.def : null;
}

// Mifflin-St Jeor resting energy, a standard activity factor, and a goal adjustment.
const ACTIVITY = [
  ['1.2', 'Sedentary', 'Desk job, little exercise'],
  ['1.375', 'Light', 'Exercise 1 to 3 days a week'],
  ['1.55', 'Moderate', 'Exercise 3 to 5 days a week'],
  ['1.725', 'Active', 'Hard exercise 6 to 7 days a week'],
  ['1.9', 'Very active', 'Physical job and daily training']
];
const GOAL_KIND = [
  ['lose', 'Lose weight', -0.2, 2.2], ['maintain', 'Maintain', 0, 1.8], ['gain', 'Build muscle', 0.1, 2.0]
];
function energyPlan(p) {
  const kg = Number(p.kg), cm = Number(p.cm), age = Number(p.age);
  if (!(kg > 0 && cm > 0 && age > 0)) return null;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === 'f' ? -161 : 5);
  const tdee = bmr * Number(p.act || 1.375);
  const g = GOAL_KIND.find(x => x[0] === p.goal) || GOAL_KIND[1];
  const kcal = Math.round(tdee * (1 + g[2]) / 10) * 10;
  const pro = Math.round(kg * g[3] / 5) * 5;
  const fat = Math.round(kcal * 0.28 / 9 / 5) * 5;
  const carb = Math.max(0, Math.round((kcal - pro * 4 - fat * 9) / 4 / 5) * 5);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, pro, carb, fat, fiber: Math.round(kcal / 1000 * 14) };
}

// Course correction from the last 7, 14 or 28 days, using the rule of thumb that 1 kg of body weight is 7,500 kcal.
// Burn = average intake minus the balance the weight trend shows. The suggestion is burn plus the balance your target rate needs.
// It only advises. Nothing is changed unless the user applies it. Longer windows smooth out water weight but react more slowly.
const KCAL_PER_KG = 7500;
const CC_NEED = { 7: [5, 3, 4], 14: [10, 4, 8], 28: [20, 6, 15] }; // logged days, weigh-ins, days between first and last weigh-in
function courseCorrection(byDate, weights, endIso, rateKgWk, currentKcal, days = 7, opts = {}) {
  if (!endIso) return null;
  days = CC_NEED[days] ? days : 7;
  const need = CC_NEED[days], start = isoAdd(endIso, -(days - 1)), kc = [];
  for (let i = 0; i < days; i++) { const es = byDate.get(isoAdd(start, i)); if (!es || !es.length) continue; const k = es.reduce((a, e) => a + (e.kcal || 0), 0); if (k >= 800) kc.push(k); }
  const ws = (weights || []).filter(w => w.date >= start && w.date <= endIso && Number(w.kg) > 0);
  const out = { days, logged: kc.length, weighIns: ws.length, ok: false, why: '' };
  if (kc.length < need[0]) { out.why = `Log at least ${need[0]} of the last ${days} days of food.`; return out; }
  const span = ws.length ? (dObj(ws[ws.length - 1].date) - dObj(ws[0].date)) / 864e5 : 0;
  if (ws.length < need[1] || span < need[2]) { out.why = `Weigh in at least ${need[1]} times, over ${need[2]} or more days, in the last ${days} days.`; return out; }
  const xs = ws.map(w => (dObj(w.date) - dObj(ws[0].date)) / 864e5), ys = ws.map(w => Number(w.kg)), n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const kgDay = sxx > 0 ? sxy / sxx : 0, intake = kc.reduce((a, b) => a + b, 0) / kc.length;
  const maint = intake - Math.max(-2000, Math.min(2000, kgDay * KCAL_PER_KG));
  if (!(maint >= 1000 && maint <= 6000)) { out.why = 'The numbers do not give a sensible result. Check that your logs and weigh-ins are complete.'; return out; }
  let rate = Number.isFinite(Number(rateKgWk)) ? Number(rateKgWk) : 0;
  const notes = [], bw = Number(opts.bw) > 0 ? Number(opts.bw) : ys[ys.length - 1];
  // Guardrails taken from RP's published rules: loss is capped at 1% of body weight a week, and loss advice stops below BMI 17.
  let capped = false, bmiBlock = false;
  if (rate < -MAX_LOSS_PCT * bw / 100) { rate = -Math.round(MAX_LOSS_PCT * bw) / 100; capped = true; notes.push(`The wanted loss was above ${MAX_LOSS_PCT}% of body weight a week, which is the safe cap. The advice uses ${Math.abs(rate)} kg a week.`); }
  if (rate < 0 && Number(opts.cm) > 0 && bw / ((Number(opts.cm) / 100) ** 2) < MIN_BMI) { rate = 0; bmiBlock = true; notes.push(`Your BMI is below ${MIN_BMI}, so there is no advice to lose weight. The numbers below aim to hold your weight.`); }
  let aim = Math.round((maint + rate * KCAL_PER_KG / 7) / 10) * 10, macros = null, floorHit = false;
  const meals = Math.min(6, Math.max(4, Math.round(Number(opts.meals)) || 4));
  if (opts.macros && Number(opts.macros.kcal) > 0) {
    macros = macroPlan(aim, opts.macros, meals); floorHit = macros.floorHit;
    if (floorHit) { aim = Math.round(macros.kcal / 10) * 10; notes.push(`Fat and carbs cannot go lower without breaking the minimums (fat at least 15% of calories, and at least 5 g of fat and 5 g of carbs in each of ${meals} meals). Calories stay at ${aim}. Raise your intake or add activity before cutting further.`); }
  }
  const base = Number(currentKcal) > 0 ? Number(currentKcal) : Math.round(intake / 10) * 10, delta = Math.round((aim - base) / 10) * 10;
  return { ...out, ok: true, intake: Math.round(intake), maint: Math.round(maint), observed: Math.round(kgDay * 7 * 100) / 100, rate, aim, base, delta, onTrack: Math.abs(delta) < 75, perDay: Math.round(rate * KCAL_PER_KG / 7), macros, floorHit, capped, bmiBlock, notes };
}
const MAX_LOSS_PCT = 1, MIN_BMI = 17;

// Move a calorie target to a new level the way RP describes it: protein is never touched, the change is shared between carbs and fat
// in proportion to what they supply now, fat stays at or above 15% of calories, and every meal keeps at least 5 g of fat and 5 g of carbs.
function macroPlan(aim, cur, meals = 4) {
  const pro = Math.round(cur.pro), fatMin = Math.max(Math.ceil(0.15 * aim / 9), 5 * meals), carbMin = 5 * meals;
  const cK = Math.max(0, cur.carb) * 4, fK = Math.max(0, cur.fat) * 9, tot = cK + fK || 1, need = aim - pro * 4;
  let fat = Math.round(Math.max(0, need * fK / tot) / 9), carb = Math.round(Math.max(0, need * cK / tot) / 4), floorHit = false;
  if (fat < fatMin) { fat = fatMin; carb = Math.round((aim - pro * 4 - fat * 9) / 4); }
  if (carb < carbMin) { carb = carbMin; fat = Math.max(fatMin, Math.round((aim - pro * 4 - carb * 4) / 9)); floorHit = true; }
  const kcal = pro * 4 + carb * 4 + fat * 9;
  return { kcal: Math.round(kcal), pro, carb, fat, floorHit: floorHit && kcal > aim + 20 };
}

// Suggested weekly loss as a share of body weight, from RP's analysis of 10,000 diets: about 0.7% for a 6 week diet down to 0.5% for 12 weeks or more.
function suggestPct(weeks) { const w = Math.min(12, Math.max(6, Number(weeks) || 8)); return Math.round((0.7 - (w - 6) * (0.2 / 6)) * 100) / 100; }
const MAX_PHASE_WEEKS = 16;
// Phases: fat loss and muscle gain run at most 16 weeks. After a fat loss, maintenance must last at least two thirds as long before the next one.
function phaseWarnings(next, prev) {
  const w = [];
  if (next.phase !== 'maintain' && next.weeks > MAX_PHASE_WEEKS) w.push(`Fat loss and muscle gain phases should not run longer than ${MAX_PHASE_WEEKS} weeks.`);
  if (next.phase === 'cut' && prev && prev.phase === 'cut' && prev.end) {
    const gap = (dObj(next.start) - dObj(prev.end)) / 864e5, need = Math.ceil(prev.weeks * 7 * 2 / 3);
    if (gap < need) w.push(`Two fat loss phases need maintenance in between, at least two thirds as long as the first (${Math.ceil(need / 7)} weeks for a ${prev.weeks} week diet). There are ${Math.max(0, Math.floor(gap / 7))} weeks between them.`);
  }
  return w;
}

// Split the day over 4 to 6 meals, spaced from waking. Protein is even. Carbs are weighted toward the meals just before and after training and fat is
// kept low in those two. The last meal is the largest. Every meal keeps at least 5 g of fat and 5 g of carbs, and totals match the daily target.
// The spacing and weights are a plain reading of RP's published principles. RP does not publish its exact split.
function mealSplit(t, n = 4, wake = '07:00', train = '') {
  n = Math.min(6, Math.max(4, Math.round(n) || 4));
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const w0 = hm(wake) ?? 420, tr = hm(train), span = 14 * 60, times = [];
  for (let i = 0; i < n; i++) times.push(Math.round((w0 + span * i / (n - 1)) / 5) * 5);
  let pre = -1, post = -1;
  if (tr != null) {
    const t0 = ((tr - w0) % 1440 + 1440) % 1440 + w0;
    let bp = 1e9, bq = 1e9;
    times.forEach((m, i) => { const before = t0 - m, after = m - (t0 + 60); if (before >= 0 && before < bp) { bp = before; pre = i; } if (after >= 0 && after < bq) { bq = after; post = i; } });
    if (pre === post) post = -1;
  }
  const wC = times.map((_, i) => (i === pre || i === post ? 1.6 : 1) * (i === n - 1 ? 1.25 : 1));
  const wF = times.map((_, i) => (i === pre || i === post ? 0.5 : 1) * (i === n - 1 ? 1.25 : 1));
  const part = (total, wts, min) => {
    const sw = wts.reduce((a, b) => a + b, 0), raw = wts.map(x => total * x / sw);
    const out = raw.map(x => Math.max(min, Math.round(x)));
    let diff = Math.round(total) - out.reduce((a, b) => a + b, 0);
    const big = out.indexOf(Math.max(...out)); out[big] = Math.max(min, out[big] + diff);
    return out;
  };
  const pro = part(t.pro, times.map((_, i) => i === n - 1 ? 1.15 : 1), 0), carb = part(t.carb, wC, 5), fat = part(t.fat, wF, 5);
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return times.map((m, i) => ({ time: fmt(m), pro: pro[i], carb: carb[i], fat: fat[i], kcal: pro[i] * 4 + carb[i] * 4 + fat[i] * 9, tag: i === pre ? 'before training' : i === post ? 'after training' : i === n - 1 ? 'largest meal' : '' }));
}


// A weight plan: where you want to be, and when. Stored in kg. rate is kg a week, minus to lose. goalKg is optional and stops the line.
function cleanPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const kg = Number(p.kg), rate = Number(p.rate), goal = Number(p.goalKg), weeks = Math.round(Number(p.weeks));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.start)) || !(kg >= 20 && kg <= 400) || !Number.isFinite(rate) || Math.abs(rate) > 2) return null;
  const phase = ['cut', 'maintain', 'gain'].includes(p.phase) ? p.phase : rate < 0 ? 'cut' : rate > 0 ? 'gain' : 'maintain';
  const out = { start: p.start, kg, rate, goalKg: goal >= 20 && goal <= 400 ? goal : null, phase, weeks: weeks >= 1 && weeks <= 104 ? weeks : null };
  const pv = p.prev;
  if (pv && typeof pv === 'object' && ['cut', 'maintain', 'gain'].includes(pv.phase) && /^\d{4}-\d{2}-\d{2}$/.test(String(pv.end)) && Number(pv.weeks) >= 1) out.prev = { phase: pv.phase, weeks: Math.round(Number(pv.weeks)), end: pv.end };
  return out;
}
// The date the phase ends, from its length, or null.
function planFinish(plan) { return plan && plan.weeks ? isoAdd(plan.start, plan.weeks * 7) : null; }
// Planned weight on a date: a straight line from the start at the wanted rate. It holds at the goal weight once reached and at the end of the phase.
function planKg(plan, iso) {
  if (!plan || iso < plan.start) return null;
  let days = (dObj(iso) - dObj(plan.start)) / 864e5;
  if (plan.weeks) days = Math.min(days, plan.weeks * 7);
  let v = plan.kg + plan.rate * days / 7;
  if (plan.goalKg != null && plan.rate !== 0 && ((plan.rate < 0 && v < plan.goalKg) || (plan.rate > 0 && v > plan.goalKg))) v = plan.goalKg;
  return v;
}
// The date the plan reaches its goal weight, or null.
function planEnd(plan) {
  if (!plan || plan.goalKg == null || plan.rate === 0) return null;
  const weeks = (plan.goalKg - plan.kg) / plan.rate; if (!(weeks > 0) || weeks > 520) return null;
  if (plan.weeks && weeks > plan.weeks) return null;
  return isoAdd(plan.start, Math.ceil(weeks * 7));
}

// Weight is stored in kg. Pounds are only for display and entry.
const KG_LB = 2.2046226;
function wShow(kg) { return S.wunit === 'lb' ? Math.round(kg * KG_LB * 10) / 10 : Math.round(kg * 10) / 10; }
function wParse(v) { const n = Number(String(v).replace(',', '.')); return n > 0 ? (S.wunit === 'lb' ? n / KG_LB : n) : 0; }

// Goals can arrive from a backup or a synced account, so only keep known numeric fields.
function cleanGoals(g) {
  if (!g || typeof g !== 'object') return null;
  const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? x : 0; };
  const out = { kcal: n(g.kcal, 20000), pro: n(g.pro, 1500), carb: n(g.carb, 3000), fat: n(g.fat, 1500), fiber: n(g.fiber, 500), x: {}, profile: null };
  if (!(out.kcal > 0)) return null;
  const gx = g.x && typeof g.x === 'object' ? g.x : {};
  for (const m of NUT_X) { const v = Object.prototype.hasOwnProperty.call(gx, m.k) ? n(gx[m.k], 1e6) : 0; if (v > 0) out.x[m.k] = v; }
  const p = g.profile;
  if (p && typeof p === 'object') out.profile = { sex: p.sex === 'f' ? 'f' : 'm', age: n(p.age, 120), cm: n(p.cm, 260), kg: n(p.kg, 500), act: ACTIVITY.some(a => a[0] === String(p.act)) ? String(p.act) : '1.375', goal: GOAL_KIND.some(a => a[0] === p.goal) ? p.goal : 'maintain', rate: Number.isFinite(Number(p.rate)) && Math.abs(Number(p.rate)) <= 2 ? Number(p.rate) : null, meals: [4, 5, 6].includes(Number(p.meals)) ? Number(p.meals) : 4, wake: /^\d{2}:\d{2}$/.test(String(p.wake)) ? p.wake : '07:00', train: /^\d{2}:\d{2}$/.test(String(p.train)) ? p.train : '' };
  return out;
}
