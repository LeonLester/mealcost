/* One door for every file: drop it anywhere on the page, or use a drop area. Works out what the file is. Loaded before app.js. */
'use strict';

const UP_IC = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V5M7.500 9.500L12 5l4.500 4.500M5 19h14"/></svg>';

/* A visible "drop a file or choose" area. kind picks the wording and which files it takes. */
function dropzone(kind = 'any') {
  const T = {
    food: ['Drop your Cronometer export here', 'or choose a file. Servings.csv from Cronometer works best.', '.csv,text/csv'],
    weight: ['Drop your weigh-ins here', 'Cronometer’s biometrics.csv, or choose a file.', '.csv,text/csv'],
    backup: ['Drop a backup here', 'A backup or export you saved earlier, or choose one.', '.json,.zip,application/json,application/zip'],
    receipt: ['Drop a receipt photo here', 'or choose a picture of the receipt.', 'image/*'],
    any: ['Drop a file here', 'A Cronometer export, biometrics, a Meal cost export or a receipt photo.', '.csv,.json,.zip,text/csv,application/json,application/zip,image/*'],
  }[kind] || [];
  return `<label class="dropz" data-dz="${kind}"><input type="file" class="dz-in" accept="${T[2]}" hidden><span class="dz-ic">${UP_IC}</span><span class="dz-t"><b>${T[0]}</b><small>${T[1]}</small></span><span class="dz-pick">Choose file</span></label>`;
}

function sniffFile(text, file) {
  const t = text.trimStart();
  if (t[0] === '{') return 'backup';
  const head = t.split(/\r?\n/, 1)[0].toLowerCase();
  if (/metric/.test(head) && /amount/.test(head) && !/food name/.test(head)) return 'biometrics';
  return 'food';
}

function importBiometrics(text) {
  const first = text.split(/\r?\n/, 1)[0], delim = first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows = parseCSV(text, delim); if (rows.length < 2) { toast('That file has no rows.'); return; }
  const h = rows[0].map(x => x.trim().toLowerCase()), at = (...names) => h.findIndex(x => names.includes(x));
  const iD = at('day', 'date'), iM = at('metric'), iU = at('unit'), iA = at('amount', 'value');
  if (iD < 0 || iM < 0 || iA < 0) { toast('That does not look like a biometrics export.'); return; }
  const found = new Map(); let other = 0;
  for (const r of rows.slice(1)) {
    if (!r[iM]) continue;
    if (r[iM].trim().toLowerCase() !== 'weight') { other++; continue; }
    const date = normDate(r[iD]), amt = parseFloat(String(r[iA] || '').replace(',', '.')), u = String(iU >= 0 ? r[iU] : 'kg').trim().toLowerCase();
    const kg = u.startsWith('lb') ? amt * 0.453592 : u === 'st' ? amt * 6.35029 : u === 'g' ? amt / 1000 : amt;
    if (date && kg >= 20 && kg <= 400) found.set(date, Math.round(kg * 100) / 100);
  }
  if (!found.size) { toast('No weigh-ins found in that file.'); return; }
  const have = new Map(S.weights.map(w => [w.date, w.kg])); let added = 0;
  for (const [d, kg] of found) { if (!have.has(d)) added++; have.set(d, kg); }
  S.weights = [...have].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date < b.date ? -1 : 1);
  saveAll(); go('weight'); render();
  toast(`Imported ${found.size} weigh-ins${added < found.size ? `, ${added} new` : ''}${other ? `. ${other} other measurements were skipped.` : ''}`);
}

async function importFile(file) {
  if (!file) return;
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    if (typeof rcOk === 'function' && rcOk()) { rcScan(file); return; }
    toast('Receipt scanning is not enabled for your account.'); return;
  }
  if (file.size > 30e6) { toast('That file is larger than 30 MB.'); return; }
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    let js = null; try { js = await zipRead(file, 'data.json'); } catch (e) { js = null; }
    if (!js) { toast('That zip has no data.json from a Meal cost export.'); return; }
    restore(new File([js], 'data.json', { type: 'application/json' })); return;
  }
  let text; try { text = await file.text(); } catch (e) { toast('Could not read that file.'); return; }
  const kind = sniffFile(text, file);
  if (kind === 'backup') { restore(file); return; }
  if (kind === 'biometrics') { importBiometrics(text); return; }
  importText(text);
}

/* Drop anywhere: a veil says so while a file is over the page. */
let _dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
function veil(on) {
  let v = document.getElementById('dropveil');
  if (!v && on) { v = document.createElement('div'); v.id = 'dropveil'; v.setAttribute('aria-hidden', 'true'); v.innerHTML = `<div>${UP_IC}<b>Drop to import</b><span>Cronometer export, biometrics, a backup or a receipt photo</span></div>`; document.body.appendChild(v); }
  if (v) v.classList.toggle('on', on);
}
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); _dragDepth++; veil(true); });
window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; const z = e.target.closest && e.target.closest('.dropz'); document.querySelectorAll('.dropz.over').forEach(x => { if (x !== z) x.classList.remove('over'); }); if (z) z.classList.add('over'); });
window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; _dragDepth = Math.max(0, _dragDepth - 1); if (!_dragDepth) veil(false); });
window.addEventListener('drop', async e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); _dragDepth = 0; veil(false); document.querySelectorAll('.dropz.over').forEach(x => x.classList.remove('over'));
  for (const f of [...e.dataTransfer.files].slice(0, 5)) await importFile(f);
});
document.addEventListener('change', e => { const t = e.target; if (t && t.classList && t.classList.contains('dz-in')) { const f = t.files[0]; t.value = ''; importFile(f); } });
