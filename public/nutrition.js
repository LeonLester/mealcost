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

// Weight is stored in kg. Pounds are only for display and entry.
const KG_LB = 2.2046226;
function wShow(kg) { return S.wunit === 'lb' ? Math.round(kg * KG_LB * 10) / 10 : Math.round(kg * 10) / 10; }
function wParse(v) { const n = Number(String(v).replace(',', '.')); return n > 0 ? (S.wunit === 'lb' ? n / KG_LB : n) : 0; }
