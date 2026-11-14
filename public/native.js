/* Glue for the Android app (Capacitor). On the web this only defines isNative = false. */
(() => {
  'use strict';
  const C = window.Capacitor;
  const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  const HOME = 'https://mealcost.coachleonidas.com';
  const platform = C && typeof C.getPlatform === 'function' ? C.getPlatform() : 'android';
  // Only the Android app updates itself from GitHub. iPhone builds are re-installed through the sideloading tool.
  const canUpdate = isNative && platform === 'android';
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
  // Update check: the release notes carry "Build N". A newer N than the installed build means an update.
  const REL = 'https://api.github.com/repos/LeonLester/mealcost/releases/tags/android-latest';
  const APK = 'https://github.com/LeonLester/mealcost/releases/download/android-latest/mealcost.apk';
  const get = k => { try { return localStorage.getItem('mcc.' + k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem('mcc.' + k, v); } catch (e) { /* storage blocked */ } };
  async function checkUpdate(force) {
    if (!canUpdate || !P().App || !P().App.getInfo) return null;
    if (!force && Date.now() - Number(get('upd.at') || 0) < 6 * 3600e3) return null;
    const cur = Number((await P().App.getInfo()).build) || 0;
    const res = await fetch(REL, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('release');
    const m = /Build (\d+)/.exec((await res.json()).body || ''); if (!m) throw new Error('notes');
    put('upd.at', String(Date.now()));
    const latest = Number(m[1]);
    return { current: cur, latest, available: latest > cur, skipped: !force && String(latest) === get('upd.skip'), url: APK };
  }
  const skipUpdate = n => put('upd.skip', String(n));
  window.MealNative = { isNative, canUpdate, platform, save, openUrl, home: HOME, checkUpdate, skipUpdate };
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
