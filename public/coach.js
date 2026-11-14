/* Coach tools: a client list, read-only client diaries, targets, notes, weekly reports, and client-side sharing. Loaded before app.js.
   A coach sees a client only through the server, which checks the link and the scopes the client approved. */
'use strict';

const CO = { list: null, err: '', cache: new Map(), notes: new Map(), sharing: null, sharingErr: '', tab: 'overview', days: 7, own: null, view: null, join: null, loading: false, fail: new Set(), nl: new Set(), sl: false };
const CO_ERR = {
  no_access: 'Coach tools are not enabled for your account.', not_found: 'That client no longer exists.', invalid_invite: 'This invitation is not valid any more. Ask your coach for a new one.',
  own_invite: 'You cannot accept your own invitation.', already_linked: 'This client is already linked.', consent_required: 'Tick the box to agree before sharing.',
  linked: 'This client is linked to an account. Their data comes from their own diary.', too_large: 'That is more data than a profile can hold.', conflict: 'The profile changed somewhere else. Reload and try again.',
  too_many_clients: 'You have reached the limit of 200 clients.', bad_targets: 'Enter at least the daily calories.', rate_limited: 'Too many requests. Try again in a minute.', unreadable: 'The data could not be read.'
};
const coOk = () => !!(window.MealSync && MealSync.signed && MealSync.coach);
const coJb = (m, o) => ({ method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
async function coCall(path, opts) {
  const res = await MealSync.api(path, opts);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(CO_ERR[j.error] || 'Something went wrong. Try again.'); e.code = j.error; e.status = res.status; throw e; }
  return j;
}
const coAgo = ts => {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' h ago';
  const d = Math.round(m / 1440); return d === 1 ? 'yesterday' : d + ' days ago';
};
const coDay = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const coGz = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

/* ---------- turn a client's synced strings into a state the app's own views can read ---------- */
function coBuild(raw) {
  const g = k => { try { return raw && raw[k] != null ? JSON.parse(raw[k]) : undefined; } catch (e) { return undefined; } };
  const arr = v => Array.isArray(v) ? v : [], isO = v => v && typeof v === 'object' && !Array.isArray(v);
  const nn = v => Number.isFinite(Number(v)) ? Number(v) : 0, ISO = /^\d{4}-\d{2}-\d{2}$/;
  const entries = arr(g('entries')).filter(e => isO(e) && ISO.test(e.date) && typeof e.name === 'string' && e.name).slice(0, 60000).map(e => ({
    ...e, name: e.name.slice(0, 120), group: String(e.group || 'Meal').slice(0, 40), unit: String(e.unit || 'item').slice(0, 24),
    type: e.type === 'count' || e.type === 'volume' ? e.type : 'mass', qty: nn(e.qty), kcal: nn(e.kcal), pro: nn(e.pro), carb: nn(e.carb), fat: nn(e.fat), fiber: nn(e.fiber)
  }));
  const keep = (o, ok) => { const r = NP(); if (isO(o)) for (const k of Object.keys(o)) if (ok(o[k])) r[k] = o[k]; return r; };
  const cur = g('currency');
  const overrides = NP(); { const o = g('overrides'); if (isO(o)) for (const d of Object.keys(o)) if (ISO.test(d) && isO(o[d])) { overrides[d] = NP(); for (const n of Object.keys(o[d])) if (Number.isFinite(Number(o[d][n]))) overrides[d][n] = Number(o[d][n]); } }
  return {
    entries, prices: keep(g('prices'), isO), overrides, currency: CURRENCIES.includes(cur) ? cur : 'EUR', budget: nn(g('budget')) > 0 ? nn(g('budget')) : null,
    merges: keep(g('merges'), v => typeof v === 'string'), nomerge: arr(g('nomerge')).filter(x => typeof x === 'string'), cats: keep(g('cats'), v => typeof v === 'string'),
    ranges: arr(g('ranges')).filter(r => isO(r) && typeof r.name === 'string' && ISO.test(r.from) && (!r.to || ISO.test(r.to)) && Number.isFinite(Number(r.price))),
    recipes: keep(g('recipes'), r => isO(r) && Array.isArray(r.items)), meals: NP(), pantry: NP(), foods: keep(g('foods'), isO),
    goals: cleanGoals(g('goals')), weights: arr(g('weights')).filter(w => isO(w) && ISO.test(w.date) && nn(w.kg) > 0).map(w => ({ date: w.date, kg: nn(w.kg) })), wunit: g('wunit') === 'lb' ? 'lb' : 'kg'
  };
}
const CO_SKEYS = ['entries', 'prices', 'overrides', 'currency', 'budget', 'merges', 'nomerge', 'cats', 'ranges', 'recipes', 'meals', 'foods', 'goals', 'weights', 'wunit', 'pantry'];
// Run fn with the app state swapped for a client's data, then put the coach's own data back. Nothing is saved while swapped.
function coWith(snap, fn) {
  const own = {}; for (const k of CO_SKEYS) own[k] = S[k];
  const was = window.__mcView; window.__mcView = true;
  try { Object.assign(S, snap); indexRanges(); reindex(); ensurePrices(); return fn(); }
  finally { Object.assign(S, own); indexRanges(); reindex(); window.__mcView = was; }
}

/* ---------- loading ---------- */
async function coLoadList(force) {
  if (!coOk()) return;
  if (CO.list && !force) return;
  CO.loading = true;
  try { CO.list = (await coCall('/api/coach/clients')).clients; CO.err = ''; } catch (e) { CO.err = e.message; CO.list = CO.list || []; }
  CO.loading = false;
  if (S.tab === 'coach') render();
  coPrefetch();
}
async function coLoad(id, force) {
  const hit = CO.cache.get(id);
  if (hit && !force && Date.now() - hit.at < 300000) return hit;
  const j = await coCall(`/api/coach/clients/${id}/data`);
  const e = { mode: j.mode, scopes: j.scopes, rev: j.rev, updated: j.updated, raw: j.data, snap: coBuild(j.data), at: Date.now(), stats: new Map() };
  CO.cache.set(id, e);
  return e;
}
let _pf = false;
async function coPrefetch() {
  if (_pf || !CO.list) return; _pf = true;
  const todo = CO.list.filter(c => (c.status === 'active' || c.profileUpdated) && !CO.cache.has(c.id));
  let i = 0;
  const worker = async () => { while (i < todo.length) { const c = todo[i++]; try { await coLoad(c.id); } catch (e) { /* the card shows no data */ } if (S.tab === 'coach' && !CO.cur()) render(); } };
  await Promise.all([worker(), worker(), worker()]);
  _pf = false;
}
CO.cur = () => S.coachId || '';

/* ---------- numbers for one client over a window ---------- */
function coTargets(c, entry) {
  if (c.targets && c.targets.kcal > 0) return c.targets;
  const g = entry && entry.snap.goals;
  return g ? { kcal: g.kcal, pro: g.pro, carb: g.carb, fat: g.fat, fiber: g.fiber, x: g.x || {}, note: '' } : null;
}
function coStats(c, entry, days, end) {
  const key = days + '|' + end + '|' + (c.targets ? JSON.stringify(c.targets) : '');
  if (entry.stats.has(key)) return entry.stats.get(key);
  const tg = coTargets(c, entry), from = isoAdd(end, -(days - 1));
  const out = coWith(entry.snap, () => {
    const rows = [], names = new Map();
    for (let d = from; d <= end; d = isoAdd(d, 1)) {
      const es = IDX.byDate.get(d) || [], t = nutTotals(es), st = es.length ? dayStat(d) : null;
      rows.push({ d, n: es.length, kcal: t.kcal, pro: t.pro, carb: t.carb, fat: t.fat, fiber: t.fiber, cost: st ? st.cost : 0, priced: st ? covered(st) : false, pk: st ? st.pro : 0 });
      for (const e of es) { const o = names.get(e.name) || { name: e.name, cost: 0, pro: 0, kcal: 0 }; o.cost += costOf(e).cost || 0; o.pro += e.pro; o.kcal += e.kcal; names.set(e.name, o); }
    }
    const logged = rows.filter(r => r.n), avg = k => logged.length ? logged.reduce((a, r) => a + r[k], 0) / logged.length : 0;
    const pr = rows.filter(r => r.priced), costTot = pr.reduce((a, r) => a + r.cost, 0), proTot = pr.reduce((a, r) => a + r.pk, 0);
    const ws = S.weights.filter(w => w.date >= from && w.date <= end).sort((a, b) => a.date < b.date ? -1 : 1);
    const top = k => [...names.values()].filter(o => o[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5);
    const all = IDX.dates, last = all.length ? all[all.length - 1] : '';
    return {
      from, end, days, rows, logged: logged.length, avg: { kcal: avg('kcal'), pro: avg('pro'), carb: avg('carb'), fat: avg('fat'), fiber: avg('fiber') },
      cost: { total: costTot, perDay: pr.length ? costTot / pr.length : null, per100pro: proTot >= 10 && costTot > 0 ? costTot / proTot * 100 : null, priced: pr.length },
      weight: ws.length ? { first: ws[0].kg, last: ws[ws.length - 1].kg, n: ws.length } : null, wunit: S.wunit, currency: S.currency,
      topCost: top('cost'), topPro: top('pro'), last,
      kcalHit: tg ? logged.filter(r => r.kcal >= tg.kcal * 0.9 && r.kcal <= tg.kcal * 1.1).length : null,
      proHit: tg && tg.pro > 0 ? logged.filter(r => r.pro >= tg.pro * 0.9).length : null
    };
  });
  out.tg = tg;
  entry.stats.set(key, out);
  return out;
}
const coMoney = (v, cur) => v == null ? 'n/a' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'EUR' }).format(v);
const coKg = (kg, u) => u === 'lb' ? (kg * 2.20462).toFixed(1) + ' lb' : kg.toFixed(1) + ' kg';

