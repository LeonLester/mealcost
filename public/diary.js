/* Diary and Goals screens. Loaded before app.js; uses app globals (S, IDX, esc, money, ...) only when called. */
'use strict';

const MEAL_BASE = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
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
  return dFmt(day, { weekday: 'long' });
}
function dayStrip(day) {
  const dow = (dObj(day).getDay() + 6) % 7, start = isoAdd(day, -dow), t = todayIso(), goal = goalFor('kcal');
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = isoAdd(start, i), es = IDX.byDate.get(d) || [], k = es.reduce((a, e) => a + (e.kcal || 0), 0);
    const h = goal ? Math.min(100, Math.round(k / goal * 100)) : (k > 0 ? 60 : 0);
    cells.push(`<button class="dz-day${d === t ? ' today' : ''}" data-act="pick-day" data-date="${d}" aria-pressed="${d === day}" aria-label="${esc(dMed(d))}${k ? ', ' + n0(k) + ' kcal' : ', nothing logged'}"><small>${esc(dFmt(d, { weekday: 'short' }).slice(0, 3))}</small><b>${dFmt(d, { day: 'numeric' })}</b><span class="dz-mini"><i style="height:${Math.max(k > 0 ? 8 : 0, h)}%"></i></span></button>`);
  }
  return `<div class="dz-strip" role="group" aria-label="Pick a day">${cells.join('')}</div>`;
}

/* ---------- summary: energy and macros against goals ---------- */
function summaryCard(tot) {
  const g = S.goals, gk = goalFor('kcal');
  const energy = gk
    ? `<div class="dz-energy"><div><span class="dz-num">${n0(tot.kcal)}</span><span class="dz-unit"> of ${n0(gk)} kcal</span></div><b class="dz-left${tot.kcal > gk ? ' over' : ''}">${tot.kcal > gk ? n0(tot.kcal - gk) + ' over' : n0(gk - tot.kcal) + ' left'}</b></div>${dzBar(tot.kcal, gk, 'm-kcal big', 'Energy')}`
    : `<div class="dz-energy"><div><span class="dz-num">${n0(tot.kcal)}</span><span class="dz-unit"> kcal</span></div></div>`;
  const rows = [['pro', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat'], ['fiber', 'Fiber']].map(([k, n]) => {
    const v = tot[k], gl = goalFor(k);
    return `<div class="dz-mrow"><div class="dz-mhead"><span>${n}</span><b>${n0(v)}${gl ? `<small> / ${n0(gl)} g</small>` : '<small> g</small>'}</b></div>${dzBar(v, gl, MC[k], n)}</div>`;
  }).join('');
  const ke = tot.pro * 4 + tot.carb * 4 + tot.fat * 9;
  const split = ke > 0 ? `<p class="dz-split">Energy from protein ${Math.round(tot.pro * 4 / ke * 100)}%, carbs ${Math.round(tot.carb * 4 / ke * 100)}%, fat ${Math.round(tot.fat * 9 / ke * 100)}%</p>` : '';
  const cta = g ? '' : `<div class="dz-cta"><span>Set daily goals to see how much is left.</span><button class="btn sm" data-act="goals">Set goals</button></div>`;
  return `<section class="card dz-sum" aria-label="Nutrition for the day">${energy}<div class="dz-macros">${rows}</div>${split}${cta}</section>`;
}

