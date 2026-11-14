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
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '404' not in m.text else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        # 1. landing
        page.goto(BASE)
        check('landing headline', page.locator('h1').inner_text().startswith('A food diary'))
        check('privacy line', 'Stays on your device' in page.content())

        # 2. sample data + exact numbers
        page.click('text=Try it with sample data')
        page.wait_for_selector('.pricetag .n')
        txt = page.inner_text('main')
        check('day total 8.81', page.inner_text('.pricetag .n') == '€8.81', page.inner_text('.pricetag .n'))
        for want in ['€1.83', '€2.57', '€2.20', '€2.21', '€0.84', '€1.96', '191 g', 'saved you €0.42', '2,436']:
            check('day shows ' + want, want in txt, want)
        check('offer tag shown', page.locator('.offer-tag').count() >= 1)
        check('all priced', 'All 14 foods priced' in txt)

        # 3. edit a price live
        page.click('a.tab:has-text("Prices")')
        page.wait_for_selector('#pbody tr')
        row = page.locator('#pbody tr', has_text='Whey protein').first
        row.locator('input[data-f=price]').fill('12')
        check('spend updates live', '€' in row.locator('.sp').inner_text() and row.locator('.sp').inner_text() != '€3.00', row.locator('.sp').inner_text())
        page.click('a.tab:has-text("Day")')
        check('total after price change', page.inner_text('.pricetag .n') == '€8.33', page.inner_text('.pricetag .n'))

        # 4. unit mismatch needs grams
        page.click('a.tab:has-text("Prices")')
        page.fill('#q', 'eggs')
        row = page.locator('#pbody tr', has_text='Eggs, large').first
        row.locator('select[data-f=basis]').select_option('kg')
        check('needs grams flagged', 'Needs grams per item' in row.inner_text())
        check('notice shown', page.locator('#unp').is_visible())
        row.locator('input[data-f=gpu]').fill('55')
        check('grams clears flag', 'Needs grams' not in row.inner_text())
        row.locator('select[data-f=basis]').select_option('unit')
        page.fill('#q', '')

        # 5. offer dialog from the day view
        page.click('a.tab:has-text("Day")')
        page.locator('button.costbtn', has=page.locator('text=€0.38')).click()
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
        page.click('a.tab:has-text("Summary")')
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
        p2.on('console', lambda m: errs2.append(m.text) if m.type == 'error' and '404' not in m.text else None)
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
        pm.locator('#pbody tr[data-name="Skyr, plain"] summary').click()
        pm.locator('#pbody tr[data-name="Skyr, plain"] [data-act="merge"]').click()
        pm.fill('#mt', 'Cottage cheese, fat free'); pm.click('#mform button[type=submit]')
        pm.wait_for_selector('#toast.show, #toast:not([hidden])')
        check('merging reduces the number of foods by one', pm.evaluate("window.__mealcost.IDX().meta.size") == n_before - 1)
        check('merged food carries both names', pm.evaluate("window.__mealcost.IDX().meta.get('Cottage cheese, fat free').members") == ['Skyr, plain'])
        pm.reload(); pm.wait_for_selector('main h1')
        check('merge survives a reload', pm.evaluate("window.__mealcost.IDX().meta.get('Cottage cheese, fat free').members.length") == 1)
        check('original names are kept in storage', 'Skyr, plain' in pm.evaluate("localStorage.getItem('mcc.entries')"))
        pm.goto(BASE + '#prices'); pm.wait_for_selector('#pbody')
        pm.fill('#q', 'skyr'); 
        check('search finds a merged name', pm.locator('#pbody tr[data-name="Cottage cheese, fat free"]').count() == 1)
        pm.fill('#q', '')
        pm.locator('#pbody tr[data-name="Cottage cheese, fat free"] summary').click()
        pm.locator('#pbody tr[data-name="Cottage cheese, fat free"] [data-act="merge"]').click()
        pm.click('[data-act="unmerge"]'); pm.wait_for_timeout(200)
        check('undo restores the separate food', pm.evaluate("window.__mealcost.IDX().meta.size") == n_before)
        check('undo restores the total cost', pm.evaluate("window.__mealcost.summarize(window.__mealcost.S.entries).cost") == cost_before, str(cost_before) + ' vs ' + str(pm.evaluate("window.__mealcost.summarize(window.__mealcost.S.entries).cost")))
        # typical prices lookup (service mocked)
        pm.route('**/api/ref-prices**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"results":[{"source":"Open Prices","name":"Chicken breast (Acme)","perKg":9.4,"currency":"EUR","n":5,"date":"2026-10-01"},{"source":"BLS US average","name":"Eggs","perUnit":0.3,"currency":"USD","date":"October 2026"}],"notes":[]}'))
        pm.goto(BASE + '#prices'); pm.wait_for_selector('#refq')
        pm.fill('#refq', 'chicken'); pm.click('#refform button'); pm.wait_for_selector('#refcard [data-act=ref-use]')
        check('lookup lists prices with a source', 'Open Prices' in pm.inner_text('#refcard') and '9.40' in pm.inner_text('#refcard'))
        check('only same-currency per-kg prices can be applied', pm.locator('#refcard [data-act=ref-use]').count() == 1)
        pm.fill('#refto', 'Cottage cheese, fat free'); pm.click('#refcard [data-act=ref-use]'); pm.wait_for_timeout(200)
        check('applying sets the food price per kg', pm.evaluate("JSON.stringify(window.__mealcost.S.prices['Cottage cheese, fat free'])").startswith('{"price":9.4,"basis":"kg"'))
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


        # serving size estimate, price periods, recipes, sorting, categories, trends
        def fresh():
            pg = b.new_context(viewport={'width': 1360, 'height': 900}, locale='en-US').new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(BASE); return pg
        def load(pg, csv_text, name='x.csv', backup=None):
            if backup:
                open(os.path.join(tempfile.gettempdir(), 'b.json'), 'w').write(backup)
                pg.set_input_files('#pfile', os.path.join(tempfile.gettempdir(), 'b.json'))
            open(os.path.join(tempfile.gettempdir(), name), 'w').write(csv_text)
            pg.set_input_files('#file', os.path.join(tempfile.gettempdir(), name)); pg.wait_for_selector('main h1')
        H = 'Day,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g),Category,Fiber (g)\n'
        def bk(prices, **kw):
            import json
            return json.dumps({'app': 'mealcost', 'version': 1, 'currency': 'EUR', 'budget': None, 'prices': prices, 'overrides': {}, **kw})

        pe = fresh()
        load(pe, H + '2026-11-01,Meal 1,Quark,200.00 g,200,24,8,4,Dairy,1\n2026-11-02,Meal 1,Quark,2.00 Serving,100,12,4,2,Dairy,1\n',
             backup=bk({'Quark': {'price': 10, 'basis': 'kg', 'gpu': ''}}))
        c = pe.evaluate("(() => { const m = window.__mealcost; return m.S.entries.map(e => m.costOf(e)).map(x => [x.cost, !!x.est]); })()")
        check('gram-logged food costs 200 g at 10 per kg', c[0][0] == 2.0, c)
        check('serving size estimated from calories (100 kcal is 100 g)', c[1][0] == 1.0 and c[1][1], c)
        pe.close()

        pg2 = fresh()
        rows = '\n'.join(f'2026-11-{d:02d},Meal 1,Rice,100.00 g,350,7,77,1,Grains,3' for d in range(1, 11))
        load(pg2, H + rows, backup=bk({'Rice': {'price': 2, 'basis': 'kg', 'gpu': ''}}))
        pg2.goto(BASE + '#prices'); pg2.wait_for_selector('[data-act="offer"].btn.primary')
        pg2.click('aside [data-act="offer"].btn.primary')
        pg2.select_option('#om', 'range'); pg2.fill('#od', '2026-11-03'); pg2.fill('#ot', '2026-11-05'); pg2.fill('#op', '1')
        pg2.click('#oform button[type=submit]')
        prices = pg2.evaluate("(() => { const m = window.__mealcost; return ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'].map(d => m.costOf(m.S.entries.find(e => e.date === d)).cost); })()")
        check('price period applies only inside its dates', prices == [0.2, 0.1, 0.1, 0.2], prices)
        pg2.click('aside [data-act="offer"].btn.primary')
        pg2.select_option('#om', 'from'); pg2.fill('#od', '2026-11-08'); pg2.fill('#op', '3')
        pg2.click('#oform button[type=submit]')
        prices = pg2.evaluate("(() => { const m = window.__mealcost; return ['2026-11-07', '2026-11-08', '2026-11-10'].map(d => m.costOf(m.S.entries.find(e => e.date === d)).cost); })()")
        check('open-ended price applies from its first day on', prices == [0.2, 0.3, 0.3], prices)
        pg2.reload(); pg2.wait_for_selector('main h1')
        check('price periods survive a reload', pg2.evaluate("window.__mealcost.S.ranges.length") == 2)
        pg2.close()

        pr2 = fresh(); pr2.click('text=Try it with sample data'); pr2.wait_for_selector('.pricetag .n')
        pr2.goto(BASE + '#prices'); pr2.wait_for_selector('#pbody')
        pr2.click('[data-act="toggle-all"]')
        pr2.locator('#pbody tr[data-name="Eggs, large"] summary').click()
        pr2.locator('#pbody tr[data-name="Eggs, large"] [data-act="edit-recipe"]').click()
        pr2.fill('#rrows .rrow:nth-child(1) [data-r=name]', 'Rolled oats'); pr2.fill('#rrows .rrow:nth-child(1) [data-r=qty]', '100')
        pr2.click('[data-act="rec-add"]')
        pr2.fill('#rrows .rrow:nth-child(2) [data-r=name]', 'Milk, semi-skimmed 1.5%'); pr2.fill('#rrows .rrow:nth-child(2) [data-r=qty]', '200'); pr2.select_option('#rrows .rrow:nth-child(2) [data-r=unit]', 'ml')
        check('recipe preview shows the total', '0.44' in pr2.locator('#rprev').inner_text(), pr2.locator('#rprev').inner_text())
        pr2.click('#rform button[type=submit]')
        rc = pr2.evaluate("(() => { const m = window.__mealcost; const e = m.S.entries.find(x => x.name === 'Eggs, large'); return m.costOf(e).cost; })()")
        check('a logged recipe costs the sum of its ingredients', abs(rc - 1.32) < 0.005, rc)
        pr2.goto(BASE + '#day'); pr2.wait_for_selector('.pricetag .n')
        import datetime as _dt
        _d = _dt.date.today() - _dt.timedelta(days=2)
        pr2.click('.daybtn[data-date="' + _d.isoformat() + '"]'); pr2.wait_for_selector('[data-act="toggle-recipe"]')
        pr2.locator('[data-act="toggle-recipe"]').first.click()
        check('ingredients expand under the recipe line', pr2.locator('.subitem').count() == 2)
        pr2.goto(BASE + '#trends'); pr2.wait_for_selector('#tgrain')
        pr2.select_option('#tgrain', 'day'); pr2.wait_for_selector('.trendgrid svg')
        check('trends tab draws charts for each nutrient', pr2.locator('.trendgrid svg path').count() >= 4, pr2.locator('.trendgrid').inner_text()[:200])
        pr2.goto(BASE + '#prices'); pr2.wait_for_selector('#pbody')
        pr2.select_option('#sortsel', 'spent')
        sp = [pr2.evaluate("n => window.__mealcost.IDX().meta && 0", None)]
        vals = pr2.evaluate("[...document.querySelectorAll('#pbody tr .sp')].map(c => parseFloat(c.innerText.replace(/[^0-9.]/g, '')) || 0)")
        check('sort by total spent is descending', vals == sorted(vals, reverse=True), vals[:8])
        pr2.select_option('#sortsel', 'pro100')
        names = pr2.evaluate("[...document.querySelectorAll('#pbody tr')].map(r => r.dataset.name)")
        pv = [pr2.evaluate("n => { const x = window.__mealcost.macros(n, 'g'); return x ? x.p : -1; }", n) for n in names]
        check('sort by protein per 100 g is descending', pv == sorted(pv, reverse=True), pv[:6])
        pr2.select_option('#sortsel', 'pro100k')
        names = pr2.evaluate("[...document.querySelectorAll('#pbody tr')].map(r => r.dataset.name)")
        pv = [pr2.evaluate("n => { const x = window.__mealcost.macros(n, 'kcal'); return x ? x.p : -1; }", n) for n in names]
        check('sort by protein per 100 kcal is descending', pv == sorted(pv, reverse=True), pv[:6])
        pr2.close()

        pc = fresh()
        load(pc, H + '2026-11-01,Meal 1,Quark,200.00 g,200,24,8,4,Dairy,1\n2026-11-01,Meal 1,Mystery,50.00 g,100,1,1,1,,0\n')
        check('fiber is read from the export', pc.evaluate("window.__mealcost.S.entries[0].fiber") == 1)
        check('category is read from the export', pc.evaluate("window.__mealcost.catOf('Quark')") == 'Dairy')
        check('foods without a category are listed', pc.evaluate("(window.__mealcost.catOf('Mystery'))") == 'Uncategorized')
        pc.goto(BASE + '#prices'); pc.wait_for_selector('#pbody')
        pc.click('[data-act="toggle-unc"]')
        pc.locator('.card tr[data-name="Mystery"] input[data-cat]').fill('Snacks'); pc.locator('.card tr[data-name="Mystery"] input[data-cat]').press('Tab')
        check('category list offers choices', pc.locator('#catlist option').count() >= 10)
        check('assigning a category sticks', pc.evaluate("window.__mealcost.catOf('Mystery')") == 'Snacks')
        pc.reload(); pc.wait_for_selector('main h1')
        check('assigned category survives a reload', pc.evaluate("window.__mealcost.catOf('Mystery')") == 'Snacks')
        pc.close()

        # meal builder
        pb = fresh()
        pb.on('dialog', lambda d: d.accept())
        rows = '2026-11-01,Meal 1,Quark,200.00 g,120,24,8,1,Dairy,0\n2026-11-01,Meal 1,Oats,100.00 g,380,13,66,7,Grains,10\n2026-11-01,Meal 1,Egg,2.00 Serving,140,12,1,10,Dairy,0\n'
        load(pb, H + rows, backup=bk({'Quark': {'price': 10, 'basis': 'kg', 'gpu': ''}, 'Oats': {'price': 2, 'basis': 'kg', 'gpu': ''}, 'Egg': {'price': 0.3, 'basis': 'unit', 'gpu': ''}}))
        pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open]')
        check('meal builder starts as a button', pb.locator('#mform').count() == 0)
        pb.click('[data-act=meal-open]'); pb.wait_for_selector('#mform')
        check('clicking it opens the form', pb.locator('#mform').is_visible())
        check('meals tab is listed', pb.locator('.tab', has_text='Meals').count() == 1)
        def fill_row(i, name, qty, unit):
            r = pb.locator('#mform .mrow').nth(i)
            r.locator('[data-m=name]').fill(name); r.locator('[data-m=qty]').fill(qty); r.locator('[data-m=unit]').select_option(unit)
        pb.fill('#mn', 'Breakfast bowl'); pb.fill('#ms', '2')
        fill_row(0, 'Quark', '300', 'g')
        pb.click('[data-act="meal-add"]'); fill_row(1, 'Oats', '50', 'g')
        pb.click('[data-act="meal-add"]'); fill_row(2, 'Egg', '2', 'item')
        tot = pb.inner_text('#mtot')
        check('meal cost is summed from ingredient prices', '€3.70' in tot and '€1.85' in tot, tot)
        check('meal calories are summed', '510 kcal' in tot and '255 kcal' in tot, tot)
        check('meal protein is summed', '54.5 g' in tot, tot)
        check('cost per 100 g protein', '€6.79 per 100 g protein' in tot, tot)
        check('row shows its own cost', '€3.00' in pb.locator('#mform .mi').nth(0).inner_text(), pb.locator('#mform .mi').nth(0).inner_text())
        pb.click('#mform [type=submit]')
        check('meal is saved and listed', pb.locator('.mcard').count() == 1 and 'Breakfast bowl' in pb.inner_text('#mlist2'))
        pb.reload(); pb.wait_for_selector('main h1'); pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open], #mform'); (pb.locator('[data-act=meal-open]').click() if pb.locator('[data-act=meal-open]').count() else None)
        check('saved meal survives a reload', pb.locator('.mcard').count() == 1)
        pb.evaluate("window.__mealcost.S.prices.Quark.price = 20")
        pb.goto(BASE + '#prices'); pb.wait_for_selector('#pbody'); pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open], #mform'); (pb.locator('[data-act=meal-open]').click() if pb.locator('[data-act=meal-open]').count() else None)
        check('meal cost follows current prices', '€3.35' in pb.inner_text('#mlist2'), pb.inner_text('#mlist2'))
        pb.evaluate("window.__mealcost.S.prices.Quark.price = 10")
        pb.goto(BASE + '#prices'); pb.wait_for_selector('#pbody'); pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open], #mform'); (pb.locator('[data-act=meal-open]').click() if pb.locator('[data-act=meal-open]').count() else None)
        pb.click('[data-act="meal-dup"]')
        check('duplicate opens an unsaved copy', pb.input_value('#mn') == 'Breakfast bowl copy')
        fill_row(0, 'Quark', '100', 'g')
        pb.click('#mform [type=submit]')
        check('duplicate saves as a second meal', pb.locator('.mcard').count() == 2)
        pb.fill('#mn', 'Breakfast bowl'); pb.click('#mform [type=submit]')
        check('duplicate names are refused', 'already exists' in pb.inner_text('#merr'))
        pb.fill('#mn', ''); pb.click('#mform [type=submit]')
        check('a name is required', 'name' in pb.inner_text('#merr'))
        pb.fill('#mn', 'Breakfast bowl copy')
        pb.locator('[data-cmp]').nth(0).check(); pb.locator('[data-cmp]').nth(1).check()
        cmp_txt = pb.inner_text('#mcmp')
        check('compare shows the cheaper meal', 'less per serving' in cmp_txt and 'lower' in cmp_txt, cmp_txt)
        before = pb.evaluate("window.__mealcost.S.entries.length")
        pb.locator('.mcard[data-name="Breakfast bowl"] [data-act="meal-diary"]').click()
        pb.fill('#dd', '2026-11-05'); pb.select_option('#dg', 'Dinner'); pb.click('#dform [type=submit]')
        pb.wait_for_selector('.pricetag .n')
        check('add to diary appends one line per ingredient', pb.evaluate("window.__mealcost.S.entries.length") == before + 3)
        check('diary day has one serving of the meal', pb.evaluate("(() => { const s = window.__mealcost.summarize(window.__mealcost.S.entries.filter(e => e.date === '2026-11-05')); return [s.cost, Math.round(s.kcal)]; })()") == [1.85, 255])
        pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open], #mform'); (pb.locator('[data-act=meal-open]').click() if pb.locator('[data-act=meal-open]').count() else None)
        pb.locator('.mcard[data-name="Breakfast bowl copy"] [data-act="meal-delete"]').click()
        check('delete removes the meal', pb.locator('.mcard').count() == 1)
        pb.set_viewport_size({'width': 390, 'height': 800}); pb.goto(BASE + '#meals'); pb.wait_for_selector('[data-act=meal-open], #mform'); (pb.locator('[data-act=meal-open]').click() if pb.locator('[data-act=meal-open]').count() else None)
        sw = pb.evaluate("document.documentElement.scrollWidth")
        check('meals tab fits a phone', sw <= 391, sw)
        pb.screenshot(path=os.path.join(here, 'out', 'mobile-meals.png'), full_page=True)
        pb.close()
        pr3 = fresh()
        load(pr3, H + rows, backup=bk({'Quark': {'price': 10, 'basis': 'kg', 'gpu': ''}}, meals={'Test': {'servings': 1, 'items': [{'name': 'Quark', 'qty': 100, 'unit': 'g'}]}}))
        check('backup restores saved meals', pr3.evaluate("Object.keys(window.__mealcost.S.meals)") == ['Test'])
        pr3.close()

        # price history chart
        ph = fresh()
        rows2 = ''.join(f'2026-11-{d:02d},Meal 1,Quark,200.00 g,120,24,8,1,Dairy,0\n2026-11-{d:02d},Meal 1,Oats,100.00 g,380,13,66,7,Grains,10\n' for d in range(1, 11))
        load(ph, H + rows2, backup=bk({'Quark': {'price': 10, 'basis': 'kg', 'gpu': ''}, 'Oats': {'price': 2, 'basis': '100', 'gpu': ''}}, ranges=[{'id': 'r1', 'name': 'Quark', 'from': '2026-11-06', 'to': '2026-11-08', 'price': 8}]))
        ph.evaluate("localStorage.removeItem('mcc.phist')")
        ph.goto(BASE + '#trends'); ph.wait_for_selector('[data-act=tview]'); ph.click('[data-act=tview][data-v=prices]'); ph.wait_for_selector('#phist')
        check('price history draws a dot per price change', ph.locator('#phist svg circle').count() == 4, ph.locator('#phist svg circle').count())
        ph.locator('#phist summary').click()
        check('change list shows the offer', 'offer' in ph.inner_text('#phist details'), ph.inner_text('#phist details'))
        ph.click('#phist [data-act="ph-del"] >> nth=0')
        check('removing a food drops its line', ph.locator('#phist .phchip').count() == 1)
        ph.fill('#phq', 'Quark'); ph.click('#phist [data-act="ph-add"]')
        check('adding a food puts it on the chart', ph.locator('#phist .phchip').count() == 2)
        ph.reload(); ph.wait_for_selector('main h1'); ph.goto(BASE + '#trends'); ph.wait_for_selector('#phist')
        check('chosen foods persist', ph.locator('#phist .phchip').count() == 2)
        ph.close()

        # tutorial
        pt = fresh(); pt.click('text=Try it with sample data'); pt.wait_for_selector('.pricetag .n')
        check('tour card is offered to new users', pt.locator('[aria-label="Quick tour"]').count() == 1)
        pt.click('main [data-act=tour]'); pt.wait_for_selector('#dlg[open] #tourform')
        check('tour opens on step 1', 'Step 1 of 6' in pt.inner_text('#tourform'))
        for k in range(5): pt.click('#tourform [data-act=tour-go]:has-text("Next")'); pt.wait_for_timeout(80)
        check('tour reaches the last step', 'Step 6 of 6' in pt.inner_text('#tourform') and pt.locator('#tourform button:has-text("Done")').count() == 1)
        pt.click('#tourform [data-act=tour-open]'); pt.wait_for_selector('#dlg:not([open])', state='attached')
        check('a step can open its screen', pt.url.endswith('#account'))
        check('tour card is gone once seen', pt.locator('[aria-label="Quick tour"]').count() == 0)
        pt.evaluate("document.querySelector('#drawer [data-act=tour]').click()"); pt.wait_for_selector('#dlg[open] #tourform')
        check('tour can be reopened from the menu', 'Step 1 of 6' in pt.inner_text('#tourform'))
        pt.close()

        # app banner that matches the phone
        for ua, want, other in [('Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'mealcost.apk', 'Show me how'), ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', '/android#iphone', 'mealcost.apk')]:
            ctx = b.new_context(viewport={'width': 400, 'height': 800}, user_agent=ua, locale='en-US', has_touch=True); pbn = ctx.new_page(); pbn.goto(BASE)
            pbn.wait_for_selector('[aria-label="Get the app"]')
            html = pbn.inner_html('[aria-label="Get the app"]')
            check('banner offers the right download for this phone', want in html and other not in html, html[:160])
            pbn.click('[data-act=appban-off]'); pbn.wait_for_timeout(200)
            check('Not now hides the app banner', pbn.locator('[aria-label="Get the app"]').count() == 0)
            pbn.reload(); pbn.wait_for_selector('h1')
            check('app banner stays hidden after a reload', pbn.locator('[aria-label="Get the app"]').count() == 0)
            ctx.close()
        pdk = b.new_context(viewport={'width': 1200, 'height': 800}, locale='en-US').new_page(); pdk.goto(BASE); pdk.wait_for_selector('h1')
        check('no app banner on a desktop browser', pdk.locator('[aria-label="Get the app"]').count() == 0)
        pdk.close()

        # Android app glue (Capacitor is mocked)
        cap = b.new_context(viewport={'width': 412, 'height': 900}, locale='en-US')
        cap.add_init_script("""
          window.__calls = [];
          const rec = (n, m) => async a => { window.__calls.push([n, m, a]); return { uri: 'file:///cache/' + (a && a.path || 'x') }; };
          window.__backCb = null;
          window.Capacitor = { isNativePlatform: () => true, Plugins: {
            Filesystem: { writeFile: rec('fs', 'writeFile') }, Share: { share: rec('share', 'share') }, Browser: { open: rec('browser', 'open') },
            App: { addListener: (n, cb) => { if (n === 'backButton') window.__backCb = cb; else window.__urlCb = cb; }, getLaunchUrl: async () => ({}), getInfo: async () => ({ build: '10', version: '1.0.10' }), exitApp: () => window.__calls.push(['app', 'exit']) } } };
        """)
        pn = cap.new_page(); pn.goto(BASE); pn.click('text=Try it with sample data'); pn.wait_for_selector('.pricetag .n')
        pn.route('https://mealcost.coachleonidas.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"signed":false}'))
        pn.route('https://api.github.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"body":"Build 12 from abc. Download mealcost.apk"}'))
        pn.reload(); pn.wait_for_selector('main .notice:has-text("Update available")', timeout=8000)
        check('app: shows an update banner for a newer build', 'Build 12' in pn.inner_text('main .notice'))
        pn.click('[data-act=update-get]'); pn.wait_for_timeout(200)
        check('app: Download update opens the APK link', pn.evaluate('window.__calls.at(-1)')[2]['url'].endswith('/android-latest/mealcost.apk'))
        pn.click('[data-act=update-skip]'); pn.wait_for_timeout(200)
        check('app: Not now hides the banner', pn.locator('main .notice:has-text("Update available")').count() == 0)
        pn.click('header .burger'); pn.click('#drawer a[href="#account"]'); pn.wait_for_selector('main [data-sync=signin]', timeout=8000)
        check('app: Account page offers sign-in', pn.locator('main [data-sync=signin]').count() == 1)
        pn.click('main [data-sync=signin]'); pn.wait_for_timeout(400)
        lc = pn.evaluate('window.__calls.at(-1)')
        check('app: sign-in opens the browser with a challenge', lc[1] == 'open' and lc[2]['url'].startswith('https://mealcost.coachleonidas.com/auth/google?app=1&c=') and len(lc[2]['url'].split('c=')[1]) == 43, str(lc))
        pn.evaluate("document.body.classList.remove('drawer-open'); window.__calls.length = 0")
        check('app: file pickers accept any type', pn.evaluate("document.getElementById('file').hasAttribute('accept')") is False)
        pn.click('header .burger'); pn.click('#drawer >> text=Download CSV'); pn.wait_for_timeout(300)
        calls = pn.evaluate('window.__calls')
        check('app: CSV goes to the share sheet', [c[1] for c in calls] == ['writeFile', 'share'] and calls[0][2]['path'] == 'meal-costs.csv' and calls[0][2]['directory'] == 'CACHE' and len(calls[0][2]['data']) > 100, str(calls)[:200])
        import base64
        check('app: shared CSV content is valid', base64.b64decode(calls[0][2]['data']).decode().startswith('Date,Meal,Food'))
        pn.click('header .burger'); pn.click('#drawer a[href="/privacy"]'); pn.wait_for_timeout(200)
        check('app: privacy opens the website', pn.evaluate('window.__calls.at(-1)')[1] == 'open' and pn.evaluate('window.__calls.at(-1)')[2]['url'] == 'https://mealcost.coachleonidas.com/privacy')
        pn.goto(BASE + '#prices'); pn.wait_for_selector('#pbody'); pn.click('[data-act="budget"]') if pn.locator('[data-act="budget"]').count() else None
        pn.evaluate("document.getElementById('dlg').showModal()"); pn.evaluate("window.__backCb({canGoBack:true})")
        check('app: back button closes a dialog first', pn.evaluate("document.getElementById('dlg').open") is False)
        pn.evaluate("window.__backCb({canGoBack:false})")
        check('app: back button exits at the root', pn.evaluate('window.__calls.at(-1)')[0] == 'app')
        pn.close(); cap.close()

        # old stored entries are re-read on load
        po = fresh()
        po.evaluate("""() => { localStorage.setItem('mcc.entries', JSON.stringify([{date:'2026-11-01',group:'Meal 1',name:'Cheese',qty:2,unit:'x 100.0 g',type:'count',kcal:10,pro:1,carb:1,fat:1}])); localStorage.removeItem('mcc.parser'); }""")
        po.reload(); po.wait_for_selector('main h1')
        check('amounts saved by an older version are re-read', po.evaluate("(() => { const e = window.__mealcost.S.entries[0]; return [e.qty, e.type]; })()") == [200, 'mass'])
        po.close()

        # phone layout and theme
        ph = b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True, locale='en-US', color_scheme='light').new_page()
        ph.goto(BASE); ph.wait_for_selector('#app h1')
        ph.click('text=Try it with sample data'); ph.wait_for_selector('.pricetag .n')
        for tab in ['day', 'prices', 'week', 'trends', 'meals']:
            ph.evaluate(f"location.hash='{tab}'"); ph.wait_for_timeout(300)
            m = ph.evaluate("(() => { const t = document.querySelector('.tabs').getBoundingClientRect(); const sc = document.getElementById('scroller'); return [Math.round(t.bottom), innerHeight, document.documentElement.scrollWidth, innerWidth, sc.scrollWidth <= sc.clientWidth + 1, document.documentElement.scrollTop]; })()")
            check(f'phone: {tab} keeps the tab bar on screen', m[0] == m[1] and m[2] <= m[3] and m[4] and m[5] == 0, m)
        ph.evaluate("document.getElementById('scroller').scrollTop = 400"); ph.wait_for_timeout(200)
        check('phone: tab bar stays put while scrolling', ph.evaluate("Math.round(document.querySelector('.tabs').getBoundingClientRect().bottom) === innerHeight"))
        check('theme starts on auto/light', ph.evaluate("MealTheme.get()") == 'auto' and ph.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(255, 255, 255)')
        ph.click('header .burger'); ph.click('#drawer [data-act=theme]'); ph.wait_for_selector('#dlg [data-act=set-theme]'); ph.click('#dlg [data-v=dark]')
        check('theme menu picks dark', ph.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark' and ph.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(0, 0, 0)')
        ph.evaluate("location.hash='meals'"); ph.wait_for_selector('[data-act=meal-open], #mform'); (ph.locator('[data-act=meal-open]').click() if ph.locator('[data-act=meal-open]').count() else None)
        ph.click('#mform [data-m=name]'); ph.keyboard.type('chi'); ph.wait_for_timeout(300)
        ac = ph.evaluate("(() => { const u = document.querySelector('.ac'); const cs = getComputedStyle(u); return [!u.hidden, u.children.length, cs.backgroundColor, cs.display, u.getBoundingClientRect().height > 40]; })()")
        check('suggestion list is visible and opaque in dark mode', ac[0] and ac[1] > 0 and ac[2] == 'rgb(37, 39, 44)' and ac[3] != 'none' and ac[4], ac)
        first = ph.evaluate("document.querySelector('.ac li').textContent")
        ph.evaluate("document.querySelector('.ac li').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))")
        check('picking a suggestion fills the field', ph.evaluate("document.querySelector('#mform [data-m=name]').value") == first and ph.evaluate("document.querySelector('.ac').hidden"), first)
        ph.reload(); ph.wait_for_selector('#app h1')
        check('dark theme persists', ph.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
        ph.close()

        # manual foods, no export needed
        mc = b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True, locale='en-US', color_scheme='light')
        pm = mc.new_page(); merrs = []
        pm.on('pageerror', lambda e: merrs.append(str(e)))
        pm.route('https://world.openfoodfacts.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"status":1,"product":{"product_name":"Skyr natural","brands":"Arla, Other","nutriments":{"energy-kcal_100g":63,"proteins_100g":11,"carbohydrates_100g":3.9,"fat_100g":0.2}}}'))
        pm.goto(BASE); pm.wait_for_selector('[data-act=start-manual]')
        pm.click('[data-act=start-manual]'); pm.wait_for_selector('main [data-act=log-food]')
        check('manual start opens the Day tab with no export', pm.inner_text('main h1') == 'Day', pm.inner_text('main h1'))
        pm.click('main [data-act=log-food]'); pm.wait_for_selector('#fform')
        check('logging with no foods opens Add a food', pm.is_visible('#fform'))
        pm.fill('#fbc', '5711953016014'); pm.click('#fbl'); pm.wait_for_timeout(1000)
        check('barcode lookup fills the form', pm.input_value('#fn') == 'Arla Skyr natural' and pm.input_value('#fp') == '11' and 'Open Food Facts' in pm.inner_text('#fbs'), pm.inner_text('#fbs'))
        pm.fill('#fpr', '1,80'); pm.select_option('#fpb', 'kg'); pm.click('#fform [type=submit]'); pm.wait_for_timeout(300)
        pm.evaluate("location.hash='prices'"); pm.wait_for_selector('main [data-act=add-food]')
        pm.click('main [data-act=add-food]'); pm.wait_for_selector('#fform')
        pm.fill('#fn', 'Chicken breast'); pm.fill('#fk', '120'); pm.fill('#fp', '23'); pm.fill('#fc', '0'); pm.fill('#ff', '2'); pm.fill('#fpr', '7.50'); pm.select_option('#fpb', 'kg'); pm.click('#fform [type=submit]'); pm.wait_for_timeout(300)
        check('manual foods show on Prices', pm.locator('#pbody tr').count() == 2, pm.locator('#pbody tr').count())
        pm.evaluate("location.hash='trends'"); pm.wait_for_selector('.vtab')
        rows = pm.evaluate("[...document.querySelectorAll('.vtab tbody tr')].map(r => [r.querySelector('.bvt span').textContent, r.cells[1].textContent])")
        check('value table ranks protein per euro', rows[0][0].endswith('Arla Skyr natural') and rows[0][1] == '61.1' and rows[1][1] == '30.7', rows)
        pm.click('[data-act=vmacro][data-v=fat]'); pm.wait_for_selector('.vtab')
        check('value table switches nutrient', pm.evaluate("document.querySelector('.vtab tbody tr td').textContent.endsWith('Chicken breast')") is True or pm.locator('.vtab tbody tr').count() == 2)
        pm.click('[data-act=vmacro][data-v=pro]'); pm.wait_for_selector('.whatif summary'); pm.click('.whatif summary'); pm.click('[data-act=wi-add]'); pm.wait_for_selector('[data-wi=name]')
        pm.fill('[data-wi=name]', 'Chicken breast'); pm.press('[data-wi=name]', 'Tab'); pm.wait_for_selector('[data-wi=price]')
        check('what-if fills the current price', pm.input_value('[data-wi=price]') == '7.5', pm.input_value('[data-wi=price]'))
        pm.fill('[data-wi=price]', '3'); pm.press('[data-wi=price]', 'Tab'); pm.wait_for_selector('tr.wi')
        wr = pm.evaluate("[...document.querySelectorAll('.vtab tbody tr')].map(r => [r.textContent, r.className])")
        check('what-if ranks the food at the tested price', 'Chicken breast' in wr[0][0] and wr[0][1] == 'wi' and '76.7' in wr[0][0], wr)
        check('what-if verdict is shown', 'rank 1 of 2' in pm.inner_text('.whatif'), pm.inner_text('.whatif')[:200])
        pm.evaluate("location.hash='day'"); pm.wait_for_selector('main [data-act=log-food]')
        pm.locator('main [data-act=log-food]').first.click(); pm.wait_for_selector('#eform')
        pm.fill('#ed', '2026-11-10'); pm.fill('#en', 'Chicken breast'); pm.fill('#eq', '200'); pm.click('#eform [type=submit]'); pm.wait_for_timeout(300)
        check('logging a food by hand creates a day', 'Chicken breast' in pm.inner_text('main') and '1.50' in pm.inner_text('main'), pm.inner_text('main')[:300])
        pm.locator('.ibtn[data-act=edit-entry]').first.click(); pm.wait_for_selector('#eform'); pm.fill('#eq', '100'); pm.click('#eform [type=submit]'); pm.wait_for_timeout(300)
        check('editing an entry updates cost', '0.75' in pm.inner_text('main'), pm.inner_text('main')[:300])
        pm.locator('.ibtn[data-act=edit-entry]').first.click(); pm.wait_for_selector('#eform'); pm.click('#edel'); pm.wait_for_timeout(300)
        check('deleting an entry clears the day', 'Nothing is logged yet' in pm.inner_text('main'))
        pm.evaluate("location.hash='trends'"); pm.wait_for_selector('main [data-act=tview][data-v=nutrition]'); pm.click('main [data-act=tview][data-v=nutrition]'); pm.wait_for_selector('.ntab')
        check('nutrition table lists foods', pm.locator('.ntab tbody tr').count() == 2)
        pm.evaluate("location.hash='meals'"); pm.wait_for_selector('[data-act=meal-open], #mform'); (pm.locator('[data-act=meal-open]').click() if pm.locator('[data-act=meal-open]').count() else None)
        pm.fill('#mn', 'Skyr bowl'); pm.fill('#mform .mrow:first-child [data-m=name]', 'Arla Skyr natural'); pm.fill('#mform .mrow:first-child [data-m=qty]', '200')
        pm.wait_for_timeout(300)
        tot = pm.inner_text('#mtot') if pm.locator('#mtot').count() else pm.inner_text('main')
        check('meal builder costs a manual food', '0.36' in tot or '0,36' in tot, tot[:200])
        check('no page errors in the manual flow', not merrs, merrs)
        pm.click('header .burger'); pm.wait_for_timeout(300)
        check('burger menu opens the drawer', pm.evaluate("document.body.classList.contains('drawer-open') && getComputedStyle(document.querySelector('#drawer')).visibility === 'visible'"))
        check('drawer links to the Account page', pm.locator('#drawer a[href="#account"]').count() == 1)
        pm.click('#drawer a[href="#account"]'); pm.wait_for_selector('main .acct')
        check('Account page offers backup and delete data', pm.locator('main [data-act=backup]').count() == 1 and pm.locator('main [data-act=reset]').count() == 1 and pm.inner_text('main h1') == 'Account and data')
        pm.click('header .burger'); pm.wait_for_timeout(300)
        pm.mouse.click(405, 400); pm.wait_for_timeout(300)
        check('tapping outside closes the drawer', pm.evaluate("!document.body.classList.contains('drawer-open')"))
        mc.close()

        # periods and import overlap, in a clean context
        ic = b.new_context(viewport={'width': 1100, 'height': 900}, locale='en-US'); pi = ic.new_page(); ierrs = []
        pi.on('pageerror', lambda e: ierrs.append(str(e)))
        pi.goto(BASE); pi.click('text=Try it with sample data'); pi.wait_for_selector('.pricetag .n')
        pi.click('a.tab:has-text("Summary")'); pi.wait_for_selector('#range')
        check('Summary tab is named Summary, not Week', pi.locator('a.tab:has-text("Week")').count() == 0)
        pi.select_option('#range', 'week'); pi.wait_for_selector('.pnav')
        t0 = pi.inner_text('main h1')
        pi.click('[data-act=pnav][data-dir="-1"]'); pi.wait_for_timeout(200)
        t1 = pi.inner_text('main h1')
        check('a specific week can be stepped back', t0 != t1 and ' to ' in t1, (t0, t1))
        pi.select_option('#range', 'custom'); pi.wait_for_selector('#pfrom')
        today = pi.evaluate("[...document.querySelectorAll('.strip .daybtn')].length || 0")
        pi.fill('#pfrom', '2020-01-01'); pi.fill('#pto', '2020-01-07'); pi.dispatch_event('#pto', 'change'); pi.wait_for_timeout(200)
        check('custom dates with no entries say so', 'Nothing is logged in this period' in pi.inner_text('main'), pi.inner_text('main')[:200])
        pi.select_option('#range', '7'); pi.wait_for_selector('.kpis')
        check('last 7 days still works', 'average day' in pi.inner_text('.kpis'))
        pi.click('a.tab:has-text("Trends")'); pi.wait_for_selector('#trange')
        pi.select_option('#trange', 'week'); pi.wait_for_selector('.pnav')
        check('Trends supports a specific week', pi.locator('.pnav').count() == 1)
        pi.select_option('#trange', '90')
        day = pi.evaluate("(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })()")
        tod = pi.evaluate("(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")
        csv = 'Day,Time,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g)\n' + day + ',08:00,Breakfast,"Oats, rolled","80 g",311,10.5,53,5.5\n' + tod + ',08:00,Breakfast,"Oats, rolled","80 g",311,10.5,53,5.5\n'
        pi.set_input_files('#file', {'name': 'x.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}); pi.wait_for_selector('#impchoice')
        check('overlapping import asks what to do', 'overlaps your diary' in pi.inner_text('#impchoice') and pi.locator('[data-act=imp-append]').count() == 1)
        pi.click('[data-act=imp-cancel]'); pi.wait_for_timeout(200)
        check('cancel leaves the diary alone', pi.evaluate("JSON.parse(localStorage.getItem('mcc.entries')).filter(e => e.date === '" + day + "').length") == 0)
        pi.set_input_files('#file', {'name': 'x.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}); pi.wait_for_selector('#impchoice')
        n0 = pi.evaluate("JSON.parse(localStorage.getItem('mcc.entries')).filter(e => e.date === '" + tod + "').length")
        pi.click('[data-act=imp-append]'); pi.wait_for_timeout(400)
        ents = pi.evaluate("JSON.parse(localStorage.getItem('mcc.entries'))")
        check('add-missing keeps existing days and adds new ones', len([e for e in ents if e['date'] == tod]) == n0 and len([e for e in ents if e['date'] == day]) == 1, (n0, len(ents)))
        pi.set_input_files('#file', {'name': 'x.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}); pi.wait_for_selector('#impchoice')
        pi.click('[data-act=imp-replace]'); pi.wait_for_timeout(400)
        ents = pi.evaluate("JSON.parse(localStorage.getItem('mcc.entries'))")
        check('overwrite replaces the overlapping day', len([e for e in ents if e['date'] == tod]) == 1, len([e for e in ents if e['date'] == tod]))
        check('no page errors in periods and import', not ierrs, ierrs)
        ic.close()

        # export links
        pl = b.new_context(viewport={'width': 412, 'height': 860}, locale='en-US').new_page()
        pl.goto(BASE); pl.click('text=How to export from Cronometer'); pl.wait_for_selector('#cronolink')
        check('landing links to the Cronometer site', pl.get_attribute('#cronolink', 'href') == 'https://cronometer.com/' and pl.get_attribute('#cronolink', 'target') == '_blank')
        pl.click('text=Try it with sample data'); pl.wait_for_selector('.pricetag .n')
        check('footer links to a new Cronometer export', pl.locator('footer.site a[href="https://cronometer.com/"]').count() == 1)
        pl.close()

        # installable web app
        pw = b.new_context(viewport={'width': 412, 'height': 860}, locale='en-US').new_page()
        pw.goto(BASE); pw.wait_for_selector('#app h1')
        check('web app manifest is linked', pw.get_attribute('link[rel=manifest]', 'href') == '/manifest.webmanifest')
        mf = pw.evaluate("fetch('/manifest.webmanifest').then(r => r.json())")
        check('manifest is installable', mf['display'] == 'standalone' and any(i['sizes'] == '512x512' for i in mf['icons']) and mf['start_url'] == '/')
        check('home screen icon exists', pw.evaluate("fetch('/apple-touch-icon.png').then(r => r.ok)") is True and pw.evaluate("fetch('/sw.js').then(r => r.ok)") is True)
        pw.close()

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