/* ---------- small chart: calories per day against the target ---------- */
function coBars(st) {
  const W = 300, H = 90, n = st.rows.length, bw = Math.max(2, W / n - 3), mx = Math.max(1, ...st.rows.map(r => r.kcal), st.tg ? st.tg.kcal : 0) * 1.1;
  const bars = st.rows.map((r, i) => { const h = r.kcal / mx * (H - 14), x = i * (W / n) + 1.5; return `<rect x="${x.toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, r.n ? 1 : 0).toFixed(1)}" rx="1.5" fill="var(--brand)"><title>${esc(dMed(r.d))}: ${n0(r.kcal)} kcal</title></rect>`; }).join('');
  const ty = st.tg ? H - 14 - st.tg.kcal / mx * (H - 14) : null;
  const lab = n <= 14 ? st.rows.map((r, i) => `<text x="${(i * (W / n) + (W / n) / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc(dFmt(r.d, { weekday: 'narrow' }))}</text>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories per day" style="width:100%;height:auto;max-height:160px">${bars}${ty != null ? `<line x1="0" x2="${W}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3"><title>Target ${n0(st.tg.kcal)} kcal</title></line>` : ''}${lab}</svg>`;
}
const coDots = (st) => `<span class="co-dots" aria-label="${st.logged} of ${st.days} days logged">${st.rows.slice(-14).map(r => `<i class="${r.n ? 'on' : ''}" title="${esc(dMed(r.d))}"></i>`).join('')}</span>`;
const coStatus = c => ({ profile: 'Coach profile', invited: 'Invite sent', active: 'Linked', revoked: 'Access withdrawn' }[c.status] || c.status);
const coStale = st => st && st.last ? Math.round((dObj(todayIso()) - dObj(st.last)) / 864e5) : null;

/* ---------- views ---------- */
function coachView() {
  if (!coOk()) return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Clients</h1></div><p class="lede">${window.MealSync && MealSync.signed ? 'Coach tools are not enabled for your account. Ask the administrator.' : 'Sign in to use the coach tools.'}</p>`;
  if (!CO.list && !CO.loading) coLoadList();
  const c = CO.cur() ? (CO.list || []).find(x => x.id === CO.cur()) : null;
  return c ? coDetail(c) : CO.cur() && CO.list ? `<p class="lede">That client was not found. <a href="#coach">Back to clients</a></p>` : coListHtml();
}
function coListHtml() {
  const list = CO.list || [];
  const cards = list.map(c => {
    const e = CO.cache.get(c.id), st = e ? coStats(c, e, 7, todayIso()) : null, stale = coStale(st);
    const body = st
      ? `<div class="co-row">${coDots(st)}<span class="muted">${st.logged}/7 days</span></div>
         <div class="co-kpis"><div><b>${st.logged ? n0(st.avg.kcal) : 'n/a'}</b><small>kcal${st.tg ? ' of ' + n0(st.tg.kcal) : ''}</small></div><div><b>${st.logged ? n0(st.avg.pro) + ' g' : 'n/a'}</b><small>protein${st.tg && st.tg.pro ? ' of ' + n0(st.tg.pro) : ''}</small></div><div><b>${coMoney(st.cost.perDay, st.currency)}</b><small>per day</small></div></div>`
      : `<p class="muted" style="font-size:14px">${c.status === 'active' ? 'Loading' : c.status === 'invited' ? 'Waiting for the client to accept.' : c.profileUpdated ? 'Loading' : 'No data yet. Open the client to import an export.'}</p>`;
    const flag = st && stale != null && stale >= 3 ? `<span class="co-pill warn">No log for ${stale} days</span>` : '';
    return `<a class="co-card card" href="#coach/${esc(c.id)}"><div class="co-top"><b>${esc(c.name)}</b><span class="co-pill ${c.status}">${esc(coStatus(c))}</span></div>${flag}${body}<small class="muted">${c.dataUpdated ? 'Data updated ' + esc(coAgo(c.dataUpdated)) : 'No data yet'}</small></a>`;
  }).join('');
  return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">Clients</h1><button class="btn primary" data-co="add">Add client</button></div>
  <p class="lede">Your clients at a glance. A client who has their own Meal cost account can share their diary with you. For anyone else, keep a profile and import their Cronometer exports.</p>
  ${CO.err ? `<div class="notice error" role="alert">${IC.info}<div>${esc(CO.err)}</div></div>` : ''}
  ${CO.list ? (list.length ? `<div class="co-grid">${cards}</div>` : `<div class="card pad" style="margin-top:24px;max-width:560px"><h2 style="font-size:17px">No clients yet</h2><p class="muted" style="margin-top:8px">Add a client to start. You can send them an invitation, or import their Cronometer export into a profile.</p></div>`) : '<p class="muted" style="margin-top:24px">Loading</p>'}
  <p class="muted" style="margin-top:24px;font-size:13px;max-width:640px">Client data is personal health information. Only open clients you have permission to coach, and keep your account secure. <a href="/privacy">Privacy policy</a></p>`;
}

function coDetail(c) {
  const tabs = [['overview', 'Overview'], ['targets', 'Targets'], ['notes', 'Notes'], ['report', 'Weekly report'], ['data', 'Data and access']];
  const t = CO.tab, e = CO.cache.get(c.id);
  if (!e && (c.status === 'active' || c.profileUpdated) && !CO.fail.has(c.id)) { CO.fail.add(c.id); coLoad(c.id).then(() => { CO.fail.delete(c.id); if (S.tab === 'coach') render(); }).catch(err => { CO.err = err.message; if (S.tab === 'coach') render(); }); }
  const body = t === 'targets' ? coTargetsHtml(c, e) : t === 'notes' ? coNotesHtml(c) : t === 'report' ? coReportHtml(c, e) : t === 'data' ? coDataHtml(c, e) : coOverviewHtml(c, e);
  return `<div class="titlerow" style="align-items:flex-start"><div><a class="muted" href="#coach" style="font-size:14px">&lsaquo; All clients</a><h1 class="h1" id="h1" tabindex="-1" style="margin-top:4px">${esc(c.name)}</h1><p class="muted" style="margin-top:4px">${esc(coStatus(c))}${c.clientEmail ? ' · ' + esc(c.clientEmail) : c.email ? ' · ' + esc(c.email) : ''}${c.dataUpdated ? ' · data updated ' + esc(coAgo(c.dataUpdated)) : ''}</p></div>
    <div class="abtns" style="margin:0">${e && e.snap.entries.length ? `<button class="btn primary" data-co="open" data-id="${esc(c.id)}">Open diary</button>` : ''}</div></div>
  ${CO.err ? `<div class="notice error" role="alert">${IC.info}<div>${esc(CO.err)}</div></div>` : ''}
  <div class="co-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="chip" role="tab" data-co="tab" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>
  ${body}`;
}
function coOverviewHtml(c, e) {
  if (!e) return c.status === 'invited' ? `<div class="card pad co-sec"><p>This client has not accepted the invitation yet. ${c.inviteExp && c.inviteExp < Date.now() ? 'The link has expired. Create a new one in Data and access.' : 'Send them the link from Data and access.'}</p></div>` : `<div class="card pad co-sec"><h2 style="font-size:17px">No data yet</h2><p class="muted" style="margin-top:8px">Import a Cronometer export in Data and access to see this client's diary.</p></div>`;
  const sc = e.scopes, hidden = sc ? Object.entries({ diary: 'diary', prices: 'prices', weights: 'weight log' }).filter(([k]) => !sc[k]).map(([, v]) => v) : [];
  const st = coStats(c, e, CO.days, todayIso()), tg = st.tg, pct = (v, g) => g > 0 ? Math.round(v / g * 100) + '%' : '';
  const stale = coStale(st);
  const mac = [['Calories', st.avg.kcal, tg && tg.kcal, 'kcal'], ['Protein', st.avg.pro, tg && tg.pro, 'g'], ['Carbs', st.avg.carb, tg && tg.carb, 'g'], ['Fat', st.avg.fat, tg && tg.fat, 'g'], ['Fiber', st.avg.fiber, tg && tg.fiber, 'g']];
  return `${hidden.length ? `<div class="notice" style="margin-top:16px">${IC.info}<div>${esc(c.name)} does not share: ${esc(hidden.join(', '))}.</div></div>` : ''}
  <div class="co-sec" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="seg" role="group" aria-label="Period">${[7, 14, 28, 90].map(d => `<button type="button" data-co="days" data-v="${d}" aria-pressed="${CO.days === d}">${d} days</button>`).join('')}</span>${stale != null && stale >= 3 ? `<span class="co-pill warn">Last log ${stale} days ago</span>` : ''}</div>
  <div class="co-kpigrid co-sec">
    <div class="card pad"><small class="muted">Days logged</small><b>${st.logged} of ${st.days}</b>${coDots(st)}</div>
    <div class="card pad"><small class="muted">Calories on target</small><b>${st.kcalHit == null ? 'n/a' : st.kcalHit + ' of ' + st.logged}</b><small class="muted">within 10% of ${tg ? n0(tg.kcal) : 'no target'}</small></div>
    <div class="card pad"><small class="muted">Protein on target</small><b>${st.proHit == null ? 'n/a' : st.proHit + ' of ' + st.logged}</b><small class="muted">at least 90% of ${tg && tg.pro ? n0(tg.pro) + ' g' : 'no target'}</small></div>
    <div class="card pad"><small class="muted">Food cost per day</small><b>${coMoney(st.cost.perDay, st.currency)}</b><small class="muted">${st.cost.per100pro ? coMoney(st.cost.per100pro, st.currency) + ' per 100 g protein' : st.cost.priced ? 'protein cost needs more data' : 'no priced days'}</small></div>
    <div class="card pad"><small class="muted">Weight</small><b>${st.weight ? coKg(st.weight.last, st.wunit) : 'n/a'}</b><small class="muted">${st.weight && st.weight.n > 1 ? (st.weight.last - st.weight.first >= 0 ? '+' : '') + coKg(st.weight.last - st.weight.first, st.wunit) + ' in this period' : st.weight ? 'one weigh-in' : 'no weigh-ins'}</small></div>
  </div>
  <div class="card pad co-sec"><h2 style="font-size:17px">Calories per day</h2><div style="margin-top:12px">${coBars(st)}</div></div>
  <div class="card pad co-sec"><h2 style="font-size:17px">Daily average</h2><div class="tablewrap" style="margin-top:12px"><table style="min-width:0"><thead><tr><th scope="col">Nutrient</th><th scope="col" class="r">Average</th><th scope="col" class="r">Target</th><th scope="col" class="r">Of target</th></tr></thead><tbody>${mac.map(([n, v, g, u]) => `<tr><th scope="row" style="font-weight:500">${n}</th><td class="r">${st.logged ? n0(v) + ' ' + u : 'n/a'}</td><td class="r">${g ? n0(g) + ' ' + u : ''}</td><td class="r">${st.logged ? pct(v, g) : ''}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="co-two co-sec"><div class="card pad"><h2 style="font-size:17px">Costs the most</h2>${coTop(st.topCost, st.currency, 'cost')}</div><div class="card pad"><h2 style="font-size:17px">Most protein from</h2>${coTop(st.topPro, st.currency, 'pro')}</div></div>
  <div class="abtns co-sec" style="margin-top:20px"><button class="btn" data-co="open" data-id="${esc(c.id)}">Open the full diary</button><button class="btn" data-co="open-progress" data-id="${esc(c.id)}">Open progress and trends</button></div>`;
}
function coTop(list, cur, k) {
  if (!list.length) return '<p class="muted" style="margin-top:8px">Nothing in this period.</p>';
  return `<ol class="co-top5">${list.map(o => `<li><span>${esc(o.name)}</span><b>${k === 'cost' ? esc(coMoney(o.cost, cur)) : n0(o.pro) + ' g'}</b></li>`).join('')}</ol>`;
}

function coTargetsHtml(c, e) {
  const t = c.targets || {}, own = e && e.snap.goals;
  const f = (id, l, v, u) => `<div><label for="${id}">${l}${u ? ' (' + u + ')' : ''}</label><input class="field" style="width:100%" id="${id}" inputmode="decimal" value="${v ? esc(v) : ''}"></div>`;
  return `<form class="card pad co-sec" id="co-targets" data-id="${esc(c.id)}" style="max-width:640px"><h2 style="font-size:17px">Daily targets for ${esc(c.name)}</h2>
    <p class="muted" style="margin-top:6px;font-size:14px">These replace the client's own goals in your reports. ${c.status === 'active' ? 'The client sees them in their account and can use them as their goals.' : 'They stay with this profile.'}</p>
    <div class="fgrid" style="margin-top:16px">${f('ct-k', 'Calories', t.kcal, 'kcal')}${f('ct-p', 'Protein', t.pro, 'g')}</div><div class="fgrid" style="margin-top:12px">${f('ct-c', 'Carbs', t.carb, 'g')}${f('ct-f', 'Fat', t.fat, 'g')}</div><div class="fgrid" style="margin-top:12px">${f('ct-b', 'Fiber', t.fiber, 'g')}<div></div></div>
    <div style="margin-top:12px"><label for="ct-n">Note for the client</label><textarea class="field" id="ct-n" rows="3" maxlength="500" style="width:100%;height:auto;padding:10px">${esc(t.note || '')}</textarea></div>
    <div id="ct-err" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="abtns"><button type="submit" class="btn primary">Save targets</button>${own ? '<button type="button" class="btn" data-co="targets-own">Start from their own goals</button>' : ''}${c.targets ? '<button type="button" class="btn link" data-co="targets-clear">Remove targets</button>' : ''}</div></form>`;
}

function coNotesHtml(c) {
  const n = CO.notes.get(c.id);
  if (!n && !CO.nl.has(c.id)) { CO.nl.add(c.id); coLoadNotes(c.id); }
  return `<div class="co-sec" style="max-width:720px"><p class="muted" style="font-size:14px">Private to you. The client cannot see these. Under data protection law a client may ask for the information you hold about them, so keep notes factual.</p>
    <form id="co-note" data-id="${esc(c.id)}" style="margin-top:12px;display:flex;flex-direction:column;gap:10px"><label for="cn" class="sr">New note</label><textarea class="field" id="cn" rows="3" maxlength="4000" placeholder="Add a note" style="height:auto;padding:10px"></textarea><div><button type="submit" class="btn primary">Add note</button></div></form>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">${n ? (n.length ? n.map(x => `<article class="card pad" style="padding:16px 20px"><div class="muted" style="font-size:13px">${esc(coDay(x.created))}${x.updated > x.created ? ' · edited' : ''}</div><p style="margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.body)}</p><div style="margin-top:6px"><button class="btn link" data-co="note-edit" data-id="${esc(x.id)}">Edit</button> <button class="btn link" data-co="note-del" data-id="${esc(x.id)}" data-client="${esc(c.id)}">Delete</button></div></article>`).join('') : '<p class="muted">No notes yet.</p>') : '<p class="muted">Loading</p>'}</div></div>`;
}
async function coLoadNotes(id) {
  try { CO.notes.set(id, (await coCall(`/api/coach/clients/${id}/notes`)).notes); } catch (e) { CO.err = e.message; CO.notes.set(id, []); }
  CO.nl.delete(id);
  if (S.tab === 'coach' && CO.tab === 'notes') render();
}