/* ---------- cost, kept compact ---------- */
function costCard(day, es, sm, names, bad) {
  const budget = S.budget > 0 ? S.budget : null, left = budget ? r2(budget - sm.cost) : 0;
  const offerNames = [...new Set(es.filter(e => costOf(e).offer).map(e => e.name))];
  const pp = sm.pro > 0 && sm.cost > 0 ? sm.cost / (sm.pro / 100) : null;
  return `<section class="card dz-cost" aria-label="Cost for the day">
    <div class="pricetag xs"><span class="n">${money(sm.cost)}</span><span class="l">for the day</span></div>
    ${budget ? `<div class="dz-costline"><span>Budget ${money(budget)}</span><span>${left >= 0 ? money(left) + ' left' : money(-left) + ' over'}</span></div>${dzBar(sm.cost, budget, 'm-cost', 'Budget')}` : ''}
    ${pp != null ? `<p class="muted dz-small">${money(pp)} per 100 g protein</p>` : ''}
    ${sm.saved > 0.004 ? `<p class="dz-small" style="color:var(--brand-dark)">${offerNames.length === 1 ? 'Your offer on ' + esc(offerNames[0]) : 'Your ' + offerNames.length + ' offers'} saved ${money(sm.saved)}.</p>` : ''}
    ${!bad.length && names.length ? `<p class="dz-small">All ${names.length} foods priced.</p>` : ''}
    ${bad.length ? `<p class="dz-small"><a href="#prices" data-act="unpriced-link">${bad.length} ${bad.length === 1 ? 'food needs' : 'foods need'} a price</a>, so the total leaves ${bad.length === 1 ? 'it' : 'them'} out.</p>` : ''}
    <button class="btn link" data-act="budget">${budget ? 'Change budget' : 'Set a daily budget'}</button>
  </section>`;
}

/* ---------- one logged food ---------- */
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
  const amt = e.q ? 'Quick add' : `${qtyFmt(e.qty)} ${esc(e.unit)}`;
  const mac = `P ${n0(e.pro)} · C ${n0(e.carb)} · F ${n0(e.fat)}`;
  return `<div class="swipe"><button class="swipe-del" data-act="del-entry" data-i="${ei}" aria-label="Delete ${en}" tabindex="-1">${TOOLIC.trash}</button><div class="item dz-item"><div class="imain"><button class="iname" data-act="edit-entry" data-i="${ei}" aria-label="Edit ${en}"><span class="nm">${en}</span><span class="amt">${amt}<span class="dz-mac"> · ${mac}</span></span></button>${note}${rec ? `<button class="btn link" data-act="toggle-recipe" data-key="${esc(key)}" aria-expanded="${open}">${open ? 'Hide' : 'Show'} ingredients</button>` : ''}</div><div class="dz-r"><b class="dz-k">${n0(e.kcal)}<small> kcal</small></b>${cell}</div></div></div>${subs}`;
}

