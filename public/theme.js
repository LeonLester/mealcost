/* Light / dark / auto theme. Loaded in <head> so the right colours show on first paint. */
(() => {
  'use strict';
  const K = 'mcc.theme', root = document.documentElement;
  const get = () => { try { const v = localStorage.getItem(K); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } };
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  const isDark = () => get() === 'dark' || (get() === 'auto' && mq.matches);
  function apply() {
    const t = get();
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    const d = isDark();
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', d ? '#000000' : '#FFFFFF');
    try {
      const C = window.Capacitor, SB = C && C.Plugins && C.Plugins.SystemBars;
      if (SB && SB.setStyle) SB.setStyle({ style: d ? 'DARK' : 'LIGHT' }).catch(() => {});
    } catch (e) {}
  }
  function set(t) { try { if (t === 'auto') localStorage.removeItem(K); else localStorage.setItem(K, t); } catch (e) {} apply(); }
  const next = { auto: 'light', light: 'dark', dark: 'auto' };
  window.MealTheme = { get, isDark, set, cycle() { set(next[get()]); return get(); } };
  if (mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();
