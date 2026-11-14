/* The bottom bar with the + button, the Add sheet and the More screen. Loaded before app.js. */
'use strict';

const PLUS_IC = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const MORE_TABS = ['more', 'goals', 'meals', 'account', 'admin', 'pantry'];
const navOf2 = t => ['progress', 'weight', 'week', 'trends'].includes(t) ? 'progress' : MORE_TABS.includes(t) ? 'more' : t;

function navHtml() {
  const I = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const cur = t => t === 'more' ? S.tab === 'more' : navOf2(S.tab) === t;
  const link = (t, l, ic) => `<a class="tab" href="#${t}" aria-label="${l}" title="${l}"${cur(t) ? ' aria-current="page"' : ''}${t === 'more' && S.tab !== 'more' && MORE_TABS.includes(S.tab) ? ' data-sub="1"' : ''}>${ic}<span>${l}</span></a>`;
  const desk = (t, l, ic) => `<a class="tab desk" href="#${t}" aria-label="${l}" title="${l}"${S.tab === t ? ' aria-current="page"' : ''}>${ic}<span>${l}</span></a>`;
  return [
    link('day', 'Diary', TABIC.day), link('progress', 'Progress', TABIC.progress),
    `<button type="button" class="tab plus" data-act="plus" aria-label="Add to diary" aria-haspopup="dialog"><span class="plusdot">${PLUS_IC}</span><span class="plusl">Add</span></button>`,
    link('prices', 'Foods', TABIC.prices),
    desk('meals', 'Meals', TABIC.meals),
    desk('pantry', 'Pantry', I('<path d="M5 8h14v12H5zM4 4h16v4H4zM9 12h6"/>')),
    desk('goals', 'Targets', I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>')),
    link('more', 'More', TABIC.more),
  ].join('');
}

/* ---------- the + sheet: everything that adds something ---------- */
function openPlus() {
  const dlg = $('#dlg'), day = S.day || mealToday();
  const big = (cls, act, label, ic, extra = '') => `<button type="button" class="pl-big ${cls}" data-act="${act}" data-date="${day}" ${extra}><span class="pl-ic">${ic}</span><span>${label}</span></button>`;
  const small = (cls, act, label, ic, extra = '') => `<button type="button" class="pl-small" data-act="${act}" data-date="${day}" ${extra}><span class="pl-ic ${cls}">${ic}</span><span>${label}</span></button>`;
  const I = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const tiles = [
    small('c3', 'goto-open', 'Go-to meal', I('<path d="M4 12h16a8 8 0 0 1-16 0zM8 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3"/>'), 'data-group=""'),
    small('c4', 'quick-add', 'Quick add', I('<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>')),
    small('c5', 'log-weight', 'Log weight', I('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 10a4 4 0 0 1 6 0"/><path d="M12 12l2-2"/>')),
    small('c6', 'add-food', 'New food', I('<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9zM4 7.500l8 4.500 8-4.500M12 12v9"/>')),
    small('c7', 'copy-prev', 'Copy a day', I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'), 'data-group=""'),
    rcOk() ? small('c8', 'scan-receipt', 'Scan receipt', I('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>')) : ''
  ].join('');
  dlg.className = 'sheet';
  dlg.innerHTML = `<form method="dialog" class="plsheet"><div class="pl-head"><h2 id="dlg-title">Add to diary</h2><button type="button" class="btn link" data-act="close-dlg">Close</button></div>
    <div class="pl-bigs">${big('c1', 'log-food', 'Search food', I('<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/>'))}${big('c2', 'plus-scan', 'Scan barcode', I('<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M12 8v8M16 8v8"/>'))}</div>
    <div class="pl-smalls">${tiles}</div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); dlg.showModal();
}
document.addEventListener('DOMContentLoaded', () => {
  const dlg = document.getElementById('dlg');
  if (dlg) dlg.addEventListener('close', () => dlg.classList.remove('sheet'));
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const dl = t.closest('dialog.sheet');
  if (t.dataset.act === 'plus') { openPlus(); return; }
  if (dl && t.dataset.act !== 'close-dlg') {
    dl.close(); dl.classList.remove('sheet');
    if (t.dataset.act === 'plus-scan') { openFood(); setTimeout(() => { const b = $('#fscan'); if (b) b.click(); else toast('Scanning is not available here. Type the barcode instead.'); }, 60); e.stopImmediatePropagation(); }
  }
}, true);

/* ---------- More: settings and everything that is not a daily screen ---------- */
function moreRow(href, act, icon, label, sub, end) {
  const inner = `<span class="mr-ic">${icon}</span><span class="mr-t"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${end || '<span class="mr-go" aria-hidden="true">›</span>'}`;
  return href ? `<a class="mr-row" href="${href}" data-q="${esc((label + ' ' + (sub || '')).toLowerCase())}">${inner}</a>` : `<button type="button" class="mr-row" data-act="${act}" data-q="${esc((label + ' ' + (sub || '')).toLowerCase())}">${inner}</button>`;
}
function moreView() {
  const U = window.MealSync, signed = U && U.signed, I = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const sec = (title, rows) => rows.filter(Boolean).length ? `<h2 class="mr-sec">${title}</h2><div class="mr-card">${rows.filter(Boolean).join('')}</div>` : '';
  const cur = `<label class="mr-row mr-static" data-q="currency money"><span class="mr-ic">${TOOLIC.currency}</span><span class="mr-t"><b>Currency</b></span>${curSelect('dcur')}</label>`;
  return `<div class="titlerow"><h1 class="h1" id="h1" tabindex="-1">More</h1></div>
  <p class="muted mr-who">${signed ? `Signed in as ${esc(U.email)}${U.statusText && U.statusText() ? ' · ' + esc(U.statusText()) : ''}` : 'Not signed in. Your data stays on this device.'}</p>
  <div class="search mr-search">${IC.search}<input type="search" id="moresearch" aria-label="Search settings" placeholder="Search settings"></div>
  <div id="morebody">
  ${sec('Your plan', [
    moreRow('#goals', '', I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'), 'Targets', 'Calories and macros, with a calculator'),
    moreRow('#meals', '', TABIC.meals, 'Meals', 'Go-to meals and the meal builder'),
    moreRow('#pantry', '', I('<path d="M5 8h14v12H5zM4 4h16v4H4zM9 12h6"/>'), 'Pantry', 'What is in the house, and meal ideas'),
    moreRow('#prices', '', TABIC.prices, 'Foods and prices', 'What each food costs, offers and merges')
  ])}
  ${sec('Account', [
    moreRow('#account', '', TOOLIC.account, 'Account and data', signed ? 'Sync, backup, delete' : 'Sign in, backup, delete'),
    U && U.admin ? moreRow('#admin', '', I('<path d="M12 3l8 3v6c0 4.500-3.400 8-8 9-4.600-1-8-4.500-8-9V6z"/><path d="M9 12l2 2 4-4"/>'), 'Access', 'Who can use receipt scanning') : ''
  ])}
  ${sec('Display', [
    moreRow('', 'theme', TOOLIC.theme, 'Theme', '', `<em class="mr-val">${esc(themeLabel())}</em>`),
    cur
  ])}
  ${sec('Import and export', [
    moreRow('', 'import', TOOLIC.import, 'Add Cronometer export', 'Bring in days from a CSV file'),
    moreRow('', 'export-csv', TOOLIC['export-csv'], 'Download CSV', 'Your diary with costs')
  ])}
  ${sec('App', [
    window.MealNative && MealNative.canUpdate ? moreRow('', 'update-check', I('<path d="M12 4v10M8 10l4 4 4-4M5 20h14"/>'), 'Check for updates', S.update && S.update.available ? 'A new version is ready' : '') : '',
    moreRow('', 'tour', I('<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .9-1 1.700M12 17h.01"/>'), 'How it works', 'A one minute tour'),
    moreRow('/android', '', I('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'), 'Get the app', 'Android and iPhone')
  ])}
  ${sec('About', [
    moreRow('/privacy', '', I('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), 'Privacy policy', ''),
    moreRow('/terms', '', I('<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>'), 'Terms of service', ''),
    moreRow('https://coachleonidas.com', '', I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.500 3 14.500 0 18M12 3c-3 3.500-3 14.500 0 18"/>'), 'coachleonidas.com', 'By Coach Leonidas')
  ])}
  </div>`;
}
document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'moresearch') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#morebody .mr-row').forEach(r => { r.hidden = !!q && !(r.dataset.q || '').includes(q); });
  document.querySelectorAll('#morebody .mr-card').forEach(c => { const any = [...c.children].some(r => !r.hidden); c.hidden = !any; if (c.previousElementSibling) c.previousElementSibling.hidden = !any; });
});
