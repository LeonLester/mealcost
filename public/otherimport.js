/* Diary exports from other apps: MyFitnessPal (nutrition summary), Lose It and Waistline. Loaded before app.js.
   Returns entries in the same shape as parseCronometer, or null when the file is not one of these. */
'use strict';

const OI_UNITS = { gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kg: 'kg', ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', lb: 'lb', lbs: 'lb', milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'l', litre: 'l', l: 'l', 'fluid ounce': 'fl oz', 'fl oz': 'fl oz' };
function oiAmount(q, unit) {
  const quantity = num(q) > 0 ? num(q) : 1, u = String(unit || '').trim().toLowerCase(), m = OI_UNITS[u];
  return m ? parseAmount(`${quantity} ${m}`) : { qty: quantity, unit: u ? u.replace(/s$/, '') : 'serving', type: 'count' };
}
function parseOtherDiary(text) {
  const first = (text.split(/\r?\n/)[0] || '');
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = parseCSV(text, delim);
  if (rows.length < 2) return null;
  const h = rows[0].map(x => x.trim().toLowerCase().replace(/^﻿/, ''));
  if (h.includes('food name') || h.includes('energy (kcal)')) return null; // Cronometer
  const at = (...names) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } for (const n of names) { const i = h.findIndex(x => x.startsWith(n)); if (i >= 0) return i; } return -1; };
  const c = {
    date: at('date', 'day'), meal: at('meal', 'type', 'group', 'meal type'), name: at('name', 'food', 'food name', 'description', 'item'),
    qty: at('quantity', 'amount', 'portion', 'servings', 'serving size'), unit: at('units', 'unit', 'serving unit'),
    kcal: at('calories', 'energy', 'kcal', 'calories (kcal)'), pro: at('protein (g)', 'protein', 'proteins'), carb: at('carbohydrates (g)', 'carbohydrates', 'carbs (g)', 'carbs', 'carbohydrate'),
    fat: at('fat (g)', 'fat', 'fats'), fib: at('fiber (g)', 'fiber', 'fibre (g)', 'fibre', 'dietary fiber'), brand: at('brand')
  };
  if (c.date < 0 || c.kcal < 0 || (c.pro < 0 && c.carb < 0 && c.fat < 0)) return null;
  const summary = c.name < 0; // MyFitnessPal's export is one row per meal, not per food
  if (summary && c.meal < 0) return null;
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], date = normDate(r[c.date]);
    if (!date) continue;
    const meal = (c.meal >= 0 && (r[c.meal] || '').trim()) || 'Meal';
    const kcal = num(r[c.kcal]), pro = c.pro >= 0 ? num(r[c.pro]) : 0, carb = c.carb >= 0 ? num(r[c.carb]) : 0, fat = c.fat >= 0 ? num(r[c.fat]) : 0, fiber = c.fib >= 0 ? num(r[c.fib]) : 0;
    if (summary) {
      if (!(kcal > 0)) continue;
      const name = `${meal} (MyFitnessPal)`;
      out.push({ date, group: meal, name, qty: 1, unit: 'serving', type: 'count', kcal, pro, carb, fat, fiber, cat: '', q: true });
      continue;
    }
    let name = (r[c.name] || '').trim(); if (!name) continue;
    const brand = c.brand >= 0 ? (r[c.brand] || '').trim() : ''; if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${name} (${brand})`;
    const a = oiAmount(c.qty >= 0 ? r[c.qty] : 1, c.unit >= 0 ? r[c.unit] : '');
    out.push({ date, group: meal, name, qty: a.qty, unit: a.unit, type: a.type, kcal, pro, carb, fat, fiber, cat: '' });
  }
  return out.length ? out : null;
}
