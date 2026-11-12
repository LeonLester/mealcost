"""Drives the Meal cost app inside an Android emulator through the WebView's DevTools socket (raw CDP)."""
import subprocess, sys, time, json, urllib.request
from websocket import create_connection

APP = 'com.coachleonidas.mealcost'
fails = []
errors = []

def sh(*a):
    return subprocess.run(['adb', *a], capture_output=True, text=True).stdout
def shot(name):
    with open(f'shots/{name}.png', 'wb') as f:
        f.write(subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + ('' if cond else f'  {extra}'), flush=True)
    if not cond: fails.append(name)

def forward():
    for _ in range(30):
        socks = [l.split('@')[-1] for l in sh('shell', 'cat', '/proc/net/unix').split('\n') if 'webview_devtools_remote_' in l]
        if socks:
            sh('forward', 'tcp:9222', f'localabstract:{socks[0]}'); return True
        time.sleep(1)
    return False

class Page:
    def __init__(self):
        for _ in range(30):
            try:
                tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
                t = next((t for t in tabs if t.get('type') == 'page' and 'localhost' in t.get('url', '')), None)
                if t: break
            except Exception: pass
            time.sleep(1)
        else:
            raise SystemExit('no app page found')
        self.url = t['url']
        self.ws = create_connection(t['webSocketDebuggerUrl'], timeout=30)
        self.n = 0
        self.call('Runtime.enable')
    def call(self, method, **params):
        self.n += 1; i = self.n
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                errors.append(m['params']['exceptionDetails'].get('exception', {}).get('description', 'exception'))
            elif m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] == 'error':
                errors.append(' '.join(str(a.get('value', a.get('description', ''))) for a in m['params']['args']))
            if m.get('id') == i:
                return m
    def ev(self, expr):
        r = self.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
        res = r.get('result', {})
        if 'exceptionDetails' in res:
            raise RuntimeError(res['exceptionDetails'].get('exception', {}).get('description', 'eval failed'))
        return res.get('result', {}).get('value')
    def wait(self, sel, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            if self.ev(f"!!document.querySelector({json.dumps(sel)})"): return True
            time.sleep(0.4)
        return False
    def click(self, sel):
        return self.ev(f"(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return false;e.click();return true}})()")
    def click_text(self, text):
        return self.ev(f"(()=>{{const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim().includes({json.dumps(text)}));if(!e)return false;e.click();return true}})()")
    def fill(self, sel, val):
        return self.ev(f"(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return false;e.focus();e.value={json.dumps(val)};e.dispatchEvent(new Event('input',{{bubbles:true}}));e.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()")

check('devtools socket found', forward())
pg = Page()
check('app page is open', True, pg.url)
check('app rendered', pg.wait('#app h1'))
check('runs as a native app', pg.ev('!!(window.MealNative && MealNative.isNative)') is True)
check('no sign-in prompt in the app', pg.ev("document.querySelectorAll('a[href=\"/auth/google\"]').length") == 0)
check('sample data button', pg.click_text('Try it with sample data'))
check('day view loads', pg.wait('.pricetag .n'))
time.sleep(1); shot('01-day')
print('viewport', pg.ev('[innerWidth, innerHeight, devicePixelRatio]'), 'insets', pg.ev("getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')"))
for tab in ['prices', 'week', 'trends', 'meals']:
    pg.ev(f"location.hash = '{tab}'"); time.sleep(1.2)
    check(f'{tab} tab renders', pg.ev("document.querySelectorAll('main h1').length") == 1)
    check(f'{tab} fits the screen width', pg.ev('document.documentElement.scrollWidth <= innerWidth + 1'), pg.ev('[document.documentElement.scrollWidth, innerWidth]'))
    shot(f'02-{tab}')
# build and save a meal
pg.fill('#mn', 'Smoke bowl'); pg.fill('#ms', '2')
names = pg.ev("[...window.__mealcost.IDX().meta.keys()].slice(0, 2)")
pg.fill('#mform .mrow:first-child [data-m=name]', names[0])
pg.fill('#mform .mrow:first-child [data-m=qty]', '150')
pg.ev("document.querySelector('#mform').requestSubmit()"); time.sleep(0.8)
check('meal saves', pg.ev("document.querySelectorAll('.mcard').length") == 1)
shot('03-meal')
pg.click_text('Download CSV'); time.sleep(4)
shot('04-share-sheet')
sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1.5)
cache = sh('shell', 'run-as', APP, 'ls', 'cache')
check('CSV was written to the app cache', 'meal-costs.csv' in cache, cache)
check('app in front after the share sheet', APP in sh('shell', 'dumpsys', 'window'))
check('no JavaScript errors', not [e for e in errors if '404' not in e], errors[:5])
pg.ws.close()

# data survives a restart
sh('forward', '--remove-all'); sh('shell', 'am', 'force-stop', APP); time.sleep(1)
sh('shell', 'am', 'start', '-n', f'{APP}/.MainActivity'); time.sleep(8)
check('devtools socket again', forward())
pg = Page(); pg.wait('#app h1')
check('data survives a restart', (pg.ev("JSON.parse(localStorage.getItem('mcc.entries')||'[]').length") or 0) > 0 and 'Smoke bowl' in (pg.ev("localStorage.getItem('mcc.meals')") or ''))
shot('05-after-restart')
sys.exit(1 if fails else 0)
