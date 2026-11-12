"""End-to-end checks. Run: python3 tests/test_app.py  (needs: pip install playwright && playwright install chromium)"""
import os, re, subprocess, sys, time, tempfile, struct
from playwright.sync_api import sync_playwright

PORT = 8765
BASE = f'http://127.0.0.1:{PORT}/'
here = os.path.dirname(__file__)
srv = subprocess.Popen([sys.executable, os.path.join(here, 'serve.py'), str(PORT)])
time.sleep(0.8)
fails, passes = [], 0

def check(name, cond, extra=''):
    global passes
    if cond: passes += 1; print('ok  ', name)
    else: fails.append(name); print('FAIL', name, extra)

CRON = '''Day,Time,Group,Food Name,Amount,Energy (kcal),Alcohol (g),Caffeine (mg),Water (g),B1 (Thiamine) (mg),Protein (g),Carbs (g),Fat (g),Category
2026-11-09,08:10,Breakfast,"Oats, rolled, dry",80.00 g,311,0,0,0,0.3,10.5,53,5.5,Grains and Pasta
2026-11-09,08:10,Breakfast,"Eggs, whole",3.00 Large,216,0,0,0,0.1,18.9,1.1,14.3,Eggs
2026-11-09,13:00,Lunch,"Chicken ""Breast"", cooked",200.00 g,330,0,0,0,0.1,62,0,7,Poultry
2026-11-10,13:00,Lunch,"Chicken ""Breast"", cooked",0.5 lb,250,0,0,0,0.1,47,0,5,Poultry
2026-11-10,19:00,Dinner,Milk (3.5%),250.00 ml,160,0,0,0,0.1,8.5,12,8.5,Dairy
'''

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True, locale='en-US')
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        # 1. landing
        page.goto(BASE)
        check('landing headline', page.locator('h1').inner_text().startswith('See what each meal'))
        check('privacy line', 'Nothing is uploaded' in page.content())

        # 2. sample data + exact numbers
        page.click('text=Try it with sample data')
        page.wait_for_selector('.pricetag .n')
        txt = page.inner_text('main')
        check('day total 9.90', page.inner_text('.pricetag .n') == '€9.90', page.inner_text('.pricetag .n'))
        for want in ['€1.63', '€3.10', '€4.35', '€0.82', '€5.85', '€3.93', '169 g', 'saved you €1.44', '2,522']:
            check('day shows ' + want, want in txt, want)
        check('offer tag shown', page.locator('.offer-tag').count() >= 1)
        check('swap suggestion maths', 'It saves €0.90 and adds 16 g of protein' in txt)
        check('all priced', 'All 13 foods priced' in txt)

        # 3. edit a price live
        page.click('a.tab:has-text("Prices")')
        page.wait_for_selector('#pbody tr')
        row = page.locator('#pbody tr', has_text='Chicken breast, cooked').first
        row.locator('input[data-f=price]').fill('12')
        check('spend updates live', '€' in row.locator('.sp').inner_text() and row.locator('.sp').inner_text() != '€13.20', row.locator('.sp').inner_text())
        page.click('a.tab:has-text("Day")')
        check('total after price change', page.inner_text('.pricetag .n') == '€10.10', page.inner_text('.pricetag .n'))

        # 4. unit mismatch needs grams
        page.click('a.tab:has-text("Prices")')
        page.fill('#q', 'eggs')
        row = page.locator('#pbody tr', has_text='Eggs, whole, large').first
        row.locator('select[data-f=basis]').select_option('kg')
        check('needs grams flagged', 'Needs grams per item' in row.inner_text())
        check('notice shown', page.locator('#unp').is_visible())
        row.locator('input[data-f=gpu]').fill('55')
        check('grams clears flag', 'Needs grams' not in row.inner_text())
        row.locator('select[data-f=basis]').select_option('unit')
        page.fill('#q', '')

        # 5. offer dialog from the day view
        page.click('a.tab:has-text("Day")')
        page.locator('button.costbtn', has=page.locator('text=€0.18')).click()
        page.wait_for_selector('#dlg[open]')
        page.fill('#op', '1.60')
        page.click('#oform button[type=submit]')
        page.wait_for_selector('#dlg:not([open])', state='attached')
        check('offer applied', page.locator('.offer-tag').count() >= 2)

        # 6. budget
        page.click('text=Set a daily budget')
        page.fill('#bv', '12')
        page.click('#bform button[type=submit]')
        check('budget bar', 'left' in page.inner_text('.side') or 'over' in page.inner_text('.side'))

        # 7. week
        page.click('a.tab:has-text("Week")')
        page.wait_for_selector('.chart')
        wk = page.inner_text('main')
        check('week kpis', 'average day' in wk and 'per 30 days' in wk)
        check('week bars', page.locator('.chart .c').count() == 7, page.locator('.chart .c').count())
        check('protein ranking', 'Cheapest protein' in wk and page.locator('.brow').count() >= 6)

        # 8. share image
        page.click('a.tab:has-text("Day")')
        with page.expect_download() as d:
            page.click('text=Make share image')
        path = d.value.path()
        data = open(path, 'rb').read()
        w, h = struct.unpack('>II', data[16:24])
        check('share image png 1080x1350', data[:8] == b'\x89PNG\r\n\x1a\n' and (w, h) == (1080, 1350), (w, h))
        os.makedirs(os.path.join(here, 'out'), exist_ok=True)
        open(os.path.join(here, 'out', 'share.png'), 'wb').write(data)

        # 9. csv export
        with page.expect_download() as d:
            page.click('header >> text=Download CSV')
        csv = open(d.value.path(), encoding='utf-8').read()
        check('csv export', csv.startswith('Date,Meal,Food') and csv.count('\n') > 20)

        # 10. persistence
        page.reload()
        page.wait_for_selector('.pricetag .n')
        check('persists after reload', page.inner_text('.pricetag .n') != '')

        # 11. real-format import, fresh storage
        ctx2 = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US', accept_downloads=True)
        p2 = ctx2.new_page(); errs2 = []
        p2.on('console', lambda m: errs2.append(m.text) if m.type == 'error' else None)
        p2.on('pageerror', lambda e: errs2.append(str(e)))
        p2.goto(BASE)
        tmp = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, encoding='utf-8-sig'); tmp.write(CRON); tmp.close()
        p2.set_input_files('#file', tmp.name)
        p2.wait_for_selector('#pbody tr')
        check('import goes to prices', p2.url.endswith('#prices'))
        names = p2.locator('#pbody th[scope=row]').all_inner_texts()
        check('quoted names parsed', any('Chicken "Breast", cooked' in n for n in names), names)
        check('4 foods found', len(names) == 4, names)
        check('unpriced banner', '4 foods need a price' in p2.inner_text('#unp'))
        # price: chicken 10/kg, oats 2/kg, eggs 0.3/unit, milk 1.5/kg(litre)
        def setp(food, price, basis=None):
            r = p2.locator('#pbody tr', has_text=food).first
            r.locator('input[data-f=price]').fill(price)
            if basis: r.locator('select[data-f=basis]').select_option(basis)
        setp('Chicken', '10', 'kg'); setp('Oats', '2', 'kg'); setp('Eggs', '0.3', 'unit'); setp('Milk', '1.5', 'kg')
        check('notice hidden when priced', not p2.locator('#unp').is_visible())
        p2.click('a.tab:has-text("Day")')
        # latest day = 2026-11-10: chicken 0.5 lb = 226.796 g -> 2.27 ; milk 250 ml -> 0.375 -> 0.38 ; total 2.65
        check('lb + ml parsed and costed', p2.inner_text('.pricetag .n') == '€2.65', p2.inner_text('.pricetag .n'))
        p2.click('button[data-act=prev-day]')
        # 11-09: oats 0.16, eggs 3*0.3=0.90, chicken 2.00 => 3.06
        check('previous day total', p2.inner_text('.pricetag .n') == '€3.06', p2.inner_text('.pricetag .n'))

        # 12. bad file
        bad = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False); bad.write('a,b\n1,2\n'); bad.close()
        p3 = ctx2.new_page(); p3.goto(BASE); p3.evaluate('localStorage.clear()'); p3.reload()
        p3.set_input_files('#file', bad.name)
        p3.wait_for_selector('.notice.error')
        check('bad file message', 'does not look like a Cronometer' in p3.inner_text('.notice.error'))
        p3.close()

        # 13. mobile layout, every tab
        ctx3 = b.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', is_mobile=True)
        m = ctx3.new_page(); merr = []
        m.on('pageerror', lambda e: merr.append(str(e)))
        m.goto(BASE); m.click('text=Try it with sample data'); m.wait_for_selector('.pricetag .n')
        for tab in ['day', 'prices', 'week']:
            m.goto(BASE + '#' + tab); m.wait_for_selector('main h1')
            sw = m.evaluate('document.documentElement.scrollWidth')
            check(f'mobile no page overflow ({tab})', sw <= 391, sw)
        m.goto(BASE + '#day'); m.screenshot(path=os.path.join(here, 'out', 'mobile-day.png'), full_page=True)
        m.goto(BASE + '#week'); m.screenshot(path=os.path.join(here, 'out', 'mobile-week.png'), full_page=True)
        check('no page errors on mobile', not merr, merr)


        # amount formats seen in real exports
        pa = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US').new_page(); pa.goto(BASE)
        AMT = 'Day,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g)\n' + '\n'.join([
            '2026-11-01,Meal 1,Egg X,2.00 x 100.0 g,100,10,1,5', '2026-11-01,Meal 1,Beef Y,1.00 x 100.0 100g,100,10,1,5',
            '2026-11-01,Meal 1,Wrap Z,1.22 per 100g,100,10,1,5', '2026-11-01,Meal 1,Chips W,1.05 100g,100,10,1,5',
            '2026-11-01,Meal 1,Drink V,1.00 x 500.0 mL,100,10,1,5', '2026-11-01,Meal 1,Snack U,2.00 per serving,100,10,1,5',
            '2026-11-01,Meal 1,Snack T,3.00 Serving,100,10,1,5'])
        parsed = pa.evaluate('t => window.__mealcost.parseCronometer(t).map(e => [e.qty, e.unit, e.type])', AMT)
        check('amount "2.00 x 100.0 g" is 200 g', parsed[0] == [200, 'g', 'mass'], parsed[0])
        check('amount "1.00 x 100.0 100g" is 100 g', parsed[1] == [100, 'g', 'mass'], parsed[1])
        check('amount "1.22 per 100g" is 122 g', parsed[2][0] == 122 and parsed[2][2] == 'mass', parsed[2])
        check('amount "1.05 100g" is 105 g', abs(parsed[3][0] - 105) < 1e-9, parsed[3])
        check('amount "1.00 x 500.0 mL" is 500 ml', parsed[4] == [500, 'ml', 'volume'], parsed[4])
        check('"per serving" and "Serving" share a unit', parsed[5][1] == 'serving' and parsed[6][1] == 'serving', parsed[5:])
        pa.close()

        # sort, merge, backup restore on the prices tab
        pm = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US').new_page(); pm.goto(BASE); pm.click('text=Try it with sample data'); pm.wait_for_selector('.pricetag .n')
        pm.goto(BASE + '#prices'); pm.wait_for_selector('#sortsel')
        pm.click('[data-act="toggle-all"]')
        first = lambda: pm.locator('#pbody tr').first.get_attribute('data-name')
        pm.select_option('#sortsel', 'amount')
        names = pm.evaluate("[...document.querySelectorAll('#pbody tr')].map(r => r.dataset.name)")
        grams = [pm.evaluate("n => { const m = window.__mealcost.IDX().meta.get(n); return m.g + m.ml; }", n) for n in names[:6]]
        check('total amount sort is descending', grams == sorted(grams, reverse=True), grams)
        pm.select_option('#sortsel', 'freq')
        cnts = [pm.evaluate("n => window.__mealcost.IDX().meta.get(n).n", n) for n in pm.evaluate("[...document.querySelectorAll('#pbody tr')].map(r => r.dataset.name)")[:8]]
        check('times logged sort is descending', cnts == sorted(cnts, reverse=True), cnts)
        n_before = pm.evaluate("window.__mealcost.IDX().meta.size")
        cost_before = pm.evaluate("window.__mealcost.summarize(window.__mealcost.S.entries).cost")
        pm.locator('#pbody tr[data-name="Skyr, plain"] [data-act="merge"]').click()
        pm.fill('#mt', 'Cottage cheese'); pm.click('#mform button[type=submit]')
        pm.wait_for_selector('#toast.show, #toast:not([hidden])')
        check('merging reduces the number of foods by one', pm.evaluate("window.__mealcost.IDX().meta.size") == n_before - 1)
        check('merged food carries both names', pm.evaluate("window.__mealcost.IDX().meta.get('Cottage cheese').members") == ['Skyr, plain'])
        pm.reload(); pm.wait_for_selector('main h1')
        check('merge survives a reload', pm.evaluate("window.__mealcost.IDX().meta.get('Cottage cheese').members.length") == 1)
        check('original names are kept in storage', 'Skyr, plain' in pm.evaluate("localStorage.getItem('mcc.entries')"))
        pm.goto(BASE + '#prices'); pm.wait_for_selector('#pbody')
        pm.fill('#q', 'skyr'); 
        check('search finds a merged name', pm.locator('#pbody tr[data-name="Cottage cheese"]').count() == 1)
        pm.fill('#q', '')
        pm.locator('#pbody tr[data-name="Cottage cheese"] [data-act="merge"]').click()
        pm.click('[data-act="unmerge"]'); pm.wait_for_timeout(200)
        check('undo restores the separate food', pm.evaluate("window.__mealcost.IDX().meta.size") == n_before)
        check('undo restores the total cost', pm.evaluate("window.__mealcost.summarize(window.__mealcost.S.entries).cost") == cost_before)
        pm.close()

        # restoring a price backup before any data is loaded
        pr = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US').new_page(); pr.goto(BASE)
        BK = '{"app":"mealcost","version":1,"currency":"EUR","budget":null,"prices":{"Egg X":{"price":2,"basis":"kg","gpu":""}},"overrides":{},"merges":{}}'
        open(os.path.join(tempfile.gettempdir(), 'bk.json'), 'w').write(BK)
        pr.set_input_files('#pfile', os.path.join(tempfile.gettempdir(), 'bk.json'))
        open(os.path.join(tempfile.gettempdir(), 'amt.csv'), 'w').write(AMT)
        pr.set_input_files('#file', os.path.join(tempfile.gettempdir(), 'amt.csv')); pr.wait_for_selector('main h1')
        c = pr.evaluate("window.__mealcost.costOf(window.__mealcost.S.entries.find(e => e.name === 'Egg X')).cost")
        check('prices restored on the landing page apply after import (200 g at 2 per kg)', c == 0.4, c)
        pr.close()

        # desktop screenshots
        for tab in ['day', 'prices', 'week']:
            page.goto(BASE + '#' + tab); page.wait_for_selector('main h1')
            page.screenshot(path=os.path.join(here, 'out', f'desktop-{tab}.png'), full_page=True)
        fresh = b.new_context(viewport={'width': 1200, 'height': 630}, locale='en-US').new_page()
        fresh.goto(BASE); fresh.wait_for_selector('.hero')
        fresh.screenshot(path=os.path.join(here, 'out', 'landing.png'))

        check('no console errors or CSP violations', not errors and not errs2, errors + errs2)
        b.close()
finally:
    srv.terminate()

print(f'\n{passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
