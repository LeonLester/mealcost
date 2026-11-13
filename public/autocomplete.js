/* Replaces the browser's native <datalist> popup (unreadable in dark mode on Android) with a themed list. */
(() => {
  'use strict';
  const ul = document.createElement('ul');
  ul.className = 'ac'; ul.setAttribute('role', 'listbox'); ul.setAttribute('popover', 'manual'); ul.hidden = true;
  let cur = null, items = [], hi = -1, quiet = false;
  const mount = () => document.body.appendChild(ul);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  const idOf = inp => {
    if (inp.getAttribute('list')) { inp.dataset.ac = inp.getAttribute('list'); inp.removeAttribute('list'); }
    return inp.dataset.ac;
  };
  const isField = el => el && el.tagName === 'INPUT' && (el.hasAttribute('list') || el.dataset.ac);
  function hide() {
    ul.hidden = true; cur = null; hi = -1;
    try { if (ul.matches(':popover-open')) ul.hidePopover(); } catch (e) {}
  }
  function place() {
    if (!cur) return;
    const r = cur.getBoundingClientRect(), vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
    const below = vh - r.bottom, above = r.top;
    ul.style.left = Math.max(8, r.left) + 'px'; ul.style.width = Math.min(r.width, innerWidth - 16) + 'px';
    if (below >= 180 || below >= above) { ul.style.top = r.bottom + 4 + 'px'; ul.style.bottom = 'auto'; ul.style.maxHeight = Math.max(120, below - 12) + 'px'; }
    else { ul.style.bottom = (innerHeight - r.top + 4) + 'px'; ul.style.top = 'auto'; ul.style.maxHeight = Math.max(120, above - 12) + 'px'; }
  }
  function render() {
    ul.innerHTML = items.map((v, i) => `<li role="option" data-i="${i}" aria-selected="${i === hi}"></li>`).join('');
    [...ul.children].forEach((li, i) => { li.textContent = items[i]; });
    const sel = ul.querySelector('[aria-selected=true]'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function show(inp) {
    const dl = document.getElementById(idOf(inp) || '');
    if (!dl) return hide();
    const q = inp.value.trim().toLowerCase();
    const all = [...dl.options].map(o => o.value);
    const starts = all.filter(v => v.toLowerCase().startsWith(q)), has = all.filter(v => !v.toLowerCase().startsWith(q) && v.toLowerCase().includes(q));
    items = [...starts, ...has].filter(v => v.toLowerCase() !== q).slice(0, 8);
    if (!items.length) return hide();
    cur = inp; hi = -1; render(); ul.hidden = false;
    try { if (!ul.matches(':popover-open')) ul.showPopover(); } catch (e) {}
    place();
  }
  function choose(i) {
    if (!cur || items[i] == null) return;
    const inp = cur; quiet = true;
    inp.value = items[i];
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    quiet = false; hide();
  }
  document.addEventListener('focusin', e => { if (isField(e.target)) show(e.target); else if (e.target !== ul) hide(); });
  document.addEventListener('input', e => { if (!quiet && isField(e.target)) show(e.target); });
  document.addEventListener('focusout', e => { if (e.target === cur) setTimeout(() => { if (document.activeElement !== cur) hide(); }, 120); });
  document.addEventListener('keydown', e => {
    if (!cur || ul.hidden) return;
    if (e.key === 'ArrowDown') { hi = Math.min(items.length - 1, hi + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && hi >= 0) { choose(hi); e.preventDefault(); }
    else if (e.key === 'Escape') { hide(); }
  }, true);
  ul.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(Number(li.dataset.i)); } });
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  if (window.visualViewport) visualViewport.addEventListener('resize', place);
})();
