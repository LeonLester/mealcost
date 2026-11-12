"""Drives the Meal cost app inside an Android emulator through the WebView's DevTools socket."""
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright

APP = 'com.coachleonidas.mealcost'
fails = []

def sh(*a):
    return subprocess.run(['adb', *a], capture_output=True, text=True).stdout
def shot(name):
    with open(f'shots/{name}.png', 'wb') as f:
        f.write(subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + ('' if cond else f'  {extra}'))
    if not cond: fails.append(name)

def forward():
    for _ in range(20):
        socks = [l.split('@')[-1] for l in sh('shell', 'cat', '/proc/net/unix').split('\n') if 'webview_devtools_remote_' in l]
        if socks:
            sh('forward', 'tcp:9222', f'localabstract:{socks[0]}'); return True
        time.sleep(1)
    return False

check('devtools socket found', forward())
errors = []
with sync_playwright() as p:
    br = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = next((pg for c in br.contexts for pg in c.pages if 'localhost' in pg.url), None)
    check('app page is open', page is not None, [pg.url for c in br.contexts for pg in c.pages])
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.wait_for_selector('#app h1', timeout=20000)
    check('runs as a native app', page.evaluate('window.MealNative && MealNative.isNative') is True)
    check('no sign-in prompt in the app', page.locator('a[href="/auth/google"]').count() == 0)
    page.click('text=Try it with sample data'); page.wait_for_selector('.pricetag .n')
    time.sleep(1); shot('01-day')
    inset = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')")
    print('safe-area-inset-top:', inset, 'viewport', page.evaluate('[innerWidth, innerHeight, devicePixelRatio]'))
    for tab in ['prices', 'week', 'trends', 'meals']:
        page.evaluate(f"location.hash = '{tab}'"); page.wait_for_selector('main h1'); time.sleep(0.8)
        check(f'{tab} tab renders', page.locator('main h1').count() == 1)
        check(f'{tab} fits the screen width', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), page.evaluate('[document.documentElement.scrollWidth, innerWidth]'))
        shot(f'02-{tab}')
    # build and save a meal
    page.fill('#mn', 'Smoke bowl'); page.fill('#ms', '2')
    names = page.evaluate("[...window.__mealcost.IDX().meta.keys()].slice(0, 2)")
    r = page.locator('#mform .mrow').nth(0)
    r.locator('[data-m=name]').fill(names[0]); r.locator('[data-m=qty]').fill('150')
    page.click('#mform [type=submit]'); time.sleep(0.5)
    check('meal saves', page.locator('.mcard').count() == 1)
    shot('03-meal')
    # export goes to the share sheet and a file lands in the app cache
    page.click('text=Download CSV'); time.sleep(3)
    shot('04-share-sheet')
    sh('shell', 'input', 'keyevent', 'KEYCODE_BACK'); time.sleep(1)
    cache = sh('shell', 'run-as', APP, 'ls', 'cache')
    check('CSV was written to the app cache', 'meal-costs.csv' in cache, cache)
    check('app still in front after the share sheet', APP in sh('shell', 'dumpsys', 'window', '|', 'grep', 'mCurrentFocus'))
    check('no JavaScript errors', not [e for e in errors if '404' not in e], errors[:5])
    br.close()

# data survives a restart
sh('shell', 'am', 'force-stop', APP); time.sleep(1)
sh('shell', 'am', 'start', '-n', f'{APP}/.MainActivity'); time.sleep(8)
forward()
with sync_playwright() as p:
    br = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = next((pg for c in br.contexts for pg in c.pages if 'localhost' in pg.url), None)
    page.wait_for_selector('#app h1', timeout=20000)
    check('data survives a restart', page.evaluate("JSON.parse(localStorage.getItem('mcc.entries')||'[]').length") > 0 and 'Smoke bowl' in (page.evaluate("localStorage.getItem('mcc.meals')") or ''))
    shot('05-after-restart')
    br.close()
sys.exit(1 if fails else 0)