function coReportHtml(c, e) {
  if (!e) return '<div class="card pad co-sec"><p class="muted">There is no data to report on yet.</p></div>';
  const last = todayIso();
  return `<div class="card pad co-sec" style="max-width:640px"><h2 style="font-size:17px">Weekly report</h2><p class="muted" style="margin-top:6px;font-size:14px">A summary of one week you can read, copy into a message, or save as a spreadsheet.</p>
    <div style="margin-top:14px"><label for="co-rend" style="font-size:14px;font-weight:500;display:block;margin-bottom:6px">Week ending</label><input class="field" type="date" id="co-rend" value="${esc(last)}" max="${esc(last)}"></div>
    <div class="abtns"><button class="btn primary" data-co="report" data-id="${esc(c.id)}">Make report</button></div></div>`;
}
function coReportData(c, e, end) {
  const st = coStats(c, e, 7, end), tg = st.tg, cur = st.currency, pct = (v, g) => g > 0 ? ` (${Math.round(v / g * 100)}% of ${n0(g)})` : '';
  const L = [`${c.name}: week ${dMed(st.from)} to ${dMed(st.end)}`, '', `Days logged: ${st.logged} of 7`];
  if (st.logged) {
    L.push(`Average per logged day: ${n0(st.avg.kcal)} kcal${pct(st.avg.kcal, tg && tg.kcal)}, protein ${n0(st.avg.pro)} g${pct(st.avg.pro, tg && tg.pro)}, carbs ${n0(st.avg.carb)} g${pct(st.avg.carb, tg && tg.carb)}, fat ${n0(st.avg.fat)} g${pct(st.avg.fat, tg && tg.fat)}, fiber ${n0(st.avg.fiber)} g`);
    if (st.kcalHit != null) L.push(`Calories within 10% of target: ${st.kcalHit} of ${st.logged} days`);
    if (st.proHit != null) L.push(`Protein at least 90% of target: ${st.proHit} of ${st.logged} days`);
  } else L.push('Nothing was logged this week.');
  if (st.cost.priced) L.push(`Food cost: ${coMoney(st.cost.total, cur)} over ${st.cost.priced} priced ${st.cost.priced === 1 ? 'day' : 'days'}, ${coMoney(st.cost.perDay, cur)} per day${st.cost.per100pro ? `, ${coMoney(st.cost.per100pro, cur)} per 100 g protein` : ''}`);
  if (st.weight) L.push(`Weight: ${coKg(st.weight.last, st.wunit)}${st.weight.n > 1 ? ` (${st.weight.last - st.weight.first >= 0 ? '+' : ''}${coKg(st.weight.last - st.weight.first, st.wunit)} this week)` : ''}`);
  if (st.topPro.length) L.push('', 'Most protein from: ' + st.topPro.map(o => `${o.name} ${n0(o.pro)} g`).join(', '));
  if (st.topCost.length && st.cost.priced) L.push('Costs the most: ' + st.topCost.map(o => `${o.name} ${coMoney(o.cost, cur)}`).join(', '));
  if (tg && tg.note) L.push('', 'Coach note on targets: ' + tg.note);
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [['Date', 'Entries', 'kcal', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)', `Cost (${cur})`].join(',')].concat(st.rows.map(r => [r.d, r.n, Math.round(r.kcal), r.pro.toFixed(1), r.carb.toFixed(1), r.fat.toFixed(1), r.fiber.toFixed(1), r.priced ? r.cost.toFixed(2) : ''].map(q).join(','))).join('\n');
  return { st, text: L.join('\n'), csv, name: c.name };
}
function coReportDialog(c, e, end) {
  const r = coReportData(c, e, end), dlg = $('#dlg'); dlg.classList.add('wide');
  dlg.innerHTML = `<form method="dialog" class="co-report"><h2 id="dlg-title" style="font-size:20px">Weekly report</h2>
    <div>${coBars(r.st)}</div>
    <pre class="co-pre" id="co-pre">${esc(r.text)}</pre>
    <div><label for="co-extra">Add your own comment (not saved)</label><textarea class="field" id="co-extra" rows="3" style="width:100%;height:auto;padding:10px"></textarea></div>
    <div class="dlg-actions" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn primary" data-co="rep-copy">Copy text</button><button type="button" class="btn" data-co="rep-csv">Download CSV</button><button type="button" class="btn" data-co="rep-print">Print or save as PDF</button><button type="button" class="btn" data-act="close-dlg">Close</button></div></form>`;
  dlg._rep = r; dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
}

function coDataHtml(c, e) {
  const linked = c.status === 'active';
  const inviteBlock = linked
    ? `<p>Linked since ${esc(coDay(c.consented))}. ${c.clientEmail ? esc(c.clientEmail) + ' shares' : 'They share'}: ${Object.entries({ diary: 'diary', prices: 'prices', weights: 'weight log' }).filter(([k]) => c.scopes[k]).map(([, v]) => v).join(', ') || 'nothing'}. The client can withdraw access at any time.</p>`
    : `<p class="muted">${c.status === 'invited' ? 'An invitation is open. Create a new link to replace it.' : c.status === 'revoked' ? 'This client withdrew access on ' + esc(coDay(c.revoked)) + '. You can invite them again.' : 'Invite this client to share their own diary with you. They need a Meal cost account.'}</p><div class="abtns"><button class="btn primary" data-co="invite" data-id="${esc(c.id)}">Create invitation link</button></div>`;
  const imp = linked ? '' : `<section class="card pad co-sec"><h2 style="font-size:17px">Import data</h2><p class="muted" style="margin-top:6px;font-size:14px">For a client without an account, import their exports here: Cronometer's Food &amp; Recipe Entries and biometrics CSV files, or a Meal cost export file. Days in the file replace the same days in the profile.</p>
    <div class="abtns"><button class="btn" data-co="import" data-id="${esc(c.id)}">Import a file</button><button class="btn" data-co="prices-copy" data-id="${esc(c.id)}">Use my price list for costs</button></div>
    <p class="muted" style="font-size:13px;margin-top:8px">${e ? `${e.snap.entries.length} entries, ${new Set(e.snap.entries.map(x => x.date)).size} days, ${e.snap.weights.length} weigh-ins in this profile.` : 'The profile is empty.'}</p></section>`;
  return `<section class="card pad co-sec"><h2 style="font-size:17px">${linked ? 'Linked account' : 'Access'}</h2><div style="margin-top:8px">${inviteBlock}</div></section>${imp}
    <section class="card pad co-sec"><h2 style="font-size:17px">Client details</h2><form id="co-edit" data-id="${esc(c.id)}" class="fgrid" style="margin-top:12px"><div><label for="ce-n">Name</label><input class="field" style="width:100%" id="ce-n" maxlength="80" value="${esc(c.name)}"></div><div><label for="ce-e">Email (optional)</label><input class="field" style="width:100%" id="ce-e" type="email" maxlength="120" value="${esc(c.email)}"></div><div><button type="submit" class="btn">Save details</button></div></form></section>
    <section class="card pad co-sec"><h2 style="font-size:17px">Delete this client</h2><p class="muted" style="margin-top:6px;font-size:14px">Removes the profile, imported data, targets and notes from your account. A linked client's own diary is not touched.</p><div class="abtns"><button class="btn danger" data-co="delete" data-id="${esc(c.id)}">Delete client</button></div></section>`;
}

/* ---------- read-only client view: the app's own screens, fed with the client's data ---------- */
function coBanner() {
  if (!CO.view) return '';
  return `<div class="notice co-view" role="status">${IC.lock}<div><strong>Viewing ${esc(CO.view.name)}.</strong> Read only. Nothing here is saved or changes their data. <button class="btn sm" data-co="exit">Back to client</button></div></div>`;
}
function coNavHtml() {
  const lk = (t, l, ic) => `<a class="tab" href="#${t}"${navOf2(S.tab) === t ? ' aria-current="page"' : ''}>${ic}<span>${l}</span></a>`;
  return lk('day', 'Diary', TABIC.day) + lk('progress', 'Progress', TABIC.progress) + `<button type="button" class="tab" data-co="exit">${IC.left}<span>Client</span></button>`;
}
async function coEnter(id, tab) {
  const c = (CO.list || []).find(x => x.id === id); if (!c) return;
  let e; try { e = await coLoad(id); } catch (err) { toast(err.message); return; }
  if (!e.snap.entries.length) { toast('There is no diary to open yet.'); return; }
  CO.own = {}; for (const k of CO_SKEYS) CO.own[k] = S[k];
  CO.view = { id, name: c.name }; window.__mcView = true; document.body.classList.add('viewing');
  Object.assign(S, e.snap); indexRanges(); reindex(); ensurePrices();
  S.day = IDX.dates[IDX.dates.length - 1]; S.pa = null; S.cfrom = ''; S.cto = '';
  location.hash = tab || 'day'; render();
}
function coExit() {
  if (!CO.view) return;
  const id = CO.view.id; Object.assign(S, CO.own); CO.own = null; CO.view = null;
  window.__mcView = false; document.body.classList.remove('viewing');
  indexRanges(); reindex(); S.day = null; S.pa = null;
  location.hash = 'coach/' + id; render();
}
// While viewing a client only these controls work. Everything else would change data.
const CO_READ = new Set(['prev-day', 'next-day', 'pick-day', 'today', 'pnav', 'prange', 'week-step', 'tview', 'vmacro', 'vall', 'chip', 'toggle-all', 'nsort', 'sort-col', 'prow', 'toggle-unc', 'toggle-recipe', 'close-dlg', 'drawer', 'drawer-close', 'sb-toggle', 'theme', 'set-theme', 'copy-day', 'copy-week', 'export-csv', 'tour', 'tour-off']);
document.addEventListener('click', e => {
  if (!window.__mcView) return;
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (CO_READ.has(t.dataset.act)) return;
  e.preventDefault(); e.stopImmediatePropagation(); toast('This is read only.');
}, true);

/* ---------- client side: share with a coach ---------- */
async function coLoadSharing() {
  if (!(window.MealSync && MealSync.signed)) return;
  try { CO.sharing = (await coCall('/api/sharing')).links; CO.sharingErr = ''; } catch (e) { CO.sharingErr = e.message; CO.sharing = CO.sharing || []; }
  if (S.tab === 'account') render();
}
function sharingCard() {
  if (!(window.MealSync && MealSync.signed)) return '';
  if (CO.sharing === null && !CO.sl) { CO.sl = true; coLoadSharing().then(() => { CO.sl = false; }); }
  const links = CO.sharing || [], sc = { diary: 'Food diary and daily goals', prices: 'Food prices and costs', weights: 'Weight log' };
  const rows = links.map(l => `<div class="co-share" data-id="${esc(l.id)}"><div><b>${esc(l.coach)}</b><p class="muted" style="font-size:14px">Sharing since ${esc(coDay(l.since))}. Last viewed ${esc(coAgo((l.access.find(a => a.action === 'read') || {}).ts))}.</p></div>
    <fieldset class="co-scopes"><legend class="sr">What ${esc(l.coach)} can see</legend>${Object.entries(sc).map(([k, v]) => `<label class="cmp" style="margin:0"><input type="checkbox" data-co-scope="${k}" data-id="${esc(l.id)}"${l.scopes[k] ? ' checked' : ''}><span>${v}</span></label>`).join('')}</fieldset>
    ${l.targets ? `<div class="notice" style="margin-top:8px">${IC.info}<div><b>Targets from your coach:</b> ${n0(l.targets.kcal)} kcal, protein ${n0(l.targets.pro)} g, carbs ${n0(l.targets.carb)} g, fat ${n0(l.targets.fat)} g.${l.targets.note ? ' ' + esc(l.targets.note) : ''}<div style="margin-top:8px"><button class="btn sm" data-co="use-targets" data-id="${esc(l.id)}">Use as my daily goals</button></div></div></div>` : ''}
    <div class="abtns" style="margin-top:8px"><button class="btn" data-co="stop-share" data-id="${esc(l.id)}" data-who="${esc(l.coach)}">Stop sharing</button></div></div>`).join('');
  return `<section class="card pad"><h2>Sharing with a coach</h2>
    ${CO.sharingErr ? `<p style="margin-top:8px">${esc(CO.sharingErr)}</p>` : ''}
    ${CO.sharing === null ? '<p class="muted" style="margin-top:8px">Loading</p>' : links.length ? `<p class="muted" style="margin-top:8px">These coaches can read the parts you share, and nothing else. They cannot change your data. You can stop at any time and access ends straight away.</p><div class="co-shares">${rows}</div>` : '<p class="muted" style="margin-top:8px">You are not sharing your diary with anyone. If a coach sends you an invitation link, open it to review and accept.</p>'}</section>`;
}
function coJoinStore() {
  const m = /^#join=([A-Za-z0-9_-]{20,64})$/.exec(location.hash);
  if (m) { try { localStorage.setItem('mcc.join', m[1]); } catch (e) { CO.join = m[1]; } history.replaceState(null, '', location.pathname + '#day'); }
}
async function coJoinCheck() {
  if (!window.MealSync || !MealSync.ready || CO.joining) return;
  let tok = ''; try { tok = localStorage.getItem('mcc.join') || ''; } catch (e) { /* storage blocked */ } tok = tok || CO.join || '';
  if (!tok) return;
  const dlg = $('#dlg');
  if (!MealSync.signed) {
    if (dlg.open) return;
    dlg.classList.remove('wide');
    dlg.innerHTML = `<form method="dialog"><h2 id="dlg-title" style="font-size:20px">A coach invited you</h2><p class="muted" style="font-size:14px">Sign in with Google to see what they would be able to view and to accept. Nothing is shared until you do.</p><div class="dlg-actions" style="gap:8px"><a class="btn primary" href="/auth/google" data-sync="signin">Sign in with Google</a><button type="button" class="btn" data-co="join-cancel">Not now</button></div></form>`;
    dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal(); return;
  }
  CO.joining = true;
  try {
    const inv = await coCall('/api/coach/invite/' + tok);
    if (inv.own) { coJoinClear(); toast('This is your own invitation.'); CO.joining = false; return; }
    const sc = { diary: 'My food diary and daily goals', prices: 'My food prices, so costs can be shown', weights: 'My weight log' };
    dlg.classList.remove('wide'); if (dlg.open) dlg.close();
    dlg.innerHTML = `<form method="dialog" id="co-join"><h2 id="dlg-title" style="font-size:20px">Share your diary with ${esc(inv.coach)}?</h2>
      <p class="muted" style="font-size:14px">${esc(inv.coach)} asked to follow your tracking${inv.name ? ' as "' + esc(inv.name) + '"' : ''}. Choose what to share. They can read it, not change it.</p>
      <fieldset class="co-scopes" style="margin:0">${Object.entries(sc).map(([k, v]) => `<label class="cmp" style="margin:0 0 6px"><input type="checkbox" data-join-scope="${k}"${inv.scopes[k] ? ' checked' : ''}><span>${v}</span></label>`).join('')}</fieldset>
      <p class="muted" style="font-size:13px">Food and weight data can reveal information about your health. By accepting you agree that Meal cost shows the parts you ticked to ${esc(inv.coach)}, who decides how to use them for coaching you. You can change this or stop sharing in Account at any time, and access ends at once. <a href="/privacy">Privacy policy</a></p>
      <label class="cmp" style="margin:0"><input type="checkbox" id="co-consent"><span>I agree to share the parts I ticked with ${esc(inv.coach)}.</span></label>
      <div id="co-jerr" class="sub" style="color:var(--offer-ink)" role="alert"></div>
      <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Accept and share</button><button type="button" class="btn" data-co="join-cancel">Decline</button></div></form>`;
    dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
    $('#co-join').addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!$('#co-consent').checked) { $('#co-jerr').textContent = CO_ERR.consent_required; return; }
      const scopes = {}; $$('[data-join-scope]').forEach(i => { scopes[i.dataset.joinScope] = i.checked; });
      try { await coCall('/api/coach/invite/' + tok, coJb('POST', { consent: true, scopes })); dlg.close(); coJoinClear(); CO.sharing = null; toast(`Now sharing with ${inv.coach}`); go('account'); }
      catch (err) { $('#co-jerr').textContent = err.message; }
    });
  } catch (err) { coJoinClear(); if (dlg.open) dlg.close(); toast(err.message); }
  CO.joining = false;
}
function coJoinClear() { try { localStorage.removeItem('mcc.join'); } catch (e) { /* ignore */ } CO.join = null; }

