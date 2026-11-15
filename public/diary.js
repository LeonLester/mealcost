/* Diary and Goals screens. Loaded before app.js; uses app globals (S, IDX, esc, money, ...) only when called. */
'use strict';

const MEAL_BASE = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const relMeta = (day, rel) => ['Today', 'Yesterday', 'Tomorrow'].includes(rel) ? dFmt(day, { weekday: 'short', month: 'short', day: 'numeric' }) : isoDiff(day) <= 6 ? dFmt(day, { month: 'short', day: 'numeric' }) : '';
const isoDiff = day => Math.abs(Math.round((dObj(day) - dObj(todayIso())) / 864e5));
const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Pre-workout', 'Post-workout'];
const mkey = g => String(g).toLowerCase().replace(/^meal\s*\d+\s*[-:]\s*/, '').replace(/s$/, '');
const todayIso = () => mealToday();
const MC = { pro: 'm-pro', carb: 'm-carb', fat: 'm-fat', fiber: 'm-fib' };

/* ---------- small pieces ---------- */
function dzBar(val, goal, cls, label) {
  const pct = goal > 0 ? Math.min(100, Math.round(val / goal * 100)) : 0;
  const over = goal > 0 && val > goal * 1.0001 && /m-kcal|m-lim/.test(cls || '');
  return `<div class="dz-bar ${cls || ''}${over ? ' over' : ''}" role="img" aria-label="${esc(label || '')}${goal > 0 ? ', ' + Math.round(val / goal * 100) + ' percent of the goal' : ''}"><i style="width:${pct}%"></i></div>`;
}
function relDay(day) {
  const t = todayIso();
  if (day === t) return 'Today';
  if (day === isoAdd(t, -1)) return 'Yesterday';
  if (day === isoAdd(t, 1)) return 'Tomorrow';
  const diff = Math.round((dObj(day) - dObj(t)) / 864e5);
  if (Math.abs(diff) <= 6) return dFmt(day, { weekday: 'long' });
  return dFmt(day, dObj(day).getFullYear() === dObj(t).getFullYear() ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
function dayStrip(day) {
  const dow = (dObj(day).getDay() + 6) % 7, start = isoAdd(day, -dow), t = todayIso(), goal = goalFor('kcal');
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = isoAdd(start, i), es = IDX.byDate.get(d) || [], k = es.reduce((a, e) => a + (e.kcal || 0), 0);
    const h = goal ? Math.min(100, Math.round(k / goal * 100)) : (k > 0 ? 60 : 0);
    cells.push(`<button class="dz-day${d === t ? ' today' : ''}${k > 0 ? ' has' : ''}" data-act="pick-day" data-date="${d}" aria-pressed="${d === day}" aria-label="${esc(dMed(d))}${k ? ', ' + n0(k) + ' kcal' : ', nothing logged'}"><small>${esc(dFmt(d, { weekday: 'short' }).slice(0, 3))}</small><b>${dFmt(d, { day: 'numeric' })}</b></button>`);
  }
  return `<div class="dz-stripwrap"><button type="button" class="dz-wk" data-act="week-step" data-dir="-1" aria-label="Previous week">${IC.left}</button><div class="dz-strip" role="group" aria-label="Pick a day">${cells.join('')}</div><button type="button" class="dz-wk" data-act="week-step" data-dir="1" aria-label="Next week">${IC.right}</button></div>`;
}

/* ---------- summary: energy and macros against goals ---------- */
function summaryCard(tot, cost) {
  const g = S.goals, gk = goalFor('kcal');
  const energy = gk
    ? `<div class="dz-energy"><div><span class="dz-num">${n0(tot.kcal)}</span><span class="dz-unit"> of ${n0(gk)} kcal</span></div><b class="dz-left${tot.kcal > gk ? ' over' : ''}">${tot.kcal > gk ? n0(tot.kcal - gk) + ' over' : n0(gk - tot.kcal) + ' left'}</b></div>${dzBar(tot.kcal, gk, 'm-kcal big', 'Energy')}`
    : `<div class="dz-energy"><div><span class="dz-num">${n0(tot.kcal)}</span><span class="dz-unit"> kcal</span></div>${g ? '' : '<button class="btn link dz-setgoals" data-act="goals">Set goals</button>'}</div>`;
  const rows = [['pro', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat'], ['fiber', 'Fiber']].map(([k, n]) => {
    const v = tot[k], gl = goalFor(k);
    return `<div class="dz-mrow ${MC[k]}"><div class="dz-mhead"><span>${n}</span></div><div class="dz-mval"><b>${n0(v)}</b><small>${gl ? ' / ' + n0(gl) : ''} g</small></div>${dzBar(v, gl, MC[k], n)}</div>`;
  }).join('');
  const ke = tot.pro * 4 + tot.carb * 4 + tot.fat * 9;
  const split = ke > 0 ? `<p class="dz-split">Energy from protein ${Math.round(tot.pro * 4 / ke * 100)}%, carbs ${Math.round(tot.carb * 4 / ke * 100)}%, fat ${Math.round(tot.fat * 9 / ke * 100)}%</p>` : '';
  return `<section class="card dz-sum" aria-label="Nutrition for the day">${energy}<div class="dz-macros">${rows}</div>${split}${cost || ''}</section>`;
}

/* ---------- cost: one slim footer inside the summary ---------- */
function costCard(day, es, sm, names, bad) {
  const budget = S.budget > 0 ? S.budget : null, left = budget ? r2(budget - sm.cost) : 0;
  const offerNames = [...new Set(es.filter(e => costOf(e).offer).map(e => e.name))];
  const pp = sm.pro > 0 && sm.cost > 0 ? sm.cost / (sm.pro / 100) : null;
  const notes = [pp != null ? `${money(pp)} per 100 g protein` : '', sm.saved > 0.004 ? `${offerNames.length === 1 ? 'Offer on ' + esc(offerNames[0]) : offerNames.length + ' offers'} saved ${money(sm.saved)}` : '', !bad.length && names.length ? `All ${names.length} foods priced` : ''].filter(Boolean);
  return `<div class="dz-cost" aria-label="Cost for the day">
    <div class="dz-costrow"><span class="pricetag xs"><span class="n">${money(sm.cost)}</span><span class="l">for the day</span></span><span class="dz-budget">${budget ? `<span class="${left < 0 ? 'over' : ''}">${left >= 0 ? money(left) + ' left' : money(-left) + ' over'} of ${money(budget)}</span>` : ''}<button class="btn link" data-act="budget">${budget ? 'Change budget' : 'Set a daily budget'}</button></span></div>
    ${budget ? dzBar(sm.cost, budget, 'm-cost', 'Budget') : ''}
    ${notes.length ? `<p class="muted dz-small">${notes.join(' · ')}</p>` : ''}
    ${bad.length ? `<p class="dz-small"><a href="#prices" data-act="unpriced-link">${bad.length} ${bad.length === 1 ? 'food needs' : 'foods need'} a price</a>, so the total leaves ${bad.length === 1 ? 'it' : 'them'} out.</p>` : ''}
  </div>`;
}

/* ---------- one logged food ---------- */
const macTxt = o => `<i class="lp">P</i> ${n0(o.pro)} <i class="lc">C</i> ${n0(o.carb)} <i class="lf">F</i> ${n0(o.fat)}`;
function dzItem(e, day, g, li) {
  const c = costOf(e), rec = S.recipes[e.name], ei = S.entries.indexOf(e), en = esc(e.name);
  let cell, note = '';
  if (e.q) cell = '';
  else if (c.cost == null) {
    const lbl = { needgpu: 'Add grams per item', recipe: 'Price the ingredients', needyield: 'Set recipe weight' }[c.why] || 'Set price';
    cell = `<button class="setprice" data-act="${rec ? 'edit-recipe' : 'goto-price'}" data-name="${en}">${lbl}</button>`;
  } else {
    const tag = c.offer ? '<span class="offer-tag">Offer</span>' : '';
    cell = rec
      ? `<button class="costbtn" data-act="edit-recipe" data-name="${en}" aria-label="Edit the recipe ${en}">${tag}<span>${money(c.cost)}</span></button>`
      : `<button class="costbtn" data-act="offer" data-date="${day}" data-name="${en}" aria-label="Change the price of ${en} for this day">${tag}<span>${money(c.cost)}</span></button>`;
    if (!rec && c.offer && c.pi.base != null) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today, usually ${money(c.pi.base)}</div>`;
    else if (!rec && c.offer) note = `<div class="note">${money(c.pi.price)} per ${esc(basisText(c.pi.basis, e.name))} today</div>`;
  }
  const key = `${day}|${g}|${li}`, open = !!rec && S.open.has(key);
  let subs = '';
  if (open) {
    const fr = recipeFrac(rec, e), rc = recipeCostOf(rec, e.date);
    subs = `<div class="subitems">${rc.parts.map(p => `<div class="subitem"><span>${esc(p.it.name)}</span><span class="amt">${fr == null ? '' : qtyFmt(Number(p.it.qty) * fr) + ' ' + esc(p.it.unit)}</span><span class="lead"></span>${p.cost != null && fr != null ? `<span>${money(r2(p.cost * fr))}</span>` : `<button class="setprice" data-act="goto-price" data-name="${esc(p.it.name)}">Set price</button>`}</div>`).join('')}</div>`;
  }
  // A serving or item has no weight in a Cronometer export. Show the weight once the user has set it, and offer to set it.
  const gpuSet = Number((S.prices[e.name] || {}).gpu) || 0, isCount = !e.q && e.type === 'count' && !rec;
  const unitTxt = /^(serving|portion|dose)$/.test(e.unit) && e.qty !== 1 ? e.unit + 's' : e.unit;
  const amt = e.q ? 'Quick add' : `${qtyFmt(e.qty)} ${esc(unitTxt)}${isCount && gpuSet ? ` (${n0(e.qty * gpuSet)} g)` : ''}`;
  const sizeBtn = isCount && !gpuSet ? ` <button type="button" class="btn link dz-size" data-act="serving-size" data-name="${en}">Set serving size</button>` : '';
  const mac = macTxt(e);
  return `<div class="swipe"><button class="swipe-del" data-act="del-entry" data-i="${ei}" aria-label="Delete ${en}" tabindex="-1">${TOOLIC.trash}</button><div class="item dz-item"><div class="imain"><button class="iname" data-act="edit-entry" data-i="${ei}" aria-label="Edit ${en}"><span class="nm">${en}</span><span class="amt">${amt}<span class="dz-mac"> · ${mac}</span></span></button>${sizeBtn}${note}${rec ? `<button class="btn link" data-act="toggle-recipe" data-key="${esc(key)}" aria-expanded="${open}">${open ? 'Hide' : 'Show'} ingredients</button>` : ''}</div><div class="dz-r"><b class="dz-k">${n0(e.kcal)}<small> kcal</small></b>${cell}</div></div></div>${subs}`;
}

/* ---------- go-to meals: saved meals tagged for a slot, one tap to add ---------- */
const gotoFor = g => Object.keys(S.meals).filter(n => S.meals[n].slot && mkey(S.meals[n].slot) === mkey(g)).sort((a, b) => a.localeCompare(b));
function gotoChips(g, day) {
  const names = gotoFor(g); if (!names.length) return '';
  return `<div class="dz-goto" role="group" aria-label="Go-to meals for ${esc(g)}">${names.slice(0, 4).map(n => `<button type="button" class="chip" data-act="goto-add" data-name="${esc(n)}" data-date="${day}" data-group="${esc(g)}" aria-label="Add ${esc(n)} to ${esc(g)}">+ ${esc(n)}</button>`).join('')}${names.length > 4 ? `<button type="button" class="chip" data-act="goto-open" data-date="${day}" data-group="${esc(g)}">More</button>` : ''}</div>`;
}
function goAdd(name, day, group) {
  const m = S.meals[name]; if (!m) return;
  addToDiary(name, day, group || m.slot || 'Snacks', 1, true);
  toast(`Added ${name} to ${group || m.slot || 'Snacks'}`);
}
function openGoto(day, group) {
  const names = Object.keys(S.meals).sort((a, b) => (mkey(S.meals[b].slot || '') === mkey(group || '')) - (mkey(S.meals[a].slot || '') === mkey(group || '')) || a.localeCompare(b));
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const rows = names.map(n => {
    const m = S.meals[n], t = mealStats(m, day), sv = t.sv;
    return `<div class="gtrow"><div><b>${esc(n)}</b>${m.slot ? ` <span class="slottag">${esc(m.slot)}</span>` : ''}<div class="sub">${n0(t.k / sv)} kcal, ${nf1.format(t.p / sv)} g protein${t.noPrice ? '' : ', ' + money(t.cost / sv)}</div></div><button type="button" class="btn sm" data-act="goto-add" data-name="${esc(n)}" data-date="${day}" data-group="${esc(group || '')}">Add</button></div>`;
  }).join('');
  dlg.innerHTML = `<form method="dialog"><h2 id="dlg-title" style="font-size:20px">Go-to meals</h2>
    <p class="muted" style="font-size:14px">${group ? `Adds one serving to ${esc(group)}` : 'Adds one serving to the meal it is tagged for'} on ${esc(dMed(day))}. Change the amount afterwards by tapping the food.</p>
    ${names.length ? `<div class="gtlist">${rows}</div>` : `<p>No saved meals yet. Build one on the Meals tab and choose a "My go-to for" slot.</p>`}
    <div class="dlg-actions" style="gap:8px"><a class="btn" href="#meals" data-act="close-dlg">Manage meals</a><button type="button" class="btn" data-act="close-dlg">Close</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
}

/* Meal sections can be folded, empty ones hidden, and the order changed. These choices stay on this device. */
const mealPref = {
  get fold() { return S.mfold || (S.mfold = store.get('mfold', [])); },
  get order() { return S.morder || (S.morder = store.get('morder', [])); },
  get hideEmpty() { if (S.hideEmpty === undefined) S.hideEmpty = store.get('hideEmpty', false); return S.hideEmpty; },
};
function orderSections(sections) {
  const o = mealPref.order;
  return sections.map((s, i) => [s, i]).sort((a, b) => { const x = o.indexOf(mkey(a[0][0])), y = o.indexOf(mkey(b[0][0])); return (x < 0 ? 1e3 + a[1] : x) - (y < 0 ? 1e3 + b[1] : y); }).map(x => x[0]);
}
function moveMeal(key, dir, all) {
  const keys = all.map(s => mkey(s[0])), i = keys.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]]; S.morder = keys; store.set('morder', keys);
}
function mealSection(g, list, day, pos) {
  const t = nutTotals(list), k = mkey(g), folded = mealPref.fold.includes(k), arr = !!S.arrange;
  const cost0 = r2(list.reduce((a, e) => a + (costOf(e).cost || 0), 0));
  return `<section class="meal dz-meal m-${k.slice(0, 3)}${folded ? ' folded' : ''}"><div class="meal-head"><button type="button" class="dz-fold" data-act="meal-fold" data-key="${esc(k)}" aria-expanded="${!folded}" aria-label="${folded ? 'Show' : 'Hide'} ${esc(g)}"><svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><h2>${esc(g)}</h2></button><span class="kcal">${list.length ? `${n0(t.kcal)} kcal${folded ? '' : ' \u00b7 ' + macTxt(t)}` : ''}</span>${list.length && cost0 > 0 ? `<span class="cost">${money(cost0)}</span>` : ''}${arr ? `<span class="dz-mv"><button type="button" class="ibtn" data-act="meal-move" data-key="${esc(k)}" data-dir="-1" aria-label="Move ${esc(g)} up"${pos.first ? ' disabled' : ''}>\u2191</button><button type="button" class="ibtn" data-act="meal-move" data-key="${esc(k)}" data-dir="1" aria-label="Move ${esc(g)} down"${pos.last ? ' disabled' : ''}>\u2193</button></span>` : ''}</div>
    ${folded ? '' : `<div class="dz-list">${list.map((e, li) => dzItem(e, day, g, li)).join('')}</div>
    ${gotoChips(g, day)}
    <div class="dz-actions"><button class="btn sm" data-act="log-food" data-date="${day}" data-group="${esc(g)}">${list.length ? 'Add food' : 'Add to ' + esc(g.toLowerCase())}</button><button class="btn link" data-act="copy-prev" data-group="${esc(g)}">Copy from earlier</button></div>`}</section>`;
}

