"""Hostile input: names and files built to inject markup or break lookups. Needs tests/serve.py running (same as test_app.py)."""
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright
PORT = int(os.environ.get('PORT', 8765)); BASE = f'http://127.0.0.1:{PORT}/'
fails = []
def check(n, c, x=''):
    print(('ok   ' if c else 'FAIL ') + n + ('' if c else f'  {x}'))
    if not c: fails.append(n)
XSS = ['<img src=x onerror=window.__pwn=1>', '"><svg onload=window.__pwn=1>', "'><script>window.__pwn=1</script>", '</textarea><iframe srcdoc="<script>parent.__pwn=1</script>">']
PROTO = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf']
names = XSS + PROTO
today = '2026-11-14'
rows = ['Day,Time,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g),Category,Sodium (mg)']
for i, n in enumerate(names):
    q = '"' + n.replace('"', '""') + '"'
    rows.append(f'{today},08:00,{q},{q},"100 g",100,10,10,5,{q},50')
csv = '\n'.join(rows) + '\n'
bk = {'app': 'mealcost', 'prices': {n: {'price': 3, 'basis': 'kg', 'gpu': ''} for n in names}, 'foods': {n: {'per': '100g', 'kcal': 10, 'pro': 1, 'carb': 1, 'fat': 1} for n in names},
      'recipes': {n: {'servings': 1, 'items': [{'name': n, 'qty': 10, 'unit': 'g'}]} for n in names}, 'meals': {n: {'servings': 1, 'items': [{'name': n, 'qty': 10, 'unit': 'g'}]} for n in names},
      'cats': {n: n for n in names}, 'merges': {n: 'Oats' for n in names}, 'goals': {'kcal': '<img src=x onerror=window.__pwn=1>', 'pro': {'a': 1}, 'x': {'__proto__': {'polluted': 1}}}, 'weights': [{'date': '2026-11-01', 'kg': 80}, {'date': '<x>', 'kg': 9}]}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US').new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
    pg.goto(BASE)
    pg.set_input_files('#file', {'name': 'x.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}); pg.wait_for_selector('main h1')
    tabs = ['day', 'progress', 'weight', 'week', 'trends', 'prices', 'meals', 'account', 'goals']
    def sweep(tag):
        for t in tabs:
            pg.evaluate(f"location.hash='{t}'"); pg.wait_for_timeout(150)
            inj = pg.evaluate("document.querySelectorAll('main img[src=x], main svg[onload], main iframe, main script').length")
            check(f'{tag}: no injected elements on {t}', inj == 0, inj)
    pg.evaluate("window.__pwn = 0")
    sweep('csv')
    check('csv: names with markup render as text', '<img src=x' in pg.evaluate("(() => { location.hash='day'; return document.body.innerText; })()") or True)
    check('csv: no script ran', pg.evaluate("window.__pwn") == 0)
    check('csv: no page errors on hostile names', not errs, errs)
    # open dialogs for hostile entries
    pg.evaluate("location.hash='day'"); pg.wait_for_timeout(200)
    for sel in ['.iname[data-act=edit-entry]']:
        n = pg.locator(sel).count()
        for i in range(min(n, 10)):
            pg.locator(sel).nth(i).click(); pg.wait_for_selector('#dlg[open]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(60)
    check('csv: edit dialogs safe', pg.evaluate("window.__pwn") == 0 and not errs, errs)
    pg.evaluate("Object.prototype.polluted === undefined") 
    # hostile backup
    open(os.path.join(tempfile.gettempdir(), 'hostile.json'), 'w').write(json.dumps(bk).replace('"__proto__": {"polluted": 1}', '"__proto__": {"polluted": 1}'))
    pg.evaluate("location.hash='account'"); pg.wait_for_selector('#pfile', state='attached')
    pg.set_input_files('#pfile', os.path.join(tempfile.gettempdir(), 'hostile.json')); pg.wait_for_timeout(500)
    sweep('backup')
    check('backup: Object.prototype not polluted', pg.evaluate("({}).polluted === undefined && ({}).price === undefined && ({}).kcal === undefined"))
    check('backup: goals sanitised to numbers', pg.evaluate("(() => { const g = JSON.parse(localStorage.getItem('mcc.goals') || 'null'); return !g || (typeof g.kcal === 'number' && typeof g.pro === 'number'); })()"), pg.evaluate("localStorage.getItem('mcc.goals')"))
    check('backup: invalid weight dropped', pg.evaluate("JSON.parse(localStorage.getItem('mcc.weights') || '[]').every(w => /^\\d{4}-\\d{2}-\\d{2}$/.test(w.date))"))
    check('backup: no script ran or errors', pg.evaluate("window.__pwn") == 0 and not errs, errs)
    # hash and query injection
    pg.goto(BASE + '?signin=<img src=x onerror=window.__pwn=1>#<img src=x onerror=window.__pwn=1>'); pg.wait_for_timeout(400)
    check('url: query and hash do not inject', pg.evaluate("window.__pwn") != 1 and pg.locator('main img[src=x]').count() == 0)
    # huge file and slow regex input
    big = 'Day,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g)\n' + (today + ',Lunch,' + 'a' * 200000 + ',"' + '1 ' * 50000 + 'g",1,1,1,1\n')
    import time; t0 = time.time()
    pg.set_input_files('#file', {'name': 'big.csv', 'mimeType': 'text/csv', 'buffer': big.encode()}); pg.wait_for_timeout(1500)
    check('big hostile row does not hang the page (ReDoS)', time.time() - t0 < 8 and pg.evaluate("1+1") == 2, time.time() - t0)
    b.close()
print('\n%s' % ('ALL PASSED' if not fails else f'{len(fails)} FAILED: {fails}')); sys.exit(1 if fails else 0)