/* ---------- actions ---------- */
function coAddDialog() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  dlg.innerHTML = `<form id="co-add" method="dialog" novalidate><h2 id="dlg-title" style="font-size:20px">Add a client</h2>
    <div><label for="ca-n">Name</label><input class="field" style="width:100%" id="ca-n" maxlength="80" autocomplete="off"></div>
    <div><label for="ca-e">Email (optional)</label><input class="field" style="width:100%" id="ca-e" type="email" maxlength="120" autocomplete="off"></div>
    <p class="muted" style="font-size:13px">You can invite them to share their own diary, or import their Cronometer exports into a profile. Only add people you coach and have agreed to this with.</p>
    <div id="ca-err" class="sub" style="color:var(--offer-ink)" role="alert"></div>
    <div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Add client</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal(); $('#ca-n').focus();
  $('#co-add').addEventListener('submit', async ev => {
    ev.preventDefault();
    const name = $('#ca-n').value.trim(); if (!name) { $('#ca-err').textContent = 'Enter a name.'; return; }
    try { const j = await coCall('/api/coach/clients', coJb('POST', { name, email: $('#ca-e').value.trim() })); dlg.close(); await coLoadList(true); location.hash = 'coach/' + j.id; toast('Client added'); }
    catch (err) { $('#ca-err').textContent = err.message; }
  });
}
async function coInvite(id) {
  try {
    const j = await coCall(`/api/coach/clients/${id}/invite`, coJb('POST', {}));
    const link = `${location.origin}/#join=${j.token}`, c = CO.list.find(x => x.id === id), dlg = $('#dlg'); dlg.classList.remove('wide');
    dlg.innerHTML = `<form method="dialog"><h2 id="dlg-title" style="font-size:20px">Invitation link</h2><p class="muted" style="font-size:14px">Send this to ${esc(c ? c.name : 'your client')}. It works once and expires in ${j.days} days. They sign in with Google and choose what to share.</p>
      <input class="field" style="width:100%" id="co-link" readonly value="${esc(link)}" aria-label="Invitation link">
      <div class="dlg-actions" style="gap:8px"><button type="button" class="btn primary" data-co="copy-link">Copy link</button><button type="button" class="btn" data-act="close-dlg">Close</button></div></form>`;
    dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal(); await coLoadList(true);
  } catch (err) { toast(err.message); }
}
async function coSaveProfile(id, mut) {
  const cur = await coLoad(id, true), raw = { ...(cur.raw || {}) };
  mut(raw);
  const res = await MealSync.api(`/api/coach/clients/${id}/data?base=${cur.rev}`, { method: 'PUT', body: await coGz(JSON.stringify({ v: 1, data: raw })), headers: { 'content-type': 'application/octet-stream' } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(CO_ERR[j.error] || 'Could not save the profile.'); e.code = j.error; throw e; }
  CO.cache.delete(id); await coLoad(id, true); await coLoadList(true);
}
function coWeightsFromCsv(text) {
  const first = text.split(/\r?\n/, 1)[0], delim = first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows = parseCSV(text, delim); if (rows.length < 2) return null;
  const h = rows[0].map(x => x.trim().toLowerCase()), at = (...n) => h.findIndex(x => n.includes(x));
  const iD = at('day', 'date'), iM = at('metric'), iU = at('unit'), iA = at('amount', 'value'); if (iD < 0 || iM < 0 || iA < 0) return null;
  const found = new Map();
  for (const r of rows.slice(1)) {
    if (!r[iM] || r[iM].trim().toLowerCase() !== 'weight') continue;
    const date = normDate(r[iD]), amt = parseFloat(String(r[iA] || '').replace(',', '.')), u = String(iU >= 0 ? r[iU] : 'kg').trim().toLowerCase();
    const kg = u.startsWith('lb') ? amt * 0.453592 : u === 'st' ? amt * 6.35029 : u === 'g' ? amt / 1000 : amt;
    if (date && kg >= 20 && kg <= 400) found.set(date, Math.round(kg * 100) / 100);
  }
  return found;
}
async function coImportFile(id, file) {
  if (!file) return;
  if (file.size > 30e6) { toast('That file is larger than 30 MB.'); return; }
  let text; try { text = await file.text(); } catch (e) { toast('Could not read that file.'); return; }
  try {
    const kind = sniffFile(text, file), cur = await coLoad(id, true);
    if (kind === 'backup') {
      const d = JSON.parse(text);
      if (d.app !== 'mealcost') throw new Error('That is not a Meal cost file.');
      await coSaveProfile(id, raw => {
        for (const k of ['prices', 'overrides', 'currency', 'budget', 'merges', 'nomerge', 'ranges', 'cats', 'recipes', 'foods', 'goals', 'wunit']) if (d[k] != null) raw[k] = JSON.stringify(d[k]);
        if (Array.isArray(d.entries)) { const have = coBuild(raw).entries, dates = new Set(d.entries.map(e => e && e.date)); raw.entries = JSON.stringify(have.filter(e => !dates.has(e.date)).concat(d.entries).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); }
        if (Array.isArray(d.weights)) { const m = new Map(coBuild(raw).weights.map(w => [w.date, w])); for (const w of d.weights) if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Number(w.kg) > 0) m.set(w.date, { date: w.date, kg: Number(w.kg) }); raw.weights = JSON.stringify([...m.values()].sort((a, b) => a.date < b.date ? -1 : 1)); }
      });
      toast('Imported into the profile');
    } else if (kind === 'biometrics') {
      const found = coWeightsFromCsv(text); if (!found || !found.size) throw new Error('No weigh-ins found in that file.');
      await coSaveProfile(id, raw => { const m = new Map(coBuild(raw).weights.map(w => [w.date, w])); for (const [date, kg] of found) m.set(date, { date, kg }); raw.weights = JSON.stringify([...m.values()].sort((a, b) => a.date < b.date ? -1 : 1)); });
      toast(`Imported ${found.size} weigh-ins`);
    } else {
      const list = parseCronometer(text), dates = new Set(list.map(e => e.date));
      await coSaveProfile(id, raw => { const have = coBuild(raw).entries; raw.entries = JSON.stringify(have.filter(e => !dates.has(e.date)).concat(list).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); });
      toast(`Imported ${list.length} entries from ${dates.size} days`);
    }
    void cur;
  } catch (err) { toast(err.message || 'Could not import that file.'); }
  if (S.tab === 'coach') render();
}
function coPick(id) {
  let f = $('#cofile');
  if (!f) { f = document.createElement('input'); f.type = 'file'; f.id = 'cofile'; f.accept = '.csv,.json,text/csv,application/json'; f.hidden = true; document.body.appendChild(f); }
  f.onchange = () => { const x = f.files[0]; f.value = ''; coImportFile(id, x); };
  f.click();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-co]'); if (!t) return;
  const a = t.dataset.co, id = t.dataset.id;
  switch (a) {
    case 'add': coAddDialog(); break;
    case 'tab': CO.tab = t.dataset.v; CO.err = ''; render(); break;
    case 'days': CO.days = Number(t.dataset.v) || 7; render(); break;
    case 'open': coEnter(id, 'day'); break;
    case 'open-progress': coEnter(id, 'progress'); break;
    case 'exit': coExit(); break;
    case 'invite': coInvite(id); break;
    case 'copy-link': { const i = $('#co-link'); try { await navigator.clipboard.writeText(i.value); toast('Link copied'); } catch (err) { i.select(); toast('Select the link and copy it'); } break; }
    case 'import': coPick(id); break;
    case 'prices-copy':
      if (!confirm('Copy your own price list, price periods and currency into this profile? It replaces any prices stored there.')) break;
      try { await coSaveProfile(id, raw => { raw.prices = JSON.stringify(S.prices); raw.overrides = JSON.stringify(S.overrides); raw.ranges = JSON.stringify(S.ranges); raw.currency = JSON.stringify(S.currency); raw.merges = JSON.stringify(S.merges); raw.cats = JSON.stringify(S.cats); }); toast('Prices copied'); render(); } catch (err) { toast(err.message); }
      break;
    case 'delete':
      if (confirm('Delete this client with their profile data, targets and notes? This cannot be undone.')) { try { await coCall('/api/coach/clients/' + id, { method: 'DELETE', headers: {} }); CO.cache.delete(id); CO.notes.delete(id); await coLoadList(true); location.hash = 'coach'; toast('Client deleted'); } catch (err) { toast(err.message); } }
      break;
    case 'targets-own': { const c = CO.list.find(x => x.id === CO.cur()), en = CO.cache.get(c.id), g = en && en.snap.goals; if (g) { $('#ct-k').value = g.kcal || ''; $('#ct-p').value = g.pro || ''; $('#ct-c').value = g.carb || ''; $('#ct-f').value = g.fat || ''; $('#ct-b').value = g.fiber || ''; } break; }
    case 'targets-clear': try { await coCall('/api/coach/clients/' + id, coJb('PUT', { targets: null })); await coLoadList(true); CO.cache.forEach(v => v.stats.clear()); toast('Targets removed'); } catch (err) { toast(err.message); } break;
    case 'note-del': if (confirm('Delete this note?')) { try { await coCall('/api/coach/notes/' + id, { method: 'DELETE', headers: {} }); await coLoadNotes(t.dataset.client); } catch (err) { toast(err.message); } } break;
    case 'note-edit': {
      const cid = CO.cur(), n = (CO.notes.get(cid) || []).find(x => x.id === id); if (!n) break;
      const dlg = $('#dlg'); dlg.classList.remove('wide');
      dlg.innerHTML = `<form method="dialog" id="co-nedit"><h2 id="dlg-title" style="font-size:20px">Edit note</h2><textarea class="field" id="cne" rows="6" maxlength="4000" aria-label="Note" style="width:100%;height:auto;padding:10px">${esc(n.body)}</textarea><div class="dlg-actions" style="gap:8px"><button type="submit" class="btn primary">Save</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
      dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
      $('#co-nedit').addEventListener('submit', async ev => { ev.preventDefault(); try { await coCall('/api/coach/notes/' + id, coJb('PUT', { body: $('#cne').value })); dlg.close(); await coLoadNotes(cid); } catch (err) { toast(err.message); } });
      break;
    }
    case 'report': { const c = CO.list.find(x => x.id === id), en = CO.cache.get(id), end = $('#co-rend') && /^\d{4}-\d{2}-\d{2}$/.test($('#co-rend').value) ? $('#co-rend').value : todayIso(); if (c && en) coReportDialog(c, en, end); break; }
    case 'rep-copy': { const r = $('#dlg')._rep, extra = $('#co-extra').value.trim(); try { await navigator.clipboard.writeText(r.text + (extra ? '\n\n' + extra : '')); toast('Report copied'); } catch (err) { toast('Could not copy. Select the text instead.'); } break; }
    case 'rep-csv': { const r = $('#dlg')._rep; download(`weekly-${r.name.replace(/[^\w-]+/g, '-').slice(0, 30)}-${r.st.end}.csv`, new Blob([r.csv], { type: 'text/csv;charset=utf-8' })); break; }
    case 'rep-print': window.print(); break;
    case 'use-targets': {
      const l = (CO.sharing || []).find(x => x.id === id), g = l && cleanGoals(l.targets);
      if (g) { S.goals = g; saveAll(); toast('Your daily goals now match your coach\'s targets'); }
      break;
    }
    case 'stop-share':
      if (confirm(`Stop sharing with ${t.dataset.who}? They lose access straight away.`)) { try { await coCall('/api/sharing/' + id, { method: 'DELETE', headers: {} }); CO.sharing = null; toast('Sharing stopped'); coLoadSharing(); } catch (err) { toast(err.message); } }
      break;
    case 'join-cancel': coJoinClear(); $('#dlg').close(); break;
  }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'co-targets') {
    e.preventDefault();
    const v = i => num($('#' + i).value), t = { kcal: v('ct-k'), pro: v('ct-p'), carb: v('ct-c'), fat: v('ct-f'), fiber: v('ct-b'), x: {}, note: $('#ct-n').value.trim() };
    if (!(t.kcal > 0)) { $('#ct-err').textContent = CO_ERR.bad_targets; return; }
    try { await coCall('/api/coach/clients/' + f.dataset.id, coJb('PUT', { targets: t })); await coLoadList(true); CO.cache.forEach(x => x.stats.clear()); toast('Targets saved'); render(); } catch (err) { $('#ct-err').textContent = err.message; }
  } else if (f.id === 'co-note') {
    e.preventDefault(); const body = $('#cn').value.trim(); if (!body) return;
    try { await coCall(`/api/coach/clients/${f.dataset.id}/notes`, coJb('POST', { body })); await coLoadNotes(f.dataset.id); } catch (err) { toast(err.message); }
  } else if (f.id === 'co-edit') {
    e.preventDefault();
    try { await coCall('/api/coach/clients/' + f.dataset.id, coJb('PUT', { name: $('#ce-n').value, email: $('#ce-e').value })); await coLoadList(true); toast('Saved'); render(); } catch (err) { toast(err.message); }
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset && t.dataset.coScope) {
    const row = t.closest('.co-share'), scopes = {}; row.querySelectorAll('[data-co-scope]').forEach(i => { scopes[i.dataset.coScope] = i.checked; });
    try { await coCall('/api/sharing/' + t.dataset.id, coJb('PUT', { scopes })); toast('Sharing updated'); } catch (err) { t.checked = !t.checked; toast(err.message); }
  } else if (t.dataset && t.dataset.coGrant) {
    const on = t.checked;
    try { await coCall('/api/admin/users/' + t.dataset.coGrant, coJb('PUT', { coach: on })); const u = RC.users.find(x => x.id === t.dataset.coGrant); if (u) u.coach = on; render(); toast(on ? 'Coach tools enabled' : 'Coach tools removed'); } catch (err) { t.checked = !on; toast('Could not save. Try again.'); }
  }
});
coJoinStore();
window.addEventListener('hashchange', coJoinStore);