/* ---------- nutrients that come with a Cronometer export ---------- */
function nutrientsCard(tot) {
  const have = NUT_X.some(n => tot.x[n.k] > 0);
  const groups = [...new Set(NUT_X.map(n => n.grp))];
  const body = have ? groups.map(gr => `<h3 class="dz-gh">${gr}</h3>${NUT_X.filter(n => n.grp === gr).map(n => {
    const v = tot.x[n.k] || 0, gl = goalFor(n.k), lim = n.kind === 'limit';
    return `<div class="dz-mrow"><div class="dz-mhead"><span>${n.n}${lim ? ' <small class="muted">limit</small>' : ''}</span><b>${nfx(v)}<small> / ${nfx(gl)} ${n.u}</small></b></div>${dzBar(v, gl, lim ? 'm-lim' : 'm-fib', n.n)}</div>`;
  }).join('')}`).join('') : `<p class="muted" style="margin-top:12px">Vitamins, minerals, sugars and sodium show up here for days that came from a Cronometer export. Foods you add by hand carry the five main nutrients only.</p>`;
  return `<details class="card dz-nut"><summary>All nutrients</summary>${body}</details>`;
}
const nfx = v => new Intl.NumberFormat(undefined, { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 }).format(v || 0);

/* ---------- the diary ---------- */
function diaryView() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(S.day || '')) S.day = todayIso();
  const day = S.day, es = IDX.byDate.get(day) || [], tot = nutTotals(es), sm = summarize(es);
  const names = [...new Set(es.map(e => e.name))], bad = names.filter(n => !es.find(e => e.name === n && e.q) && issue(n));
  const grouped = new Map(groupEntries(es).map(([g, l]) => [mkey(g), [g, l]]));
  for (const n in S.meals) { const sl = S.meals[n].slot; if (sl && !MEAL_BASE.some(b => mkey(b) === mkey(sl)) && !grouped.has(mkey(sl))) grouped.set(mkey(sl), [sl, []]); }
  const sections = orderSections(MEAL_BASE.map(b => { const hit = grouped.get(mkey(b)); grouped.delete(mkey(b)); return [hit ? hit[0] : b, hit ? hit[1] : []]; }).concat([...grouped.values()]));
  const shown = mealPref.hideEmpty && !S.arrange ? sections.filter(([g, l]) => l.length) : sections, hidden = sections.filter(s => !shown.includes(s));
  const rel = relDay(day), full = dLong(day);
  return `
  <div class="pagehead dz-head">
    <div class="dz-title"><h1 class="h1" id="h1" tabindex="-1">${esc(rel)}</h1><span class="muted dz-date">${esc(relMeta(day, rel))}</span>${day > todayIso() ? '<span class="dz-plan">Planned</span>' : ''}</div>
    <div class="dz-nav">
      <button class="iconbtn" data-act="prev-day" aria-label="Previous day">${IC.left}</button>
      <button class="iconbtn" data-act="next-day" aria-label="Next day">${IC.right}</button>
      <label class="iconbtn dz-cal" title="Pick a date"><span class="sr">Pick a date</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><input type="date" id="daypick" value="${day}" aria-label="Pick a date"></label>
      ${day !== todayIso() ? '<button class="btn sm" data-act="today">Today</button>' : ''}
    </div>
    <div class="dz-top">
      <button class="btn primary" data-act="log-food" data-date="${day}">Add food</button>
      <details class="dz-menu"><summary class="iconbtn dz-dots" aria-label="More for this day"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.500" r="1.800"/><circle cx="12" cy="12" r="1.800"/><circle cx="12" cy="18.500" r="1.800"/></svg></summary><div class="dz-pop">
        <button data-act="goto-open" data-date="${day}" data-group="">Add a go-to meal</button>
        <button data-act="copy-to" data-date="${day}">Copy this day to another date</button>
        <button data-act="meal-hide-empty">${mealPref.hideEmpty ? 'Show empty meals' : 'Hide empty meals'}</button>
        <button data-act="meal-arrange">${S.arrange ? 'Done arranging' : 'Arrange meals'}</button>
        <button data-act="quick-add" data-date="${day}">Quick add calories</button>
        <button data-act="copy-prev" data-group="">Copy a day from earlier</button>
        <button data-act="goals">Daily goals</button>
        <button data-act="log-weight">Log weight</button>
        <button data-act="copy-day">Copy day as text</button>
        <button data-act="share-image">Make share image</button>
      </div></details>
    </div>
  </div>
  ${dayStrip(day)}
  <div class="cols dz-cols">
    <div class="main2">${es.length ? '' : `<p class="muted dz-empty">${S.entries.length ? 'Nothing logged on this day yet.' : 'Nothing is logged yet.'} Add a food, or copy a day from earlier.</p>${S.entries.length ? '' : dropzone('food')}`}${shown.map(([g, l], i) => mealSection(g, l, day, { first: i === 0, last: i === shown.length - 1 })).join('')}${hidden.length ? `<div class="dz-hiddenrow"><span class="muted">Add to</span>${hidden.map(([g]) => `<button type="button" class="chip" data-act="log-food" data-date="${day}" data-group="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}${S.arrange ? '<p class="muted dz-hint" style="display:block">Use the arrows to change the order. Choose Done arranging in the day menu when you are finished.</p>' : ''}${es.length ? '<p class="muted dz-hint">Tap a food to edit it. Swipe left to delete. Tap a price to change it for this day only.</p>' : ''}</div>
    <aside class="side dz-side">
      ${summaryCard(tot, costCard(day, es, sm, names, bad))}
      ${nutrientsCard(tot)}
    </aside>
  </div>`;
}

/* ---------- goals ---------- */
function goalsView() {
  const g = S.goals || defaultGoals(), p = (g.profile || {}), wu = S.wunit;
  const fld = (id, label, val, unit, hint) => `<div class="gl-f"><label for="${id}">${label}</label><div class="gl-in"><input class="field" id="${id}" inputmode="decimal" value="${esc(val ?? '')}" autocomplete="off"><span>${unit}</span></div>${hint ? `<small class="muted">${hint}</small>` : ''}</div>`;
  const lastW = S.weights.length ? S.weights[S.weights.length - 1].kg : '';
  return `
  <div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Daily goals</h1></div>
  <p class="lede">Your targets for energy and nutrients. The Diary shows how much is left each day.</p>
  <div class="gl-cols">
    <form id="goalform" class="card pad" novalidate>
      <h2 style="font-size:17px">Targets</h2>
      ${glEnergyHtml(g)}
      <div class="gl-macros">${glRowHtml('pro', 'gp', 'Protein', g)}${glRowHtml('carb', 'gc', 'Carbs', g)}${glRowHtml('fat', 'gf', 'Fat', g)}${glRowHtml('fiber', 'gb', 'Fiber', g)}</div>
      <div class="gl-check" id="gcheck" aria-live="polite"></div>
      <details class="gl-more"><summary>Limits and other targets</summary>
        <p class="muted" style="font-size:14px;margin-top:8px">Leave a box empty to use the common reference shown. These show in Diary under All nutrients.</p>
        <div class="gl-grid">${NUT_X.map(n => fld('gx-' + n.k, n.n + (n.kind === 'limit' ? ' (limit)' : ''), g.x && g.x[n.k] ? g.x[n.k] : '', n.u, 'Reference ' + n.def + ' ' + n.u)).join('')}</div>
      </details>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button type="submit" class="btn primary" style="flex:1 1 160px">Save goals</button>${S.goals ? '<button type="button" class="btn" data-act="goals-clear">Remove goals</button>' : ''}</div>
    </form>
    <div class="side">
      <section class="card pad" id="calc">
        <h2 style="font-size:17px">Work out your numbers</h2>
        <p class="muted" style="font-size:14px;margin-top:6px">An estimate from the Mifflin-St Jeor formula. It stays on this device.</p>
        <div class="gl-grid two" style="margin-top:12px">
          <div class="gl-f"><label for="cs">Sex</label><select class="field" id="cs"><option value="m"${p.sex !== 'f' ? ' selected' : ''}>Male</option><option value="f"${p.sex === 'f' ? ' selected' : ''}>Female</option></select></div>
          ${fld('ca', 'Age', p.age, 'years')}
          ${fld('ch', 'Height', p.cm, 'cm')}
          ${fld('cw', 'Weight', p.kg || lastW ? wShow(p.kg || lastW) : '', wu)}
        </div>
        <div class="gl-f" style="margin-top:12px"><label for="cact">Activity</label><select class="field" id="cact">${ACTIVITY.map(([v, n, h]) => `<option value="${v}"${String(p.act || '1.375') === v ? ' selected' : ''}>${n}: ${h}</option>`).join('')}</select></div>
        <div class="gl-f" style="margin-top:12px"><label for="cgoal">Goal</label><select class="field" id="cgoal">${GOAL_KIND.map(([v, n]) => `<option value="${v}"${(p.goal || 'maintain') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <button class="btn" style="margin-top:16px;width:100%" data-act="goals-calc">Calculate</button>
        <div id="cresult" aria-live="polite"></div>
      </section>
      ${adaptiveCard(p)}
      ${mealPlanCard()}
      <section class="card pad">
        <h2 style="font-size:17px">Weight unit</h2>
        <div class="opts" role="radiogroup" aria-label="Weight unit" style="margin-top:10px">${['kg', 'lb'].map(u => `<button type="button" class="opt" role="radio" aria-checked="${wu === u}" data-act="wunit" data-v="${u}">${u === 'kg' ? 'Kilograms' : 'Pounds'}</button>`).join('')}</div>
      </section>
    </div>
  </div>`;
}
const GOAL_RATE = { lose: -0.5, maintain: 0, gain: 0.25 }; // kg a week, used until you set your own
function adaptiveRate(p) { return S.plan ? S.plan.rate : p && Number.isFinite(Number(p.rate)) && p.rate !== null ? Number(p.rate) : GOAL_RATE[(p && p.goal) || 'maintain']; }
let ADAPT_WIN = 0; // 7, 14 or 28 days; read from storage on first use because app.js defines store after this file
const adaptWin = () => { if (!ADAPT_WIN) { const v = Number(store.get('awin', 7)); ADAPT_WIN = [7, 14, 28].includes(v) ? v : 7; } return ADAPT_WIN; };
function adaptiveCard(p, live) {
  const end = IDX.dates[IDX.dates.length - 1], g = S.goals, rate = S.plan ? S.plan.rate : live != null ? live : adaptiveRate(p), a = courseCorrection(IDX.byDate, S.weights, end, rate, g && g.kcal, adaptWin(), { cm: (p || {}).cm, meals: (p || {}).meals, macros: g && g.kcal > 0 ? g : null });
  const rateField = S.plan
    ? `<p class="muted dz-small" style="margin-top:10px">Wanted change: <b>${wShowRate(rate)} ${esc(S.wunit)} a week</b>, from your weight plan. Change it on the <a href="#weight">Weight tab</a>.</p>`
    : `<div class="gl-f" style="margin-top:10px"><label for="arate">Wanted change in weight, ${esc(S.wunit)} a week (minus to lose)</label><div class="gl-in"><input class="field" id="arate" inputmode="decimal" value="${esc(wShowRate(rate))}" autocomplete="off"><span>${esc(S.wunit)}/wk</span></div></div>`;
  const head = `<h2 style="font-size:17px">Course correction</h2><p class="muted" style="font-size:14px;margin-top:6px">Checks your recent intake and weight against the rate you want, using 7,500 kcal per kg of body weight. It only suggests. Nothing changes unless you apply it.</p>
    <div class="opts" role="radiogroup" aria-label="Look back over" style="margin-top:10px">${[7, 14, 28].map(n => `<button type="button" class="opt" role="radio" aria-checked="${adaptWin() === n}" data-act="awin" data-v="${n}">${n === 7 ? 'Last week' : n === 14 ? '2 weeks' : '4 weeks'}</button>`).join('')}</div>${rateField}`;
  const body = !a || !a.ok ? `<p class="dz-small" style="margin-top:10px">${esc(a ? a.why : 'Log some food first.')}</p>` : (() => {
    const mv = a.observed === 0 ? 'stayed level' : `${a.observed > 0 ? 'rose' : 'fell'} ${wShowRate(Math.abs(a.observed))} ${S.wunit} a week`;
    const need = a.perDay === 0 ? 'hold your weight' : `${a.perDay < 0 ? 'a deficit' : 'a surplus'} of ${n0(Math.abs(a.perDay))} kcal a day`;
    const when = a.days === 7 ? 'the last 7 days' : `the last ${a.days} days`;
    return `<div class="gl-res"><p class="muted dz-small">Over ${when} you ate ${n0(a.intake)} kcal a day and your weight ${mv}, so you burn about ${n0(a.maint)} kcal a day. Your aim needs ${need}. ${a.days === 7 ? 'A single week is noisy, so treat this as a nudge. Use a longer look back for a steadier estimate.' : 'A longer look back smooths out water weight but reacts more slowly to changes.'}</p>
      ${a.notes.map(t => `<p class="dz-small" style="color:var(--offer-ink);margin-top:8px">${esc(t)}</p>`).join('')}
      ${a.onTrack ? `<p><b>On track.</b> Keep ${n0(a.base)} kcal a day.</p>` : `<p><b>${a.delta > 0 ? 'Add' : 'Cut'} about ${n0(Math.abs(a.delta))} kcal a day</b>, to ${n0(a.aim)} kcal${g && g.kcal ? ` (now ${n0(a.base)})` : ''}.</p>${a.macros ? `<p class="muted dz-small">Protein stays at ${n0(a.macros.pro)} g. Carbs ${n0(a.macros.carb)} g and fat ${n0(a.macros.fat)} g take the change.</p>` : ''}<button class="btn" style="width:100%" data-act="goals-adaptive" data-kcal="${a.aim}"${a.macros ? ` data-macros='${esc(JSON.stringify(a.macros))}'` : ''}>Fill ${a.macros ? 'these targets' : n0(a.aim) + ' kcal'} into the form</button>`}</div>`;
  })();
  return `<section class="card pad" id="adapt">${head}${body}</section>`;
}
// Rates are kept in kg a week. This shows and reads them in the chosen weight unit.
function wShowRate(kg) { return String(Math.round((S.wunit === 'lb' ? kg * KG_LB : kg) * 100) / 100); }
function wParseRate(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? (S.wunit === 'lb' ? n / KG_LB : n) : null; }
function mealPlanCard() {
  const g = S.goals, p = (g && g.profile) || {};
  if (!g || !(g.kcal > 0)) return `<section class="card pad" id="mealplan"><h2 style="font-size:17px">Meal plan for the day</h2><p class="muted dz-small" style="margin-top:6px">Save your daily goals first, then this splits them over your meals.</p></section>`;
  const n = [4, 5, 6].includes(Number(p.meals)) ? Number(p.meals) : 4, wake = p.wake || '07:00', train = p.train || '';
  const rows = mealSplit({ pro: g.pro, carb: g.carb, fat: g.fat }, n, wake, train);
  return `<section class="card pad" id="mealplan"><h2 style="font-size:17px">Meal plan for the day</h2>
    <p class="muted dz-small" style="margin-top:6px">Your daily targets split over the day. Carbs sit around your training, fat is kept low in those two meals, and the last meal is the largest. Every meal keeps at least 5 g of fat and 5 g of carbs.</p>
    <div class="gl-grid two" style="margin-top:10px"><div class="gl-f"><label for="mn">Meals</label><select class="field" id="mn">${[4, 5, 6].map(v => `<option value="${v}"${v === n ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="gl-f"><label for="mw">Wake time</label><input class="field" id="mw" type="time" value="${esc(wake)}"></div></div>
    <div class="gl-f" style="margin-top:10px"><label for="mt">Training time (empty on a rest day)</label><input class="field" id="mt" type="time" value="${esc(train)}"></div>
    <div style="margin-top:12px;overflow-x:auto"><table class="mtab"><thead><tr><th scope="col">Meal</th><th scope="col">kcal</th><th scope="col">P</th><th scope="col">C</th><th scope="col">F</th></tr></thead><tbody>${rows.map((r, i) => `<tr><th scope="row">${i + 1}. ${esc(r.time)}${r.tag ? `<small class="muted"> ${esc(r.tag)}</small>` : ''}</th><td>${n0(r.kcal)}</td><td>${r.pro}</td><td>${r.carb}</td><td>${r.fat}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted dz-small" style="margin-top:8px">Grams of protein, carbs and fat per meal. Press Save goals to keep the meal settings.</p></section>`;
}
document.addEventListener('change', e => {
  if (!e.target || !['mn', 'mw', 'mt'].includes(e.target.id)) return;
  const g = S.goals, card = $('#mealplan'); if (!g || !card) return;
  const pr = readProfile(); S.goals = { ...g, profile: { ...(g.profile || {}), meals: pr.meals, wake: pr.wake || '07:00', train: pr.train || '' } };
  card.outerHTML = mealPlanCard(); S.goals = g; const f = $('#' + e.target.id); if (f) f.focus();
});
/* ---------- linked targets: energy and macros follow each other ---------- */
const GL_CAL = { pro: 4, carb: 4, fat: 9 };
const GL_MODES = {
  pro: [['g', 'g'], ['pct', '% of energy'], ['kg', 'g per kg'], ['rest', 'the rest']], carb: [['g', 'g'], ['pct', '% of energy'], ['kg', 'g per kg'], ['rest', 'the rest']],
  fat: [['g', 'g'], ['pct', '% of energy'], ['kg', 'g per kg'], ['rest', 'the rest']], fiber: [['g', 'g'], ['per1000', 'g per 1,000 kcal']],
};
function glEnergyHtml(g) {
  return `<div class="gl-energy"><div class="gl-f"><label for="gk">Energy</label><div class="gl-in"><input class="field" id="gk" inputmode="decimal" value="${esc(g.kcal ?? '')}" autocomplete="off"><span>kcal</span></div></div>
    <label class="cmp gl-sum"><input type="checkbox" id="gk-sum"${g.kmode === 'sum' ? ' checked' : ''}><span>Add up from my macros</span></label></div>`;
}
function glRowHtml(key, id, label, g) {
  const mode = (g.m && g.m[key]) || 'g', val = mode === 'rest' ? '' : (g.v && key in g.v ? g.v[key] : g[key]);
  return `<div class="gl-mrow gl-f" data-k="${key}"><label for="${id}">${label}</label><div class="gl-in"><input class="field" id="${id}" inputmode="decimal" value="${esc(val ?? '')}" autocomplete="off"${mode === 'rest' ? ' readonly' : ''}>
    <select class="field" id="${id}-m" data-prev="${mode}" aria-label="${label} target type">${GL_MODES[key].map(([v, n]) => `<option value="${v}"${v === mode ? ' selected' : ''}>${n}</option>`).join('')}</select></div><small class="muted" id="${id}-h"></small></div>`;
}
const GL_IDS = { pro: 'gp', carb: 'gc', fat: 'gf', fiber: 'gb' };
function glBody() {
  const cw = $('#cw'), w = cw ? wParse(cw.value) : 0;
  return w > 0 ? w : (S.goals && S.goals.profile && S.goals.profile.kg) || (S.weights.length ? S.weights[S.weights.length - 1].kg : 0);
}
// Read the form and work out grams for every macro, whatever way each one is entered.
function glCompute() {
  const val = id => num(($('#' + id) || {}).value), sum = !!($('#gk-sum') || {}).checked, bw = glBody();
  const mode = k => (($('#' + GL_IDS[k] + '-m') || {}).value) || 'g';
  const out = { pro: 0, carb: 0, fat: 0, fiber: 0, kcal: val('gk'), bw, sum };
  const fixed = k => mode(k) === 'g' ? val(GL_IDS[k]) : mode(k) === 'kg' ? val(GL_IDS[k]) * bw : null;
  for (const k of ['pro', 'carb', 'fat']) { const f = fixed(k); if (f != null) out[k] = f; }
  if (sum) out.kcal = ['pro', 'carb', 'fat'].reduce((a, k) => a + out[k] * GL_CAL[k], 0);
  let restUsed = false;
  for (const k of ['pro', 'carb', 'fat']) if (mode(k) === 'pct') out[k] = out.kcal > 0 ? val(GL_IDS[k]) / 100 * out.kcal / GL_CAL[k] : 0;
  for (const k of ['pro', 'carb', 'fat']) if (mode(k) === 'rest' && !restUsed) { restUsed = true; const others = ['pro', 'carb', 'fat'].filter(x => x !== k).reduce((a, x) => a + out[x] * GL_CAL[x], 0); out[k] = Math.max(0, (out.kcal - others) / GL_CAL[k]); }
  out.fiber = mode('fiber') === 'per1000' ? val('gb') * out.kcal / 1000 : val('gb');
  return out;
}
const glR = v => Math.round(v * 10) / 10;
function goalsCheck() {
  if (!$('#goalform')) return;
  const c = glCompute(), el = $('#gcheck'), sum = c.sum;
  const kEl = $('#gk'); if (kEl) { kEl.readOnly = sum; if (sum) kEl.value = c.kcal > 0 ? String(Math.round(c.kcal)) : ''; }
  // pct and rest need a fixed energy; they cannot be used while energy is added up from the macros
  for (const k of ['pro', 'carb', 'fat']) { const m = $('#' + GL_IDS[k] + '-m'); if (m) [...m.options].forEach(o => { o.disabled = (o.value === 'pct' || o.value === 'rest') && sum || (o.value === 'kg' && !(c.bw > 0)); }); }
  const fm = $('#gb-m'); if (fm) [...fm.options].forEach(o => { o.disabled = o.value === 'per1000' && sum; });
  for (const k of ['pro', 'carb', 'fat', 'fiber']) {
    const id = GL_IDS[k], inp = $('#' + id), mode = (($('#' + id + '-m') || {}).value) || 'g', h = $('#' + id + '-h'); if (!inp || !h) continue;
    inp.readOnly = mode === 'rest'; if (mode === 'rest') inp.value = '';
    const g = c[k], bits = [];
    if (mode !== 'g') bits.push(`${n0(g)} g`);
    if (k !== 'fiber' && mode !== 'pct' && c.kcal > 0) bits.push(`${Math.round(g * GL_CAL[k] / c.kcal * 100)}% of energy`);
    if (mode !== 'kg' && c.bw > 0 && k !== 'fiber') bits.push(`${glR(g / c.bw)} g per kg`);
    if (k === 'fiber' && mode !== 'per1000' && c.kcal > 0) bits.push(`${glR(g / c.kcal * 1000)} g per 1,000 kcal`);
    h.textContent = bits.join(' · ');
  }
  if (!el) return;
  const e = c.pro * 4 + c.carb * 4 + c.fat * 9;
  if (!(c.kcal > 0) || !(e > 0)) { el.innerHTML = ''; return; }
  const off = Math.abs(e - c.kcal) / c.kcal > 0.04;
  const canScale = !c.sum && ['pro', 'carb', 'fat'].some(k => ['g', 'kg'].includes((($('#' + GL_IDS[k] + '-m') || {}).value) || 'g'));
  el.innerHTML = off
    ? `<p>Protein, carbs and fat add up to <b>${n0(e)} kcal</b>, ${e > c.kcal ? n0(e - c.kcal) + ' above' : n0(c.kcal - e) + ' below'} your energy target.</p><div class="gl-fix">${!c.sum ? `<button type="button" class="btn sm" data-act="gl-set-kcal">Set energy to ${n0(e)} kcal</button>` : ''}${canScale ? `<button type="button" class="btn sm" data-act="gl-scale">Scale macros to ${n0(c.kcal)} kcal</button>` : ''}</div>`
    : `<p>Protein, carbs and fat add up to ${n0(e)} kcal. That matches your energy target.</p>`;
}
// Changing how a macro is entered keeps its grams the same, so the target does not jump.
function glModeChange(sel) {
  const key = Object.keys(GL_IDS).find(k => GL_IDS[k] + '-m' === sel.id); if (!key) return;
  const prev = sel.dataset.prev, now = sel.value, id = GL_IDS[key];
  sel.value = prev; const before = glCompute(); sel.value = now; sel.dataset.prev = now;
  const grams = before[key], inp = $('#' + id);
  if (now === 'g') inp.value = glR(grams);
  else if (now === 'pct') inp.value = before.kcal > 0 ? glR(grams * GL_CAL[key] / before.kcal * 100) : '';
  else if (now === 'kg') inp.value = before.bw > 0 ? Math.round(grams / before.bw * 100) / 100 : '';
  else if (now === 'per1000') inp.value = before.kcal > 0 ? glR(grams / before.kcal * 1000) : '';
  else if (now === 'rest') inp.value = '';
  goalsCheck();
}
function glSumToggle() {
  if ($('#gk-sum').checked) {
    $('#gk-sum').checked = false; const c = glCompute(); $('#gk-sum').checked = true;
    for (const k of ['pro', 'carb', 'fat']) { const m = $('#' + GL_IDS[k] + '-m'); if (m && (m.value === 'pct' || m.value === 'rest')) { $('#' + GL_IDS[k]).value = glR(c[k]); m.value = 'g'; m.dataset.prev = 'g'; } }
    const fm = $('#gb-m'); if (fm && fm.value === 'per1000') { $('#gb').value = glR(c.fiber); fm.value = 'g'; fm.dataset.prev = 'g'; }
  }
  goalsCheck();
}
// Energy that fits the macros. Percent macros move with energy, so solve for the point where they all add up.
function glSetKcal() {
  const c = glCompute(), mode = k => (($('#' + GL_IDS[k] + '-m') || {}).value) || 'g';
  let fixed = 0, pct = 0;
  for (const k of ['pro', 'carb', 'fat']) { if (mode(k) === 'pct') pct += num($('#' + GL_IDS[k]).value) / 100; else fixed += c[k] * GL_CAL[k]; }
  const kcal = pct < 0.99 ? fixed / (1 - pct) : c.pro * 4 + c.carb * 4 + c.fat * 9;
  $('#gk').value = Math.round(kcal); goalsCheck();
}
function glScale() {
  const c = glCompute(), e = c.pro * 4 + c.carb * 4 + c.fat * 9; if (!(e > 0) || !(c.kcal > 0)) return;
  const f = c.kcal / e;
  for (const k of ['pro', 'carb', 'fat']) { const m = $('#' + GL_IDS[k] + '-m'); if (m && (m.value === 'g' || m.value === 'kg')) { const inp = $('#' + GL_IDS[k]); inp.value = m.value === 'kg' ? Math.round(num(inp.value) * f * 100) / 100 : Math.round(num(inp.value) * f); } }
  goalsCheck();
}
function glReset() { for (const k of ['pro', 'carb', 'fat', 'fiber']) { const m = $('#' + GL_IDS[k] + '-m'); if (m) { m.value = 'g'; m.dataset.prev = 'g'; } } const s = $('#gk-sum'); if (s) s.checked = false; }
function readProfile() {
  const v = id => ($('#' + id) || {}).value;
  const ar = $('#arate'), pr = (S.goals && S.goals.profile) || {};
  return { sex: v('cs'), age: num(v('ca')), cm: num(v('ch')), kg: wParse(v('cw')), act: v('cact'), goal: v('cgoal'), rate: ar ? wParseRate(ar.value) : (pr.rate ?? null), meals: $('#mn') ? Number(v('mn')) : (pr.meals || 4), wake: $('#mw') ? v('mw') : (pr.wake || '07:00'), train: $('#mt') ? v('mt') : (pr.train || '') };
}
function saveGoals() {
  const c = glCompute(), v = id => num(($('#' + id) || {}).value), modes = {}, vals = {};
  for (const k of ['pro', 'carb', 'fat', 'fiber']) { modes[k] = (($('#' + GL_IDS[k] + '-m') || {}).value) || 'g'; vals[k] = modes[k] === 'rest' ? '' : v(GL_IDS[k]); }
  const g = { kcal: Math.round(c.kcal), pro: Math.round(c.pro), carb: Math.round(c.carb), fat: Math.round(c.fat), fiber: Math.round(c.fiber), kmode: c.sum ? 'sum' : 'set', m: modes, v: vals, x: {}, profile: (S.goals && S.goals.profile) || null };
  for (const n of NUT_X) { const x = v('gx-' + n.k); if (x > 0) g.x[n.k] = x; }
  const pr = readProfile(); if (pr.age > 0 || pr.cm > 0 || pr.kg > 0 || pr.rate != null) g.profile = pr;
  if (!(g.kcal > 0)) { toast('Enter an energy target first'); return; }
  S.goals = g; saveAll(); go('day'); toast('Goals saved');
}

/* ---------- weight ---------- */
function openWeight() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const last = S.weights.length ? S.weights[S.weights.length - 1] : null;
  dlg.innerHTML = `<form id="wform" method="dialog"><h2 id="dlg-title" style="font-size:20px">Log weight</h2>
    <div><label for="wd">Day</label><input class="field" style="width:100%" type="date" id="wd" value="${esc(S.day || todayIso())}"></div>
    <div><label for="wv">Weight (${S.wunit})</label><input class="field" style="width:100%" id="wv" inputmode="decimal" autocomplete="off" value="${last ? wShow(last.kg) : ''}"></div>
    <div id="werr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions"><button type="submit" class="btn primary" style="flex:1">Save</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  $('#wform').addEventListener('submit', ev => {
    ev.preventDefault();
    const date = $('#wd').value, kg = wParse($('#wv').value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('#werr').textContent = 'Choose a day.'; return; }
    if (!(kg >= 20 && kg <= 400)) { $('#werr').textContent = 'Enter a weight between 20 and 400 ' + (S.wunit === 'lb' ? 'lb.' : 'kg.').replace('400 lb', '880 lb').replace('20 and', '44 and'); return; }
    S.weights = S.weights.filter(w => w.date !== date).concat({ date, kg: Math.round(kg * 100) / 100 }).sort((a, b) => a.date < b.date ? -1 : 1);
    saveAll(); $('#dlg').close(); render(); toast('Weight saved');
  });
  if (!dlg.open) dlg.showModal(); $('#wv').focus(); $('#wv').select();
}

/* ---------- quick add and copy ---------- */
function openQuick(date) {
  const dlg = $('#dlg'); dlg.classList.remove('wide'); const d0 = date || S.day || todayIso();
  dlg.innerHTML = `<form id="qform" method="dialog"><h2 id="dlg-title" style="font-size:20px">Quick add</h2>
    <p class="muted" style="font-size:14px">Log calories and macros without picking a food. It has no price.</p>
    <div><label for="qn">Name</label><input class="field" style="width:100%" id="qn" autocomplete="off" placeholder="For example, Restaurant lunch"></div>
    <div class="gl-grid two"><div class="gl-f"><label for="qd">Day</label><input class="field" type="date" id="qd" value="${esc(d0)}"></div><div class="gl-f"><label for="qg">Meal</label><select class="field" id="qg">${MEAL_BASE.map(g => `<option>${g}</option>`).join('')}</select></div></div>
    <div class="gl-grid two"><div class="gl-f"><label for="qk">Energy (kcal)</label><input class="field" id="qk" inputmode="decimal"></div><div class="gl-f"><label for="qp">Protein (g)</label><input class="field" id="qp" inputmode="decimal"></div><div class="gl-f"><label for="qc">Carbs (g)</label><input class="field" id="qc" inputmode="decimal"></div><div class="gl-f"><label for="qf">Fat (g)</label><input class="field" id="qf" inputmode="decimal"></div></div>
    <div id="qerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions"><button type="submit" class="btn primary" style="flex:1">Add to diary</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title');
  $('#qform').addEventListener('submit', ev => {
    ev.preventDefault();
    const v = id => num($('#' + id).value), date = $('#qd').value, kcal = v('qk'), pro = v('qp'), carb = v('qc'), fat = v('qf');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('#qerr').textContent = 'Choose a day.'; return; }
    if (!(kcal > 0 || pro > 0 || carb > 0 || fat > 0)) { $('#qerr').textContent = 'Enter calories or at least one macro.'; return; }
    const name = $('#qn').value.trim() || 'Quick add';
    S.entries.push({ date, group: $('#qg').value, name, src: name, qty: 1, unit: 'serving', type: 'count', kcal: r2(kcal || pro * 4 + carb * 4 + fat * 9), pro: r2(pro), carb: r2(carb), fat: r2(fat), fiber: 0, q: true });
    S.entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    reindex(); ensurePrices(); saveEntries(); saveAll(); S.day = date; $('#dlg').close(); go('day'); render(); toast('Added to ' + dMed(date));
  });
  if (!dlg.open) dlg.showModal(); $('#qn').focus();
}
// Copy what you ate on the nearest earlier day that has entries (all meals, or just one) to the day on screen.
/* copy a whole day to another date, for planning ahead */
function openCopyTo(day) {
  const es = IDX.byDate.get(day) || [];
  if (!es.length) { toast('This day has nothing to copy yet'); return; }
  const dlg = $('#dlg'); dlg.className = '';
  dlg.innerHTML = `<form method="dialog" id="ctform"><h2 id="dlg-title" style="font-size:20px">Copy this day</h2>
    <p class="muted" style="font-size:14px">Copies the ${es.length} ${es.length === 1 ? 'food' : 'foods'} from ${esc(dMed(day))} to another date. Handy for planning your week.</p>
    <div class="gl-f"><label for="ctd">Copy to</label><input class="field" style="width:100%" type="date" id="ctd" value="${isoAdd(day, 1)}"></div>
    <label class="cmp"><input type="checkbox" id="ctw"><span>Also copy to the same day for the next 4 weeks</span></label>
    <div id="cterr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Copy</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
  $('#ctform').addEventListener('submit', ev => {
    ev.preventDefault(); const to = $('#ctd').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) { $('#cterr').textContent = 'Choose a date.'; return; }
    const dates = [to]; if ($('#ctw').checked) for (let i = 1; i <= 4; i++) dates.push(isoAdd(to, 7 * i));
    const add = []; for (const d of dates) for (const { src: s, ...e } of es) add.push({ ...e, src: s, date: d, name: s !== undefined ? s : e.name });
    S.entries = S.entries.concat(add).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    reindex(); ensurePrices(); saveEntries(); saveAll(); dlg.close(); S.day = to; render(); toast(`Copied to ${dates.length} ${dates.length === 1 ? 'day' : 'days'}`);
  });
}
function copyEarlier(group) {
  const day = S.day || todayIso(); let src = null;
  for (let i = 1; i <= 60; i++) {
    const d = isoAdd(day, -i), es = (IDX.byDate.get(d) || []).filter(e => !group || mkey(e.group) === mkey(group));
    if (es.length) { src = { d, es }; break; }
  }
  if (!src) { toast(group ? 'No earlier ' + group.toLowerCase() + ' found to copy' : 'No earlier day found to copy'); return; }
  const copy = src.es.map(({ src: s, ...e }) => ({ ...e, src: s, date: day, name: s !== undefined ? s : e.name }));
  S.entries = S.entries.concat(copy).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  reindex(); ensurePrices(); saveEntries(); saveAll(); render();
  toast(`Copied ${copy.length} ${copy.length === 1 ? 'food' : 'foods'} from ${dMed(src.d)}`);
}

/* ---------- events ---------- */
/* ---------- how big is one serving? Cronometer exports a count (3 servings) without a weight ---------- */
function openServing(name) {
  const dlg = $('#dlg'), p = S.prices[name] || {}, m = IDX.meta.get(name) || { unit: 'serving' };
  dlg.classList.remove('wide'); dlg.className = '';
  dlg.innerHTML = `<form method="dialog" id="svform"><h2 id="dlg-title" style="font-size:20px">Size of one ${esc(m.unit)}</h2>
    <p class="muted" style="font-size:14px">${esc(name)} is logged by the ${esc(m.unit)}, and the Cronometer export does not say how much that weighs. Enter it once and every day uses it, so a per-kg price works and the weight shows in the Diary.</p>
    <div class="gl-f"><label for="svg">One ${esc(m.unit)} weighs</label><div class="gl-in"><input class="field" id="svg" inputmode="decimal" value="${esc(p.gpu || '')}" placeholder="for example 100" autocomplete="off"><span>g</span></div></div>
    <div id="sverr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Save</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal(); $('#svg').focus();
  $('#svform').addEventListener('submit', ev => {
    ev.preventDefault(); const g = num($('#svg').value);
    if (!(g > 0 && g <= 5000)) { $('#sverr').textContent = 'Enter the weight in grams, for example 100.'; return; }
    if (!S.prices[name]) S.prices[name] = { price: '', basis: 'kg', gpu: '' };
    S.prices[name].gpu = g; dlg.close(); saveAll(); render(); toast(`One ${m.unit} of ${name} is now ${n0(g)} g`);
  });
}
function diaryAct(a, d) {
  if (a.startsWith('ch-')) return chartsAct(a, d);
  switch (a) {
    case 'serving-size': openServing(d.name); return true;
    case 'week-step': S.day = isoAdd(S.day || todayIso(), 7 * Number(d.dir)); render(); return true;
    case 'copy-to': openCopyTo(d.date); return true;
    case 'gl-set-kcal': glSetKcal(); return true;
    case 'gl-scale': glScale(); return true;
    case 'meal-fold': { const f = mealPref.fold, i = f.indexOf(d.key); if (i < 0) f.push(d.key); else f.splice(i, 1); store.set('mfold', f); render(); return true; }
    case 'meal-hide-empty': S.hideEmpty = !mealPref.hideEmpty; store.set('hideEmpty', S.hideEmpty); render(); return true;
    case 'meal-arrange': S.arrange = !S.arrange; render(); return true;
    case 'meal-move': {
      const day = S.day, es = IDX.byDate.get(day) || [], grouped = new Map(groupEntries(es).map(([g, l]) => [mkey(g), [g, l]]));
      const all = orderSections(MEAL_BASE.map(b => { const hit = grouped.get(mkey(b)); grouped.delete(mkey(b)); return [hit ? hit[0] : b, hit ? hit[1] : []]; }).concat([...grouped.values()]));
      moveMeal(d.key, Number(d.dir), all); render(); return true;
    }
    case 'goals': go('goals'); return true;
    case 'goals-clear': if (confirm('Remove your daily goals?')) { S.goals = null; saveAll(); go('day'); toast('Goals removed'); } return true;
    case 'goals-calc': {
      const pr = readProfile(), plan = energyPlan(pr), box = $('#cresult');
      if (!plan) { box.innerHTML = '<p class="dz-small" style="margin-top:12px;color:var(--offer-ink)">Enter your age, height and weight.</p>'; return true; }
      box.innerHTML = `<div class="gl-res"><p class="muted dz-small">Resting ${n0(plan.bmr)} kcal. With your activity ${n0(plan.tdee)} kcal a day.</p><p><b>${n0(plan.kcal)} kcal</b>, ${plan.pro} g protein, ${plan.carb} g carbs, ${plan.fat} g fat, ${plan.fiber} g fiber</p><button class="btn primary" style="width:100%" data-act="goals-use" data-plan='${esc(JSON.stringify(plan))}'>Use these targets</button></div>`;
      return true;
    }
    case 'goals-use': {
      const p = JSON.parse(d.plan); const set = (id, v) => { $('#' + id).value = v; };
      glReset(); set('gk', p.kcal); set('gp', p.pro); set('gc', p.carb); set('gf', p.fat); set('gb', p.fiber); goalsCheck(); toast('Filled in. Press Save goals to keep them.'); return true;
    }
    case 'goals-adaptive': { glReset(); $('#gk').value = d.kcal; if (d.macros) { const m = JSON.parse(d.macros); $('#gp').value = m.pro; $('#gc').value = m.carb; $('#gf').value = m.fat; } goalsCheck(); toast('Filled in. Press Save goals to keep it.'); return true; }
    case 'awin': { ADAPT_WIN = Number(d.v); store.set('awin', ADAPT_WIN); const card = $('#adapt'); if (card) card.outerHTML = adaptiveCard(readProfile()); return true; }
    case 'plan-edit': openPlan(); return true;
    case 'plan-suggest': {
      const ph = $('#plp').value, wk = num($('#pln').value), kg = wParse($('#plw').value), h = $('#plhint');
      if (ph === 'maintain') { $('#plr').value = wShowRate(0); h.textContent = 'Maintenance holds your weight.'; return true; }
      if (!(kg > 0)) { h.textContent = 'Enter your start weight first.'; return true; }
      if (ph === 'cut') { const pct = suggestPct(wk), r = -pct * kg / 100; $('#plr').value = wShowRate(r); h.textContent = `${pct}% of body weight a week, which suits a ${Math.min(12, Math.max(6, wk || 8))} week diet in RP's analysis of 10,000 diets. Over ${wk || 8} weeks that is about ${(pct * (wk || 8)).toFixed(1)}% of your weight.`; }
      else { $('#plr').value = wShowRate(GOAL_RATE.gain); h.textContent = 'The app default for building muscle. RP does not publish a rate for gaining.'; }
      return true;
    }
    case 'plan-remove': S.plan = null; saveAll(); $('#dlg').close(); render(); toast('Weight plan removed'); return true;
    case 'wunit': S.wunit = d.v; saveAll(); render(); return true;
    case 'log-weight': openWeight(); return true;
    case 'quick-add': openQuick(d.date); return true;
    case 'copy-prev': copyEarlier(d.group); return true;
    case 'prange': S.prange = Number(d.v); render(); return true;
    case 'goto-diary': go('day'); return true;
    case 'del-weight': S.weights = S.weights.filter(w => w.date !== d.date); saveAll(); render(); toast('Weigh-in deleted'); return true;
    case 'today': S.day = todayIso(); render(); return true;
    case 'pick-day': S.day = d.date; render(); return true;
    case 'prev-day': S.day = isoAdd(S.day || todayIso(), -1); render(); return true;
    case 'next-day': S.day = isoAdd(S.day || todayIso(), 1); render(); return true;
  }
  return false;
}
document.addEventListener('change', e => {
  if (!e.target || e.target.id !== 'arate') return;
  const r = wParseRate(e.target.value), card = $('#adapt'); if (!card || r === null || Math.abs(r) > 2) return;
  card.outerHTML = adaptiveCard(readProfile(), r); const f = $('#arate'); if (f) f.focus();
});
document.addEventListener('input', e => { const t = e.target; if (!t.closest || !t.closest('#goalform, #calc') || t.tagName === 'SELECT' || t.type === 'checkbox') return; goalsCheck(); });
document.addEventListener('change', e => { const t = e.target; if (!t || !t.closest || !t.closest('#goalform')) return; if (t.id === 'gk-sum') glSumToggle(); else if (/^g[pcfb]-m$/.test(t.id)) glModeChange(t); });
document.addEventListener('submit', e => { if (e.target.id === 'goalform') { e.preventDefault(); saveGoals(); } });
document.addEventListener('change', e => { if (e.target.id === 'daypick' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { S.day = e.target.value; render(); } });

/* ---------- progress: nutrition and weight ---------- */
const PNAV = [['progress', 'Nutrition'], ['weight', 'Weight'], ['week', 'Spending'], ['trends', 'Trends'], ['charts', 'Charts']];
function progNav(cur) {
  return `<nav class="subnav" aria-label="Progress sections">${PNAV.map(([t, l]) => `<a href="#${t}"${t === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
}
function pBars(vals, labels, goal, cls) {
  const W = 640, H = 190, pl = 6, pr = 6, pb = 24, pt = 10, n = vals.length;
  const top = Math.max(...vals, goal || 0, 1) * 1.1, bw = (W - pl - pr) / n, gap = Math.min(6, bw * .25);
  const y = v => pt + (H - pt - pb) * (1 - v / top), step = Math.ceil(n / 8);
  const bars = vals.map((v, i) => v > 0 ? `<rect x="${(pl + i * bw + gap / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(2, bw - gap).toFixed(1)}" height="${(H - pb - y(v)).toFixed(1)}" rx="2" class="${goal && v > goal * 1.05 ? 'pc-bar over' : 'pc-bar'}"><title>${esc(labels[i])}: ${n0(v)}</title></rect>` : '').join('');
  const ticks = labels.map((l, i) => i % step === 0 || i === n - 1 ? `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="tick">${esc(l)}</text>` : '').join('');
  const gl = goal ? `<line x1="0" x2="${W}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" class="goal"/><text x="${W - 2}" y="${(y(goal) - 4).toFixed(1)}" text-anchor="end" class="tick">Goal ${n0(goal)}</text>` : '';
  return `<svg class="pchart ${cls || ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${gl}${bars}<line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" class="axis"/>${ticks}</svg>`;
}
function progressView() {
  const rng = [7, 14, 30, 90].includes(S.prange) ? S.prange : 7, end = todayIso(), start = isoAdd(end, -(rng - 1));
  const days = []; for (let d = start; d <= end; d = isoAdd(d, 1)) days.push(d);
  const logged = days.filter(d => (IDX.byDate.get(d) || []).length), nL = logged.length;
  const seg = `<div class="seg" role="group" aria-label="Period" style="margin-top:14px">${[7, 14, 30, 90].map(r => `<button data-act="prange" data-v="${r}" aria-pressed="${r === rng}">${r} days</button>`).join('')}</div>`;
  const head = `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Nutrition</h1></div>`;
  if (!nL) return head + seg + `<div class="card pad" style="margin-top:18px;max-width:560px"><h2 style="font-size:17px">Nothing logged in these ${rng} days</h2><p class="muted" style="margin-top:8px">Add food in the Diary and your averages show up here.</p><button class="btn primary" style="margin-top:14px" data-act="goto-diary">Open Diary</button></div>`;
  const tot = nutTotals(logged.flatMap(d => IDX.byDate.get(d))), avg = k => tot[k] / nL, gk = goalFor('kcal');
  const per = days.map(d => (IDX.byDate.get(d) || []).reduce((a, e) => a + (e.kcal || 0), 0));
  const labels = days.map(d => rng <= 14 ? dFmt(d, { weekday: 'short' }).slice(0, 3) : dFmt(d, { day: 'numeric', month: 'short' }));
  const rows = [['pro', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat'], ['fiber', 'Fiber']].map(([k, n]) => {
    const v = avg(k), gl = goalFor(k), hit = gl ? logged.filter(d => nutTotals(IDX.byDate.get(d))[k] >= gl * .9).length : 0;
    return `<div class="dz-mrow ${MC[k]}"><div class="dz-mhead"><span>${n}</span><b>${n0(v)}${gl ? `<small> / ${n0(gl)} g</small>` : '<small> g</small>'}</b></div>${dzBar(v, gl, MC[k], n)}${gl ? `<small class="muted">Goal met on ${hit} of ${nL} days</small>` : ''}</div>`;
  }).join('');
  const have = NUT_X.some(n => tot.x[n.k] > 0);
  const micro = have ? `<details class="card dz-nut" style="margin-top:20px"><summary>Vitamins, minerals and limits (daily average)</summary>${[...new Set(NUT_X.map(n => n.grp))].map(gr => `<h3 class="dz-gh">${gr}</h3>${NUT_X.filter(n => n.grp === gr).map(n => { const v = (tot.x[n.k] || 0) / nL, gl = goalFor(n.k), lim = n.kind === 'limit'; return `<div class="dz-mrow"><div class="dz-mhead"><span>${n.n}${lim ? ' <small class="muted">limit</small>' : ''}</span><b>${nfx(v)}<small> / ${nfx(gl)} ${n.u}</small></b></div>${dzBar(v, gl, lim ? 'm-lim' : 'm-fib', n.n)}</div>`; }).join('')}`).join('')}</details>` : '';
  const sm = summarize(logged.flatMap(d => IDX.byDate.get(d)));
  return head + seg + `
  <div class="cols dz-cols">
    <div class="main2">
      <section class="card dz-sum"><div class="dz-energy"><div><span class="dz-num">${n0(avg('kcal'))}</span><span class="dz-unit"> kcal a day on average</span></div>${gk ? `<b class="dz-left${avg('kcal') > gk * 1.05 ? ' over' : ''}">${avg('kcal') > gk ? '+' : ''}${n0(avg('kcal') - gk)} vs goal</b>` : ''}</div>
      ${pBars(per, labels, gk)}
      <p class="muted dz-small">${nL} of ${rng} days logged. Averages count logged days only.</p></section>
      ${micro}
    </div>
    <aside class="side"><section class="card dz-sum"><h2 style="font-size:17px">Macros, daily average</h2><div class="dz-macros" style="grid-template-columns:1fr">${rows}</div></section>
    <section class="card dz-cost"><div class="dz-costhead"><span>Spent on logged days</span><b>${money(sm.cost)}</b></div><p class="dz-small">${money(sm.cost / nL)} a day. <a href="#week">See spending</a></p></section></aside>
  </div>`;
}

function weightView() {
  const ws = S.weights, wu = S.wunit, plan = S.plan;
  const head = `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Weight</h1><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="plan-edit">${plan ? 'Edit plan' : 'Set a plan'}</button><button class="btn primary" data-act="log-weight">Log weight</button></div></div><div style="margin-top:14px;max-width:640px">${dropzone('weight')}</div>`;
  if (!ws.length) return head + `<div class="card pad" style="margin-top:18px;max-width:560px"><h2 style="font-size:17px">No weigh-ins yet</h2><p class="muted" style="margin-top:8px">Log your weight to see the trend next to what you eat. It stays on this device unless you sign in to sync.</p></div>`;
  const first = ws[0], last = ws[ws.length - 1], ch = last.kg - first.kg;
  const today = todayIso(), startD = plan && plan.start < first.date ? plan.start : first.date;
  const pend = plan ? (planFinish(plan) || planEnd(plan) || isoAdd(today > last.date ? today : last.date, 28)) : last.date;
  const endD = pend > last.date ? pend : last.date;
  const W = 640, H = 230, pl = 40, pr = 10, pt = 12, pb = 26, t0 = dObj(startD).getTime(), t1 = Math.max(dObj(endD).getTime(), t0 + 864e5 * 6);
  const planPts = plan ? [plan.start, endD].filter((d, i, a) => a.indexOf(d) === i).map(d => ({ date: d, kg: planKg(plan, d) })) : [];
  if (plan && plan.goalKg != null && planEnd(plan) && planEnd(plan) > plan.start && !planPts.some(q => q.date === planEnd(plan))) planPts.splice(1, 0, { date: planEnd(plan), kg: plan.goalKg });
  const vs = ws.map(w => w.kg).concat(planPts.map(q => q.kg)), lo = Math.min(...vs), hi = Math.max(...vs), pad_ = Math.max(.5, (hi - lo) * .15), a = lo - pad_, b = hi + pad_;
  const X = d => pl + (dObj(d).getTime() - t0) / (t1 - t0) * (W - pl - pr), Y = v => pt + (H - pt - pb) * (1 - (v - a) / (b - a));
  const pts = ws.map(w => `${X(w.date).toFixed(1)},${Y(w.kg).toFixed(1)}`).join(' ');
  const ppts = planPts.map(q => `${X(q.date).toFixed(1)},${Y(q.kg).toFixed(1)}`).join(' ');
  const yt = [a + pad_, (a + b) / 2, b - pad_].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="tick">${wShow(v)}</text>`).join('');
  const dots = ws.map(w => `<circle cx="${X(w.date).toFixed(1)}" cy="${Y(w.kg).toFixed(1)}" r="${ws.length > 40 ? 2 : 3.5}" class="dot"><title>${esc(dMed(w.date))}: ${wShow(w.kg)} ${wu}${plan && planKg(plan, w.date) != null ? `, plan ${wShow(planKg(plan, w.date))} ${wu}` : ''}</title></circle>`).join('');
  const tx = plan && today >= startD && today <= endD ? `<line x1="${X(today).toFixed(1)}" x2="${X(today).toFixed(1)}" y1="${pt}" y2="${H - pb}" class="grid" stroke-dasharray="2 4"/>` : '';
  const sh = (v, p) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(wShow(Math.abs(v))).toFixed(1) + ' ' + wu;
  const wk = ws.filter(w => w.date >= isoAdd(todayIso(), -30)), wch = wk.length > 1 ? wk[wk.length - 1].kg - wk[0].kg : null;
  const list = ws.slice().reverse().slice(0, 30).map(w => `<div class="wrow"><span>${esc(dMed(w.date))}</span><b>${wShow(w.kg)} ${wu}</b><button class="btn link" data-act="del-weight" data-date="${w.date}" aria-label="Delete the weigh-in from ${esc(dMed(w.date))}">Delete</button></div>`).join('');
  const pk = plan ? planKg(plan, last.date) : null, gap = pk != null ? last.kg - pk : null;
  const legend = plan ? `<div class="wlegend"><span><i class="lg-act"></i>Actual</span><span><i class="lg-plan"></i>Plan, ${wShowRate(plan.rate)} ${esc(wu)} a week${plan.goalKg != null ? ` to ${wShow(plan.goalKg)} ${esc(wu)}` : ''}</span></div>` : '';
  const planCard = plan ? `<section class="card dz-sum"><div class="dz-costhead"><span>Against plan</span><b>${gap == null ? 'Not started' : Math.abs(gap) < 0.15 ? 'On plan' : `${sh(gap)} ${gap > 0 ? 'above' : 'below'}`}</b></div>${pk != null ? `<div class="dz-costline"><span>Plan on ${esc(dMed(last.date))}</span><span>${wShow(pk)} ${esc(wu)}</span></div>` : ''}${plan.weeks ? `<div class="dz-costline"><span>${esc(PHASE_NAME[plan.phase])}${today >= plan.start && today <= planFinish(plan) ? `, week ${Math.min(plan.weeks, Math.floor((dObj(today) - dObj(plan.start)) / 864e5 / 7) + 1)} of ${plan.weeks}` : ''}</span><span>ends ${esc(dMed(planFinish(plan)))}</span></div>` : ''}${planEnd(plan) ? `<div class="dz-costline"><span>Plan reaches ${wShow(plan.goalKg)} ${esc(wu)}</span><span>${esc(dMed(planEnd(plan)))}</span></div>` : ''}</section>` : '';
  return head + `<div class="cols dz-cols"><div class="main2"><section class="card dz-sum"><div class="dz-energy"><div><span class="dz-num">${wShow(last.kg)}</span><span class="dz-unit"> ${wu}, ${esc(dMed(last.date))}</span></div></div>
    <svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plan ? 'Actual weight and planned weight over time' : 'Weight over time'}">${yt}${tx}${plan ? `<polyline points="${ppts}" class="line plan"/>` : ''}<polyline points="${pts}" class="line"/>${dots}<text x="${pl}" y="${H - 6}" class="tick">${esc(dMed(startD))}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end" class="tick">${esc(dMed(endD))}</text></svg>${legend}</section></div>
    <aside class="side">${planCard}<section class="card dz-sum"><div class="dz-costhead"><span>Since ${esc(dMed(first.date))}</span><b>${sh(ch)}</b></div>${wch != null ? `<div class="dz-costline"><span>Last 30 days</span><span>${sh(wch)}</span></div>` : ''}</section><section class="card dz-sum"><h2 style="font-size:17px">History</h2><div style="margin-top:8px">${list}</div></section></aside></div>`;
}
const PHASE_NAME = { cut: 'Fat loss', maintain: 'Maintenance', gain: 'Muscle gain' };
function openPlan() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const last = S.weights.length ? S.weights[S.weights.length - 1] : null, pr = (S.goals && S.goals.profile) || {}, pn = S.plan;
  const start = pn ? pn.start : (last ? last.date : todayIso()), kg = pn ? pn.kg : last ? last.kg : '', rate = pn ? pn.rate : adaptiveRate(pr);
  dlg.innerHTML = `<form id="planform" method="dialog" novalidate><h2 id="dlg-title" style="font-size:20px">Weight plan</h2>
    <p class="muted" style="font-size:14px">A straight line from where you start at the change per week you want. The Weight chart draws it next to your actual weigh-ins.</p>
    <div class="gl-f" style="margin-top:12px"><label for="plp">Phase</label><select class="field" id="plp">${Object.entries(PHASE_NAME).map(([v, n]) => `<option value="${v}"${(pn ? pn.phase : rate < 0 ? 'cut' : rate > 0 ? 'gain' : 'maintain') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="gl-f" style="margin-top:10px"><label for="pln">Length in weeks (fat loss and muscle gain: 16 at most)</label><input class="field" id="pln" inputmode="numeric" autocomplete="off" value="${pn && pn.weeks ? pn.weeks : ''}" placeholder="for example 8"></div>
    <div class="gl-f" style="margin-top:10px"><label for="pls">Start date</label><input class="field" id="pls" type="date" value="${esc(start)}"></div>
    <div class="gl-f" style="margin-top:10px"><label for="plw">Start weight (${esc(S.wunit)})</label><input class="field" id="plw" inputmode="decimal" autocomplete="off" value="${kg === '' ? '' : esc(wShow(kg))}"></div>
    <div class="gl-f" style="margin-top:10px"><label for="plr">Change per week (${esc(S.wunit)}, minus to lose)</label><input class="field" id="plr" inputmode="decimal" autocomplete="off" value="${esc(wShowRate(rate))}"></div>
    <div><button type="button" class="btn sm" data-act="plan-suggest">Suggest a rate for this length</button><p class="muted dz-small" id="plhint" style="margin-top:6px" aria-live="polite"></p></div>
    <div class="gl-f" style="margin-top:10px"><label for="plg">Goal weight (${esc(S.wunit)}, optional)</label><input class="field" id="plg" inputmode="decimal" autocomplete="off" value="${pn && pn.goalKg != null ? esc(wShow(pn.goalKg)) : ''}"></div>
    <div id="plerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Save plan</button><button type="button" class="btn" data-act="close-dlg">Cancel</button>${pn ? '<button type="button" class="btn link" data-act="plan-remove">Remove plan</button>' : ''}</div></form>`;
  dlg.dataset.ack = ''; dlg.setAttribute('aria-labelledby', 'dlg-title'); if (!dlg.open) dlg.showModal();
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'planform') return;
  e.preventDefault();
  const dlg = $('#dlg'), err = m => { $('#plerr').textContent = m; };
  const phase = $('#plp').value, weeksRaw = $('#pln').value.trim(), weeks = weeksRaw ? Math.round(num(weeksRaw)) : null;
  const kg = wParse($('#plw').value), gRaw = $('#plg').value.trim(), goal = gRaw ? wParse(gRaw) : null, start = $('#pls').value;
  let rate = phase === 'maintain' ? 0 : wParseRate($('#plr').value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return err('Choose a start date.');
  if (!(kg >= 20 && kg <= 400)) return err('Enter your start weight.');
  if (weeksRaw && !(weeks >= 1 && weeks <= 104)) return err('Length must be a number of weeks.');
  if (phase !== 'maintain' && !weeks) return err('Enter how many weeks the phase lasts.');
  if (phase !== 'maintain' && weeks > MAX_PHASE_WEEKS) return err(`Fat loss and muscle gain phases are limited to ${MAX_PHASE_WEEKS} weeks. Plan a maintenance phase after that.`);
  if (rate === null || Math.abs(rate) > 2) return err('Change per week must be between -2 and 2 kg (about 4.4 lb).');
  if (phase === 'cut' && rate >= 0) return err('A fat loss phase needs a weekly change below zero.');
  if (phase === 'gain' && rate <= 0) return err('A muscle gain phase needs a weekly change above zero.');
  if (phase === 'cut' && -rate > MAX_LOSS_PCT * kg / 100) return err(`That is more than ${MAX_LOSS_PCT}% of your body weight a week, the safe cap (${wShowRate(MAX_LOSS_PCT * kg / 100)} ${S.wunit} for you).`);
  if (goal !== null && !(goal >= 20 && goal <= 400)) return err('Enter a goal weight or leave it empty.');
  if (goal !== null && rate !== 0 && (rate < 0) !== (goal < kg)) return err('The goal is in the opposite direction to the weekly change.');
  const old = S.plan, prev = old && old.start !== start && old.weeks ? { phase: old.phase, weeks: old.weeks, end: planFinish(old) } : old && old.prev || null;
  const next = cleanPlan({ start, kg, rate, goalKg: goal, phase, weeks, prev });
  const warn = phaseWarnings(next, prev).join(' ');
  if (warn && dlg.dataset.ack !== warn) { dlg.dataset.ack = warn; return err(`${warn} Press Save plan again to keep it anyway.`); }
  S.plan = next; saveAll(); dlg.close(); render(); toast('Weight plan saved');
});
