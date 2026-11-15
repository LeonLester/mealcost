(() => {
  'use strict';
  const box = document.getElementById('box');
  const H = { 'x-requested-with': 'mealcost' };
  const el = (html) => { box.innerHTML = html; };
  const fmt = (t) => (t ? new Date(t).toLocaleString() : 'never');
  async function state() {
    let me; try { me = await (await fetch('/api/me')).json(); } catch { el('<p>Could not reach the server. Try again when online.</p>'); return; }
    if (!me.signed) { el('<p>Sign in to Meal cost first, with the same Google account you sync with. Your weigh-ins only reach the server when sync is on.</p><div class="row"><a href="/">Open Meal cost</a></div>'); return; }
    const l = await (await fetch('/api/ledger-link')).json();
    if (!l.linked) { el(`<p>Signed in as ${me.email.replace(/[<>&"]/g, '')}.</p><div class="row"><button id="mk">Create a link code</button></div>`); document.getElementById('mk').onclick = make; return; }
    el(`<p>A link is active. Created ${fmt(l.created)}. Ledger last read it: ${fmt(l.used)}.</p><p>Making a new code replaces the old one, so Ledger stops reading until you paste the new code.</p><div class="row"><button id="mk">Make a new code</button><button id="rm">Remove the link</button></div>`);
    document.getElementById('mk').onclick = make; document.getElementById('rm').onclick = remove;
  }
  async function make() {
    const r = await fetch('/api/ledger-link', { method: 'POST', headers: H });
    if (!r.ok) { el('<p>Could not create the code. Try again.</p>'); return; }
    const { token } = await r.json();
    el('<p>Copy this code and paste it in Ledger, More, Mealcost. It is shown once.</p><input class="code" id="tok" readonly><div class="row"><button id="cp">Copy</button><button id="done">Done</button></div>');
    const i = document.getElementById('tok'); i.value = token; i.focus(); i.select();
    document.getElementById('cp').onclick = async () => { try { await navigator.clipboard.writeText(token); document.getElementById('cp').textContent = 'Copied'; } catch { i.select(); } };
    document.getElementById('done').onclick = state;
  }
  async function remove() {
    if (!confirm('Remove the link? Ledger will stop reading your weight.')) return;
    await fetch('/api/ledger-link', { method: 'DELETE', headers: H });
    state();
  }
  state();
})();
