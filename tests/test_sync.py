"""Sync tests. Needs: python3 tests/mock_google.py 9100, and wrangler dev on 8788 with the mock settings (see README)."""
import json, sys, uuid, urllib.request, os, tempfile
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8788/'
MOCK = 'http://127.0.0.1:9100/who?'
RUN = uuid.uuid4().hex[:8]
ADA = f'ada{RUN}@example.com'
passed = failed = 0
def check(name, ok, info=''):
    global passed, failed
    if ok: passed += 1
    else: failed += 1; print('FAIL', name, info)
def who(email, sub): urllib.request.urlopen(MOCK + f'email={email}&sub={sub}').read()

H = 'Day,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g),Category,Fiber (g)\n'
CSV = H + '2026-11-01,Meal 1,Quark,200.00 g,200,24,8,4,Dairy,1\n2026-11-02,Meal 1,Quark,100.00 g,100,12,4,2,Dairy,0\n'
path = os.path.join(tempfile.gettempdir(), 's.csv'); open(path, 'w').write(CSV)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    def ctx(): c = b.new_context(viewport={'width': 1200, 'height': 900}); p = c.new_page(); p.on('pageerror', lambda e: print('PAGEERROR', e)); return c, p

    # signed out: link is offered, nothing is sent
    c1, a = ctx(); a.goto(BASE); a.wait_for_selector('a[href="/auth/google"]')
    check('sign-in link shown on landing', True)
    check('api needs a session', a.evaluate("fetch('/api/sync').then(r => r.status)") == 401)

    # sign in on device A, import data, set a price
    who(ADA, 'sub-' + RUN); a.click('a[href="/auth/google"]'); a.wait_for_url('**/#prices')
    a.wait_for_selector('main h1, .dz, #file', state='attached')
    a.set_input_files('#file', path); a.wait_for_selector('main h1')
    a.goto(BASE + '#prices'); a.wait_for_selector('#pbody')
    check('card shows signed-in email', ADA in a.locator('main').inner_text())
    a.locator('#pbody tr[data-name="Quark"] [data-f="price"]').fill('9'); a.locator('#pbody tr[data-name="Quark"] [data-f="price"]').press('Tab')
    a.wait_for_function("document.getElementById('syncstat') && document.getElementById('syncstat').textContent === 'Synced'", timeout=10000)
    a.wait_for_timeout(2500)
    me = a.evaluate("fetch('/api/me').then(r => r.json())")
    check('cloud copy exists after changes', me['signed'] and me['rev'] >= 1, me)

    # device B: empty browser, same account, pulls automatically
    # Android app flow: one-time code bound to a challenge, then a bearer token
    import hashlib, base64
    def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
    ver = b64u(os.urandom(48)); chal = b64u(hashlib.sha256(ver.encode()).digest())
    who(f'app{RUN}@example.com', 'app-' + RUN)
    import http.cookiejar
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    html = op.open(BASE + f'auth/google?app=1&c={chal}').read().decode()
    import re
    code = (re.search(r'com\.coachleonidas\.mealcost://signin\?code=([A-Za-z0-9_-]+)', html) or [None, ''])[1]
    check('app sign-in returns a one-time code link', bool(code), html[:200])
    def post(path, body, headers=None):
        req = urllib.request.Request(BASE.rstrip('/') + path, data=json.dumps(body).encode(), method='POST', headers={'content-type': 'application/json', 'origin': 'https://localhost', **(headers or {})})
        try: r = urllib.request.urlopen(req); return r.status, json.loads(r.read()), r.headers
        except urllib.error.HTTPError as e: return e.code, {}, e.headers
    st, _, _ = post('/auth/app-token', {'code': code, 'verifier': 'x' * 48})
    check('wrong verifier is refused', st == 400)
    st, body, hd = post('/auth/app-token', {'code': code, 'verifier': ver})
    tok = body.get('token', '')
    check('code is exchanged for a token', st == 200 and len(tok) > 20 and hd.get('access-control-allow-origin') == 'https://localhost')
    st, _, _ = post('/auth/app-token', {'code': code, 'verifier': ver})
    check('code works only once', st == 400)
    def call(method, path, data=None):
        req = urllib.request.Request(BASE.rstrip('/') + path, data=data, method=method, headers={'authorization': 'Bearer ' + tok, 'origin': 'https://localhost', 'x-requested-with': 'mealcost'})
        try: r = urllib.request.urlopen(req); return r.status, r.read()
        except urllib.error.HTTPError as e: return e.code, b''
    st, raw = call('GET', '/api/me')
    check('bearer token signs the app in', st == 200 and json.loads(raw).get('signed') is True)
    st, _ = call('PUT', '/api/sync?base=0', b'abc')
    check('app can write sync data', st == 200)
    req = urllib.request.Request(BASE + 'api/sync', method='OPTIONS', headers={'origin': 'https://localhost', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization'})
    check('CORS preflight allowed for the app origin', urllib.request.urlopen(req).status == 204)
    who(ADA, 'sub-' + RUN)

    c2, bpg = ctx(); bpg.goto(BASE + '#prices'); bpg.wait_for_selector('a[href="/auth/google"] >> visible=true')
    bpg.click('a[href="/auth/google"] >> visible=true'); bpg.wait_for_url('**/#prices'); bpg.wait_for_selector('#pbody', timeout=15000)
    price = bpg.evaluate("(JSON.parse(localStorage.getItem('mcc.prices')).Quark || {}).price")
    check('second device receives prices and entries', str(price) == '9' and bpg.evaluate("window.__mealcost.S.entries.length") == 2, price)

    # a different account cannot see it
    c3, o = ctx(); who(f'bob{RUN}@example.com', 'bob-' + RUN); o.goto(BASE); o.click('a[href="/auth/google"]'); o.wait_for_url('**/#prices')
    check('other account starts empty', o.evaluate("fetch('/api/me').then(r => r.json())")['rev'] == 0)
    check('write without header is refused', o.evaluate("fetch('/api/sync?base=0', {method: 'PUT', body: 'x'}).then(r => r.status)") == 403)

    # conflict: B edits, A edits from a stale base
    bpg.locator('#pbody tr[data-name="Quark"] [data-f="price"]').fill('12'); bpg.locator('#pbody tr[data-name="Quark"] [data-f="price"]').press('Tab')
    bpg.wait_for_timeout(3000)
    a.locator('#pbody tr[data-name="Quark"] [data-f="price"]').fill('15'); a.locator('#pbody tr[data-name="Quark"] [data-f="price"]').press('Tab')
    a.wait_for_selector('[data-sync="use-cloud"]', timeout=10000)
    check('stale device is asked to choose', True)
    a.click('[data-sync="use-cloud"]'); a.wait_for_timeout(2000); a.wait_for_selector('#pbody')
    check('choosing cloud data adopts the newer price', str(a.evaluate("JSON.parse(localStorage.getItem('mcc.prices')).Quark.price")) == '12')

    # sign out clears this browser, the cloud copy stays
    a.on('dialog', lambda d: d.accept())
    a.goto(BASE + '#prices'); a.wait_for_selector('[data-sync="out"] >> visible=true'); a.click('[data-sync="out"] >> visible=true'); a.wait_for_selector('a[href="/auth/google"] >> visible=true')
    check('sign out clears this browser data', a.evaluate("window.__mealcost.S.entries.length") == 0)
    check('session ends on sign out', a.evaluate("fetch('/api/me').then(r => r.json())")['signed'] is False)
    b.close()
print(f'{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
