/* Food page: the nutrition panel shown while logging or editing a food, like Cronometer's food screen. Loaded before app.js; uses app globals only when called. */
'use strict';

const FP_GROUPS = [
  ['Carbs and fats', ['sugar', 'satfat', 'omega3', 'chol']],
  ['Minerals', ['sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc']],
  ['Vitamins', ['vitA', 'vitC', 'vitD', 'vitK', 'folate', 'b12']]
];
const fpNum = v => new Intl.NumberFormat(undefined, { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 }).format(v || 0);

// Totals for an amount of a food, including extra nutrients when the food has them.
function fpTotals(name, qty, unit) {
  const o = perUnit(name, unit === 'item' ? 'item' : 'g'); if (!o || !(qty > 0)) return null;
  const t = { kcal: o.k * qty, pro: o.p * qty, carb: o.c * qty, fat: o.f * qty, fiber: o.b * qty, x: {} };
  if (o.x) for (const k in o.x) t.x[k] = o.x[k] * qty;
  return { t, hasX: !!(o.x && Object.keys(o.x).length), o };
}
function fpRow(label, val, unit, goal, cls, lim) {
  const pct = goal > 0 ? Math.round(val / goal * 100) : null;
  return `<div class="fp-row"><span>${esc(label)}${lim ? ' <small class="muted">limit</small>' : ''}</span><b>${fpNum(val)}<small> ${esc(unit)}</small></b><em>${pct == null ? '' : pct + '%'}</em>${goal > 0 ? dzBar(val, goal, cls, label) : '<span></span>'}</div>`;
}
function fpPanel(name, qty, unit, date) {
  const r = fpTotals(name, qty, unit);
  if (!r) return '';
  const { t, hasX } = r, gk = goalFor('kcal');
  const kp = t.pro * 4, kc = t.carb * 4, kf = t.fat * 9, ks = kp + kc + kf || 1;
  const e = { date: date, name, src: name, qty, unit, type: unit === 'item' ? 'count' : unit === 'ml' ? 'volume' : 'mass', kcal: t.kcal, pro: t.pro, carb: t.carb, fat: t.fat, fiber: t.fiber };
  const c = costOf(e), cf = S.foods[name], rec = S.recipes[name];
  const split = [['Protein', kp, 'm-pro'], ['Carbs', kc, 'm-carb'], ['Fat', kf, 'm-fat']];
  const macros = [['pro', 'Protein', t.pro], ['carb', 'Carbs', t.carb], ['fat', 'Fat', t.fat], ['fiber', 'Fiber', t.fiber]].map(([k, n, v]) => fpRow(n, v, 'g', goalFor(k), MC[k])).join('');
  const groups = FP_GROUPS.map(([g, ks2]) => {
    const rows = ks2.map(k => NUT_X.find(n => n.k === k)).filter(Boolean).map(n => fpRow(n.n, t.x[n.k] || 0, n.u, goalFor(n.k), n.kind === 'limit' ? 'm-lim' : 'm-fib', n.kind === 'limit')).join('');
    return `<details class="fp-group"${g === 'Carbs and fats' ? ' open' : ''}><summary>${g}</summary>${rows}</details>`;
  }).join('');
  return `<section class="fp" aria-label="Nutrition for this amount">
    <div class="fp-top"><div><span class="fp-kcal">${n0(t.kcal)}</span><span class="muted"> kcal</span></div>${gk ? `<span class="muted">${n0(t.kcal / gk * 100)}% of your day</span>` : ''}${c.cost != null ? `<b class="fp-cost">${money(c.cost)}</b>` : ''}</div>
    <div class="fp-split" role="img" aria-label="Energy from ${split.map(([n, v]) => `${n} ${Math.round(v / ks * 100)} percent`).join(', ')}">${split.map(([n, v, cl]) => `<i class="${cl}" style="width:${(v / ks * 100).toFixed(1)}%"></i>`).join('')}</div>
    <div class="fp-leg">${split.map(([n, v, cl]) => `<span><i class="${cl}"></i>${n} ${Math.round(v / ks * 100)}%</span>`).join('')}</div>
    <h3 class="dz-gh">Macros</h3>${macros}
    ${hasX ? groups : `<p class="muted dz-small" style="margin-top:12px">This food has no vitamin, mineral or fat detail. A Cronometer export or a barcode lookup fills those in.</p>`}
    ${rec ? `<p class="muted dz-small" style="margin-top:12px">A recipe of ${rec.items.length} ${rec.items.length === 1 ? 'ingredient' : 'ingredients'}.</p>` : ''}
    ${cf && cf.ing ? `<h3 class="dz-gh">Ingredients</h3><p class="dz-small" style="margin:6px 0 0">${esc(cf.ing)}</p>` : ''}
    ${cf ? `<button type="button" class="btn link" style="margin-top:10px;align-self:flex-start" data-act="edit-food" data-name="${esc(name)}">Edit nutrition</button>` : ''}
  </section>`;
}