function mealSection(g, list, day) {
  const t = nutTotals(list);
  const cost = r2(list.reduce((a, e) => a + (costOf(e).cost || 0), 0));
  return `<section class="meal dz-meal"><div class="meal-head"><h2>${esc(g)}</h2><span class="kcal">${list.length ? `${n0(t.kcal)} kcal · P ${n0(t.pro)} C ${n0(t.carb)} F ${n0(t.fat)}` : ''}</span>${list.length && cost > 0 ? `<span class="cost">${money(cost)}</span>` : ''}</div>
    <div class="dz-list">${list.map((e, li) => dzItem(e, day, g, li)).join('')}</div>
    <div class="dz-actions"><button class="btn sm" data-act="log-food" data-date="${day}" data-group="${esc(g)}">${list.length ? 'Add food' : 'Add to ' + esc(g.toLowerCase())}</button><button class="btn link" data-act="copy-prev" data-group="${esc(g)}">Copy from earlier</button></div></section>`;
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
  const sections = MEAL_BASE.map(b => { const hit = grouped.get(mkey(b)); grouped.delete(mkey(b)); return [hit ? hit[0] : b, hit ? hit[1] : []]; }).concat([...grouped.values()]);
  const rel = relDay(day), full = dLong(day);
  return `
  <div class="pagehead dz-head">
    <div class="dz-title"><h1 class="h1" id="h1" tabindex="-1">${esc(rel)}</h1>${rel === full.split(',')[0] ? '' : `<span class="muted dz-date">${esc(full)}</span>`}</div>
    <div class="dz-nav">
      <button class="iconbtn" data-act="prev-day" aria-label="Previous day">${IC.left}</button>
      <button class="iconbtn" data-act="next-day" aria-label="Next day">${IC.right}</button>
      <label class="iconbtn dz-cal" title="Pick a date"><span class="sr">Pick a date</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><input type="date" id="daypick" value="${day}" aria-label="Pick a date"></label>
      ${day !== todayIso() ? '<button class="btn sm" data-act="today">Today</button>' : ''}
    </div>
    <div class="dz-top">
      <button class="btn primary" data-act="log-food" data-date="${day}">Add food</button>
      <details class="dz-menu"><summary class="btn" aria-label="More for this day">More</summary><div class="dz-pop">
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
    <div class="main2">${es.length ? '' : `<p class="muted dz-empty">${S.entries.length ? 'Nothing logged on this day yet.' : 'Nothing is logged yet.'} Add a food, or copy a day from earlier.</p>`}${sections.map(([g, l]) => mealSection(g, l, day)).join('')}${es.length ? '<p class="muted dz-hint">Tap a food to edit it. Swipe left to delete. Tap a price to change it for this day only.</p>' : ''}</div>
    <aside class="side dz-side">
      ${summaryCard(tot)}
      ${costCard(day, es, sm, names, bad)}
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
      <div class="gl-grid">
        ${fld('gk', 'Energy', g.kcal, 'kcal')}
        ${fld('gp', 'Protein', g.pro, 'g')}
        ${fld('gc', 'Carbs', g.carb, 'g')}
        ${fld('gf', 'Fat', g.fat, 'g')}
        ${fld('gb', 'Fiber', g.fiber, 'g')}
      </div>
      <p class="muted" id="gcheck" aria-live="polite" style="font-size:14px;margin-top:12px"></p>
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
      <section class="card pad">
        <h2 style="font-size:17px">Weight unit</h2>
        <div class="opts" role="radiogroup" aria-label="Weight unit" style="margin-top:10px">${['kg', 'lb'].map(u => `<button type="button" class="opt" role="radio" aria-checked="${wu === u}" data-act="wunit" data-v="${u}">${u === 'kg' ? 'Kilograms' : 'Pounds'}</button>`).join('')}</div>
      </section>
    </div>
  </div>`;
}
function goalsCheck() {
  const v = id => num(($('#' + id) || {}).value), k = v('gk'), p = v('gp'), c = v('gc'), f = v('gf'), el = $('#gcheck');
  if (!el) return;
  const e = p * 4 + c * 4 + f * 9;
  el.textContent = k > 0 && e > 0 ? `Protein, carbs and fat add up to ${n0(e)} kcal${Math.abs(e - k) / k > 0.08 ? `, ${e > k ? n0(e - k) + ' above' : n0(k - e) + ' below'} your energy target.` : '. That matches your energy target.'}` : '';
}
function readProfile() {
  const v = id => ($('#' + id) || {}).value;
  return { sex: v('cs'), age: num(v('ca')), cm: num(v('ch')), kg: wParse(v('cw')), act: v('cact'), goal: v('cgoal') };
}
function saveGoals() {
  const v = id => num(($('#' + id) || {}).value), g = { kcal: v('gk'), pro: v('gp'), carb: v('gc'), fat: v('gf'), fiber: v('gb'), x: {}, profile: (S.goals && S.goals.profile) || null };
  for (const n of NUT_X) { const x = v('gx-' + n.k); if (x > 0) g.x[n.k] = x; }
  const pr = readProfile(); if (pr.age > 0 || pr.cm > 0 || pr.kg > 0) g.profile = pr;
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
function diaryAct(a, d) {
  switch (a) {
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
      set('gk', p.kcal); set('gp', p.pro); set('gc', p.carb); set('gf', p.fat); set('gb', p.fiber); goalsCheck(); toast('Filled in. Press Save goals to keep them.'); return true;
    }
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
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#goalform')) goalsCheck(); });
document.addEventListener('submit', e => { if (e.target.id === 'goalform') { e.preventDefault(); saveGoals(); } });
document.addEventListener('change', e => { if (e.target.id === 'daypick' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { S.day = e.target.value; render(); } });

/* ---------- progress: nutrition and weight ---------- */
const PNAV = [['progress', 'Nutrition'], ['weight', 'Weight'], ['week', 'Spending'], ['trends', 'Trends']];
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
    return `<div class="dz-mrow"><div class="dz-mhead"><span>${n}</span><b>${n0(v)}${gl ? `<small> / ${n0(gl)} g</small>` : '<small> g</small>'}</b></div>${dzBar(v, gl, MC[k], n)}${gl ? `<small class="muted">Goal met on ${hit} of ${nL} days</small>` : ''}</div>`;
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
  const ws = S.weights, wu = S.wunit;
  const head = `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Weight</h1><button class="btn primary" data-act="log-weight">Log weight</button></div>`;
  if (!ws.length) return head + `<div class="card pad" style="margin-top:18px;max-width:560px"><h2 style="font-size:17px">No weigh-ins yet</h2><p class="muted" style="margin-top:8px">Log your weight to see the trend next to what you eat. It stays on this device unless you sign in to sync.</p></div>`;
  const first = ws[0], last = ws[ws.length - 1], ch = last.kg - first.kg;
  const W = 640, H = 210, pl = 40, pr = 10, pt = 12, pb = 26, t0 = dObj(first.date).getTime(), t1 = Math.max(dObj(last.date).getTime(), t0 + 864e5 * 6);
  const vs = ws.map(w => w.kg), lo = Math.min(...vs), hi = Math.max(...vs), pad_ = Math.max(.5, (hi - lo) * .15), a = lo - pad_, b = hi + pad_;
  const X = d => pl + (dObj(d).getTime() - t0) / (t1 - t0) * (W - pl - pr), Y = v => pt + (H - pt - pb) * (1 - (v - a) / (b - a));
  const pts = ws.map(w => `${X(w.date).toFixed(1)},${Y(w.kg).toFixed(1)}`).join(' ');
  const yt = [a + pad_, (a + b) / 2, b - pad_].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="tick">${wShow(v)}</text>`).join('');
  const dots = ws.map(w => `<circle cx="${X(w.date).toFixed(1)}" cy="${Y(w.kg).toFixed(1)}" r="${ws.length > 40 ? 2 : 3.5}" class="dot"><title>${esc(dMed(w.date))}: ${wShow(w.kg)} ${wu}</title></circle>`).join('');
  const sh = (v, p) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(wShow(Math.abs(v))).toFixed(1) + ' ' + wu;
  const wk = ws.filter(w => w.date >= isoAdd(todayIso(), -30)), wch = wk.length > 1 ? wk[wk.length - 1].kg - wk[0].kg : null;
  const list = ws.slice().reverse().slice(0, 30).map(w => `<div class="wrow"><span>${esc(dMed(w.date))}</span><b>${wShow(w.kg)} ${wu}</b><button class="btn link" data-act="del-weight" data-date="${w.date}" aria-label="Delete the weigh-in from ${esc(dMed(w.date))}">Delete</button></div>`).join('');
  return head + `<div class="cols dz-cols"><div class="main2"><section class="card dz-sum"><div class="dz-energy"><div><span class="dz-num">${wShow(last.kg)}</span><span class="dz-unit"> ${wu}, ${esc(dMed(last.date))}</span></div></div>
    <svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">${yt}<polyline points="${pts}" class="line"/>${dots}<text x="${pl}" y="${H - 6}" class="tick">${esc(dMed(first.date))}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end" class="tick">${esc(dMed(last.date))}</text></svg></section></div>
    <aside class="side"><section class="card dz-sum"><div class="dz-costhead"><span>Since ${esc(dMed(first.date))}</span><b>${sh(ch)}</b></div>${wch != null ? `<div class="dz-costline"><span>Last 30 days</span><span>${sh(wch)}</span></div>` : ''}</section><section class="card dz-sum"><h2 style="font-size:17px">History</h2><div style="margin-top:8px">${list}</div></section></aside></div>`;
}
