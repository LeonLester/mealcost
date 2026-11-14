// Unit checks for label conversion. Run: node tests/test_label.mjs
import { toFood, checkEnergy } from '../src/label.js';
let bad = 0; const ok = (n, c, i) => { if (!c) { bad++; console.log('FAIL', n, i ?? ''); } };
const z = { kcal: null, kj: null, protein: null, carbs: null, sugars: null, fat: null, satfat: null, fiber: null, salt: null, sodium_mg: null };
let r = toFood({ per100: null, perServing: { ...z, kcal: 150, protein: 6, carbs: 24, fat: 3 }, serving_g: 30 });
ok('serving converts to 100 g', r.food.per === '100g' && r.food.kcal === 500 && r.food.pro === 20 && r.basis === 'converted', r);
r = toFood({ per100: { ...z, kj: 1046, protein: 10, carbs: 50, fat: 5 }, perServing: null, serving_g: null });
ok('kJ becomes kcal', r.food.kcal === 250 && r.basis === 'label100', r);
r = toFood({ per100: null, perServing: { ...z, kcal: 100, protein: 5, carbs: 10, fat: 4 }, serving_g: null });
ok('no portion weight falls back to per item with a warning', r.food.per === 'item' && r.warnings.length === 1, r);
r = toFood({ per100: { ...z, kcal: 900, protein: 50, carbs: 50, fat: 1 }, perServing: null });
ok('mismatched energy warns', r.warnings.some(w => w.includes('do not match')), r);
r = toFood({ per100: { ...z, salt: 1 }, perServing: null });
ok('salt gives sodium', r.extra.sodium === 400, r);
r = toFood({ per100: { ...z, kcal: 5000 }, perServing: null });
ok('absurd values are dropped', r.food === null, r);
ok('sugars above carbs flagged', checkEnergy({ ...z, carbs: 5, sugars: 9 }).length === 1);
console.log(bad ? `${bad} failed` : 'label ok'); process.exit(bad ? 1 : 0);
