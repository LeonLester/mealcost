/* Create a food by photographing its label: the front of the pack and the nutrition table.
   The photos go to the server only to be read, are not stored, and the result fills the Add a food form to be checked and edited. Loaded before app.js. */
'use strict';

const LB = { front: '', table: '', busy: false, err: '' };
const lbOk = () => !!(window.MealSync && MealSync.signed && MealSync.scan);
const LB_ERR = {
  no_access: 'Label scanning is not enabled for your account.', not_configured: 'Label scanning is not set up on the server.', model_unreachable: 'The label reader is offline right now. You can enter the food by hand or look up its barcode.',
  unreadable: 'The label could not be read. Try a flatter, brighter photo of the table.', no_nutrition: 'No nutrition values were found. Make sure the whole table is in the photo.', too_large: 'That photo is too large.',
  rate_limited: 'You have scanned a lot of labels lately. Try again later.', bad_image: 'That photo could not be used. Try a JPEG or PNG.'
};

function lbDialog() {
  const dlg = $('#dlg'); dlg.classList.remove('wide');
  const slot = (k, n, title, hint, req) => `<div class="lb-slot"><div class="lb-t"><b>${n}. ${title}</b>${req ? '' : ' <span class="muted">optional</span>'}<small class="muted">${hint}</small></div>
    ${LB[k] ? `<img class="lb-img" src="${esc(LB[k])}" alt="${esc(title)} photo">` : ''}
    <button type="button" class="btn${LB[k] ? '' : ' outline'}" data-lb="pick" data-k="${k}">${LB[k] ? 'Retake' : 'Take or choose a photo'}</button></div>`;
  dlg.innerHTML = `<form method="dialog" id="lbform"><h2 id="dlg-title" style="font-size:20px">Scan a label</h2>
    <p class="muted" style="font-size:14px">Photograph the front of the pack for the name, and the nutrition table for the numbers. Hold the phone square to the table so every line is sharp. Photos are read and not stored.</p>
    ${slot('front', 1, 'Front of the pack', 'Name and brand', false)}${slot('table', 2, 'Nutrition table', 'The whole table, with the per 100 g column', true)}
    <div id="lberr" class="sub" style="color:var(--offer-ink)" role="alert">${esc(LB.err)}</div>
    <div class="dlg-actions" style="gap:8px"><button type="button" class="btn primary" data-lb="read"${LB.table && !LB.busy ? '' : ' disabled'}>${LB.busy ? 'Reading the label' : 'Read label'}</button><button type="button" class="btn" data-act="close-dlg">Cancel</button></div></form>`;
  dlg.setAttribute('aria-labelledby', 'dlg-title'); if (!dlg.open) dlg.showModal();
}
function lbOpen() {
  if (!lbOk()) { toast('Label scanning is not enabled for your account.'); return; }
  LB.front = ''; LB.table = ''; LB.err = ''; LB.busy = false; lbDialog();
}
function lbPick(k) {
  let f = $('#lbfile');
  if (!f) { f = document.createElement('input'); f.type = 'file'; f.id = 'lbfile'; f.accept = 'image/*'; f.hidden = true; document.body.appendChild(f); }
  f.onchange = async () => {
    const x = f.files[0]; f.value = ''; if (!x) return;
    try { LB[k] = await rcShrink(x); LB.err = ''; } catch (e) { LB.err = e.message; }
    lbDialog();
  };
  f.click();
}
async function lbRead() {
  if (LB.busy || !LB.table) return;
  LB.busy = true; LB.err = ''; lbDialog();
  try {
    const res = await MealSync.api('/api/label', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table: LB.table, ...(LB.front ? { front: LB.front } : {}) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { LB.err = LB_ERR[j.error] || 'Label scanning failed. Try again.'; if (j.warnings && j.warnings[0]) LB.err += ' ' + j.warnings[0]; LB.busy = false; lbDialog(); return; }
    LB.busy = false; lbFill(j);
  } catch (e) { LB.err = 'Label scanning failed. Check your connection and try again.'; LB.busy = false; lbDialog(); }
}
// Open the Add a food form and put the label in it. Everything stays editable, and the notes say what to check.
function lbFill(r) {
  openFood();
  const dlg = $('#dlg'), set = (id, v) => { const el = $(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
  set('#fn', r.name); set('#fper', r.food.per); $('#fper').dispatchEvent(new Event('change'));
  set('#fk', r.food.kcal); set('#fp', r.food.pro); set('#fc', r.food.carb); set('#ff', r.food.fat); set('#ffi', r.extra && r.extra.fiber);
  if (r.food.per === 'item' && r.serving_g) set('#fg', r.serving_g);
  if (r.barcode) set('#fbc', r.barcode);
  const x = {}; if (r.extra) { if (r.extra.sugar > 0) x.sugar = r.extra.sugar; if (r.extra.satfat > 0) x.satfat = r.extra.satfat; if (r.extra.sodium > 0) x.sodium = r.extra.sodium; }
  dlg.dataset.x = Object.keys(x).length ? JSON.stringify(x) : '';
  const st = $('#fbs');
  if (st) st.innerHTML = `Read from the label${r.basis === 'label100' ? ' (per 100 g)' : ''}. Check every value against the pack, then add your price.${(r.warnings || []).map(w => `<br><b>Check:</b> ${esc(w)}`).join('')}${r.name ? '' : '<br><b>Check:</b> The name could not be read. Type it in.'}`;
  const p = $('#fpr'); if (p) p.focus();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lb]');
  if (b) { if (b.dataset.lb === 'pick') lbPick(b.dataset.k); else if (b.dataset.lb === 'read') lbRead(); return; }
  if (e.target.closest('#fscanlabel') || e.target.closest('[data-act="scan-label"]')) lbOpen();
});
