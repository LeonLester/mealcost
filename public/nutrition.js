/* Nutrition model: extra nutrients, goals, energy needs. Loaded before app.js; uses app globals only when called. */
'use strict';

// Nutrients beyond kcal, protein, carbs, fat and fiber. A Cronometer export carries them; foods you add by hand do not.
// kind 'limit' means stay under it, 'target' means reach it. Defaults are common adult references and can be changed in Goals.
const NUT_X = [
  { k: 'netcarb', n: 'Net carbs', u: 'g', col: 'net carbs (g)', kind: 'target', def: 0, grp: 'Carbohydrates' },
  { k: 'sugar', n: 'Sugars', u: 'g', col: 'sugars (g)', kind: 'limit', def: 50, grp: 'Carbohydrates' },
  { k: 'addsugar', n: 'Added sugars', u: 'g', col: 'added sugars (g)', kind: 'limit', def: 36, grp: 'Carbohydrates' },
  { k: 'fibins', n: 'Insoluble fiber', u: 'g', col: 'insoluble fiber (g)', kind: 'target', def: 0, grp: 'Carbohydrates' },
  { k: 'fibsol', n: 'Soluble fiber', u: 'g', col: 'soluble fiber (g)', kind: 'target', def: 0, grp: 'Carbohydrates' },
  { k: 'satfat', n: 'Saturated fat', u: 'g', col: 'saturated (g)', kind: 'limit', def: 20, grp: 'Lipids' },
  { k: 'monofat', n: 'Monounsaturated', u: 'g', col: 'monounsaturated (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'polyfat', n: 'Polyunsaturated', u: 'g', col: 'polyunsaturated (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'transfat', n: 'Trans fats', u: 'g', col: 'trans-fats (g)', kind: 'limit', def: 2, grp: 'Lipids' },
  { k: 'chol', n: 'Cholesterol', u: 'mg', col: 'cholesterol (mg)', kind: 'limit', def: 300, grp: 'Lipids' },
  { k: 'omega3', n: 'Omega-3', u: 'g', col: 'omega-3 (g)', kind: 'target', def: 1.6, grp: 'Lipids' },
  { k: 'ala', n: 'ALA', u: 'g', col: 'ala (g)', kind: 'target', def: 1.6, grp: 'Lipids' },
  { k: 'epa', n: 'EPA', u: 'g', col: 'epa (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'dha', n: 'DHA', u: 'g', col: 'dha (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'omega6', n: 'Omega-6', u: 'g', col: 'omega-6 (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'la', n: 'LA', u: 'g', col: 'la (g)', kind: 'target', def: 17, grp: 'Lipids' },
  { k: 'aa', n: 'AA', u: 'g', col: 'aa (g)', kind: 'target', def: 0, grp: 'Lipids' },
  { k: 'b1', n: 'B1 (Thiamine)', u: 'mg', col: 'b1 (thiamine) (mg)', kind: 'target', def: 1.2, grp: 'Vitamins' },
  { k: 'b2', n: 'B2 (Riboflavin)', u: 'mg', col: 'b2 (riboflavin) (mg)', kind: 'target', def: 1.3, grp: 'Vitamins' },
  { k: 'b3', n: 'B3 (Niacin)', u: 'mg', col: 'b3 (niacin) (mg)', kind: 'target', def: 16, grp: 'Vitamins' },
  { k: 'b5', n: 'B5 (Pantothenic acid)', u: 'mg', col: 'b5 (pantothenic acid) (mg)', kind: 'target', def: 5, grp: 'Vitamins' },
  { k: 'b6', n: 'B6 (Pyridoxine)', u: 'mg', col: 'b6 (pyridoxine) (mg)', kind: 'target', def: 1.3, grp: 'Vitamins' },
  { k: 'folate', n: 'Folate', u: 'µg', col: 'folate (µg)', kind: 'target', def: 400, grp: 'Vitamins' },
  { k: 'b12', n: 'Vitamin B12', u: 'µg', col: 'b12 (cobalamin) (µg)', kind: 'target', def: 2.4, grp: 'Vitamins' },
  { k: 'vitA', n: 'Vitamin A', u: 'µg', col: 'vitamin a (µg)', kind: 'target', def: 900, grp: 'Vitamins' },
  { k: 'vitC', n: 'Vitamin C', u: 'mg', col: 'vitamin c (mg)', kind: 'target', def: 90, grp: 'Vitamins' },
  { k: 'vitD', n: 'Vitamin D', u: 'IU', col: 'vitamin d (iu)', kind: 'target', def: 600, grp: 'Vitamins' },
  { k: 'vitE', n: 'Vitamin E', u: 'mg', col: 'vitamin e (mg)', kind: 'target', def: 15, grp: 'Vitamins' },
  { k: 'vitK', n: 'Vitamin K', u: 'µg', col: 'vitamin k (µg)', kind: 'target', def: 120, grp: 'Vitamins' },
  { k: 'calcium', n: 'Calcium', u: 'mg', col: 'calcium (mg)', kind: 'target', def: 1000, grp: 'Minerals' },
  { k: 'copper', n: 'Copper', u: 'mg', col: 'copper (mg)', kind: 'target', def: 0.9, grp: 'Minerals' },
  { k: 'iron', n: 'Iron', u: 'mg', col: 'iron (mg)', kind: 'target', def: 8, grp: 'Minerals' },
  { k: 'magnesium', n: 'Magnesium', u: 'mg', col: 'magnesium (mg)', kind: 'target', def: 400, grp: 'Minerals' },
  { k: 'manganese', n: 'Manganese', u: 'mg', col: 'manganese (mg)', kind: 'target', def: 2.3, grp: 'Minerals' },
  { k: 'phosphorus', n: 'Phosphorus', u: 'mg', col: 'phosphorus (mg)', kind: 'target', def: 700, grp: 'Minerals' },
  { k: 'potassium', n: 'Potassium', u: 'mg', col: 'potassium (mg)', kind: 'target', def: 3400, grp: 'Minerals' },
  { k: 'selenium', n: 'Selenium', u: 'µg', col: 'selenium (µg)', kind: 'target', def: 55, grp: 'Minerals' },
  { k: 'sodium', n: 'Sodium', u: 'mg', col: 'sodium (mg)', kind: 'limit', def: 2300, grp: 'Minerals' },
  { k: 'zinc', n: 'Zinc', u: 'mg', col: 'zinc (mg)', kind: 'target', def: 11, grp: 'Minerals' },
  { k: 'cystine', n: 'Cystine', u: 'g', col: 'cystine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'histidine', n: 'Histidine', u: 'g', col: 'histidine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'isoleucine', n: 'Isoleucine', u: 'g', col: 'isoleucine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'leucine', n: 'Leucine', u: 'g', col: 'leucine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'lysine', n: 'Lysine', u: 'g', col: 'lysine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'methionine', n: 'Methionine', u: 'g', col: 'methionine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'phenylalanine', n: 'Phenylalanine', u: 'g', col: 'phenylalanine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'threonine', n: 'Threonine', u: 'g', col: 'threonine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'tryptophan', n: 'Tryptophan', u: 'g', col: 'tryptophan (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'tyrosine', n: 'Tyrosine', u: 'g', col: 'tyrosine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'valine', n: 'Valine', u: 'g', col: 'valine (g)', kind: 'target', def: 0, grp: 'Amino acids' },
  { k: 'oxalate', n: 'Oxalate', u: 'mg', col: 'oxalate (mg)', kind: 'limit', def: 0, grp: 'Other' },
  { k: 'phytate', n: 'Phytate', u: 'mg', col: 'phytate (mg)', kind: 'limit', def: 0, grp: 'Other' }
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
  return g.x && Number(g.x[k]) > 0 ? Number(g.x[k]) : def && def.def > 0 ? def.def : null;
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

// Goals can arrive from a backup or a synced account, so only keep known numeric fields.
function cleanGoals(g) {
  if (!g || typeof g !== 'object') return null;
  const n = (v, max) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? x : 0; };
  const out = { kcal: n(g.kcal, 20000), pro: n(g.pro, 1500), carb: n(g.carb, 3000), fat: n(g.fat, 1500), fiber: n(g.fiber, 500), x: {}, profile: null };
  if (!(out.kcal > 0)) return null;
  const gx = g.x && typeof g.x === 'object' ? g.x : {};
  for (const m of NUT_X) { const v = Object.prototype.hasOwnProperty.call(gx, m.k) ? n(gx[m.k], 1e6) : 0; if (v > 0) out.x[m.k] = v; }
  const p = g.profile;
  if (p && typeof p === 'object') out.profile = { sex: p.sex === 'f' ? 'f' : 'm', age: n(p.age, 120), cm: n(p.cm, 260), kg: n(p.kg, 500), act: ACTIVITY.some(a => a[0] === String(p.act)) ? String(p.act) : '1.375', goal: GOAL_KIND.some(a => a[0] === p.goal) ? p.goal : 'maintain' };
  return out;
}
