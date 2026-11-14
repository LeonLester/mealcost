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
    a.click('[data-sync="review"]'); a.wait_for_selector('#dfform')
    rv = a.inner_text('#dfform')
    check('review lists the prices area and the differing food', 'Prices' in rv and 'Quark' in rv and '15' in rv and '12' in rv, rv[:300])
    a.click('[data-df="prices"][data-v="cloud"]')
    check('picking a side is shown', a.get_attribute('[data-df="prices"][data-v="cloud"]', 'aria-pressed') == 'true')
    a.click('#dfform [type=submit]'); a.wait_for_timeout(2500); a.wait_for_selector('#pbody')
    check('review: choosing cloud adopts the newer price', str(a.evaluate("JSON.parse(localStorage.getItem('mcc.prices')).Quark.price")) == '12')
    check('review: conflict is cleared', a.evaluate("MealSync.conflict") is None)


    # receipt parsing: only allowed users, managed by the admin
    IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
    def rec(pg): return pg.evaluate("img => fetch('/api/receipt', {method: 'POST', headers: {'content-type': 'application/json', 'x-requested-with': 'mealcost'}, body: JSON.stringify({image: img})}).then(async r => [r.status, await r.json()])", IMG)
    check('free user cannot parse receipts', rec(a)[0] == 403)
    check('free user is not an admin', a.evaluate("fetch('/api/me').then(r => r.json())")['admin'] is False)
    check('free user cannot list users', a.evaluate("fetch('/api/admin/users').then(r => r.status)") == 403)
    c4, adm = ctx(); who('admin@example.com', 'adm-' + RUN); adm.goto(BASE); adm.click('a[href="/auth/google"]'); adm.wait_for_url('**/#prices')
    check('admin is recognised', adm.evaluate("fetch('/api/me').then(r => r.json())")['admin'] is True)
    st, out = rec(adm)
    check('admin can parse a receipt', st == 200 and len(out['items']) == 2 and out['items'][0]['unit'] == 'g', out)
    codes = [rec(adm)[0] for _ in range(9)]
    check('receipt scans are rate limited per user', 429 in codes and codes[0] == 200, codes)
    users = adm.evaluate("fetch('/api/admin/users').then(r => r.json())")['users']
    ada = next((u for u in users if u['email'] == ADA), None)
    check('admin sees other users', ada is not None and ada['receipts'] is False)
    adm.goto(BASE + '#admin'); adm.wait_for_selector('[data-rc-grant]')
    adm.locator(f'tr:has-text("{ADA}") [data-rc-grant]').check(); adm.wait_for_timeout(800)
    check('admin page grants access', rec(a)[0] == 200)
    check('granted user sees the scan button', a.evaluate("fetch('/api/me').then(r => r.json())")['receipts'] is True)
    adm.locator(f'tr:has-text("{ADA}") [data-rc-grant]').uncheck(); adm.wait_for_timeout(800)
    check('revoking returns the user to free', rec(a)[0] == 403)
    check('free user cannot change access', a.evaluate("fetch('/api/admin/users/" + ada['id'] + "', {method: 'PUT', headers: {'content-type': 'application/json', 'x-requested-with': 'mealcost'}, body: '{\"receipts\": true}'}).then(r => r.status)") == 403)

    # label scanning: same gate as receipts, coaches included
    def api(pg, method, path, body=None):
        return pg.evaluate("([m, p, b]) => fetch(p, {method: m, headers: {'content-type': 'application/json', 'x-requested-with': 'mealcost'}, body: b == null ? undefined : JSON.stringify(b)}).then(async r => [r.status, await r.json().catch(() => ({}))])", [method, path, body])
    check('free user cannot scan labels', api(a, 'POST', '/api/label', {'table': IMG})[0] == 403)
    st, lab = api(adm, 'POST', '/api/label', {'table': IMG, 'front': IMG})
    check('admin label scan returns a food', st == 200 and lab['food']['per'] == '100g' and lab['food']['kcal'] == 63 and lab['name'] == 'Milko Skyr Natural' and lab['barcode'] == '8590000000017', lab)
    check('label scan rejects non images', api(adm, 'POST', '/api/label', {'table': 'x'})[0] == 400)

    # coach tools
    check('free user is not a coach', a.evaluate("fetch('/api/me').then(r => r.json())")['coach'] is False)
    check('free user cannot list clients', api(a, 'GET', '/api/coach/clients')[0] == 403)
    adm.goto(BASE + '#admin'); adm.wait_for_selector('[data-co-grant]')
    BOB = f'bob{RUN}@example.com'
    c5, bob = ctx(); who(BOB, 'bob-' + RUN); bob.goto(BASE); bob.click('a[href="/auth/google"]'); bob.wait_for_url('**/#prices')
    bid = next(u for u in api(adm, 'GET', '/api/admin/users')[1]['users'] if u['email'] == BOB)['id']
    check('admin grants coach tools', api(adm, 'PUT', '/api/admin/users/' + bid, {'coach': True})[0] == 200 and bob.evaluate("fetch('/api/me').then(r => r.json())")['coach'] is True)
    st, cl = api(bob, 'POST', '/api/coach/clients', {'name': 'Ada', 'email': ADA})
    cid = cl.get('id'); check('coach adds a client profile', st == 200 and cid, cl)
    check('another coach cannot see the client', api(adm, 'GET', '/api/coach/clients/' + str(cid) + '/data')[0] == 404)
    check('client cannot read the coach list', api(a, 'GET', '/api/coach/clients')[0] == 403)
    st, nt = api(bob, 'POST', f'/api/coach/clients/{cid}/notes', {'body': 'Prefers high protein breakfast'})
    check('coach writes a note', st == 200 and api(bob, 'GET', f'/api/coach/clients/{cid}/notes')[1]['notes'][0]['body'].startswith('Prefers'))
    check('targets are saved', api(bob, 'PUT', '/api/coach/clients/' + cid, {'name': 'Ada', 'targets': {'kcal': 2000, 'pro': 140}})[0] == 200)
    check('bad targets are refused', api(bob, 'PUT', '/api/coach/clients/' + cid, {'name': 'Ada', 'targets': {'kcal': 'abc'}})[0] == 400)
    # invite: diary and weights only, no prices
    c6, anon = ctx(); anon.goto(BASE)
    st, inv = api(bob, 'POST', f'/api/coach/clients/{cid}/invite', {'scopes': {'diary': True, 'prices': False, 'weights': True}})
    tok = inv.get('token'); check('coach makes an invite link', st == 200 and tok and len(tok) >= 20, inv)
    check('invite needs a session', anon.evaluate("t => fetch('/api/coach/invite/' + t).then(r => r.status)", tok) == 401)
    st, info = api(a, 'GET', '/api/coach/invite/' + tok)
    check('client sees who is asking and what', st == 200 and info['coach'] == BOB and info['scopes']['prices'] is False, info)
    check('accepting needs explicit consent', api(a, 'POST', '/api/coach/invite/' + tok, {})[0] == 400)
    check('coach cannot accept own invite', api(bob, 'POST', '/api/coach/invite/' + tok, {'consent': True})[0] == 400)
    check('client accepts', api(a, 'POST', '/api/coach/invite/' + tok, {'consent': True})[0] == 200)
    check('invite is single use', api(a, 'GET', '/api/coach/invite/' + tok)[0] == 404)
    st, d = api(bob, 'GET', f'/api/coach/clients/{cid}/data')
    check('coach reads the live diary', st == 200 and d['mode'] == 'live' and 'entries' in d['data'], list(d.get('data', {})))
    check('prices are withheld by scope', 'prices' not in d['data'] and 'ranges' not in d['data'] and 'budget' not in d['data'], list(d['data']))
    check('coach cannot write a linked profile', api(bob, 'PUT', f'/api/coach/clients/{cid}/data', None)[0] in (400, 409))
    st, sh = api(a, 'GET', '/api/sharing')
    check('client sees the link and the read', st == 200 and len(sh['links']) == 1 and sh['links'][0]['coach'] == BOB and any(x['action'] == 'read' for x in sh['links'][0]['access']), sh)
    check('coach notes stay private', 'Prefers' not in json.dumps(sh))
    check('a stranger cannot revoke', api(adm, 'DELETE', '/api/sharing/' + cid)[0] == 404)
    check('client revokes', api(a, 'DELETE', '/api/sharing/' + cid)[0] == 200)
    st, d = api(bob, 'GET', f'/api/coach/clients/{cid}/data')
    check('revoked link returns no client data', st == 200 and d['mode'] == 'profile' and not d['data'], d)
    check('client sees no links after revoke', api(a, 'GET', '/api/sharing')[1]['links'] == [])
    check('coach removes the client', api(bob, 'DELETE', '/api/coach/clients/' + cid)[0] == 200 and api(bob, 'GET', '/api/coach/clients')[1]['clients'] == [])
    check('removing a coach flag closes the tools', api(adm, 'PUT', '/api/admin/users/' + bid, {'coach': False})[0] == 200 and api(bob, 'GET', '/api/coach/clients')[0] == 403)

    # sign out clears this browser, the cloud copy stays
    a.on('dialog', lambda d: d.accept())
    a.goto(BASE + '#prices'); a.wait_for_selector('[data-sync="out"] >> visible=true'); a.click('[data-sync="out"] >> visible=true'); a.wait_for_selector('a[href="/auth/google"] >> visible=true')
    check('sign out clears this browser data', a.evaluate("window.__mealcost.S.entries.length") == 0)
    check('session ends on sign out', a.evaluate("fetch('/api/me').then(r => r.json())")['signed'] is False)
    b.close()
print(f'{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
