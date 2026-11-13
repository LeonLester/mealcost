/* Glue for the Android app (Capacitor). On the web this only defines isNative = false. */
(() => {
  'use strict';
  const C = window.Capacitor;
  const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  const HOME = 'https://mealcost.coachleonidas.com';
  const P = () => (C && C.Plugins) || {};
  const toBase64 = blob => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  // WebViews cannot save a blob download, so write the file to the app cache and hand it to the Android share sheet.
  async function save(name, blob) {
    const data = await toBase64(blob);
    const file = await P().Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    await P().Share.share({ title: name, url: file.uri, dialogTitle: `Save or send ${name}` });
  }
  const openUrl = url => P().Browser.open({ url });
  window.MealNative = { isNative, save, openUrl, home: HOME };
  if (!isNative) return;

  document.documentElement.classList.add('native');
  document.addEventListener('DOMContentLoaded', () => {
    // Android's picker greys out files whose type it does not recognise, so accept anything and let the importer check it.
    for (const id of ['file', 'pfile']) { const el = document.getElementById(id); if (el) el.removeAttribute('accept'); }
  });
  // The privacy and terms pages live on the website, not in the app.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const h = a.getAttribute('href');
    if (h === '/privacy' || h === '/terms') { e.preventDefault(); openUrl(HOME + h).catch(() => {}); }
    else if (/^https?:\/\//.test(h) && a.target === '_blank') { e.preventDefault(); openUrl(h).catch(() => {}); }
  });
  // Back button: close a dialog first, then go back, then leave the app.
  const App = P().App;
  if (App && App.addListener) {
    App.addListener('backButton', ev => {
      if (document.body.classList.contains('drawer-open')) { document.body.classList.remove('drawer-open'); return; }
      const dlg = document.getElementById('dlg');
      if (dlg && dlg.open) { dlg.close(); return; }
      if (ev && ev.canGoBack) history.back(); else if (App.exitApp) App.exitApp();
    });
  }
})();
