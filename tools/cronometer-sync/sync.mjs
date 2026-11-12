#!/usr/bin/env node
// Downloads Cronometer exports with your own signed-in browser profile.
// Your password is never stored or passed on a command line: you sign in once in a real
// browser window and the session is kept in a local profile folder.
// Personal use only. Cronometer has no public API, and this drives the website like you would.

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'help';
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

const PROFILE = path.resolve(String(flag('profile', path.join(HOME, '.mealcost-cronometer'))));
const OUT = path.resolve(String(flag('out', path.join(HOME, 'Downloads', 'cronometer'))));
const BASE = String(flag('url', 'https://cronometer.com'));
const today = new Date().toISOString().slice(0, 10);

const log = (...m) => console.log(new Date().toTimeString().slice(0, 8), ...m);

async function open(headless) {
  fs.mkdirSync(PROFILE, { recursive: true });
  const opts = { headless, acceptDownloads: true, viewport: { width: 1400, height: 900 }, ignoreDefaultArgs: ['--enable-automation'], args: ['--disable-blink-features=AutomationControlled'] };
  const channel = flag('channel', process.env.CRONO_CHANNEL); // e.g. --channel chrome uses your installed Chrome
  if (channel && channel !== true) opts.channel = channel;
  if (process.env.CRONO_CHROME_PATH) opts.executablePath = process.env.CRONO_CHROME_PATH;
  return chromium.launchPersistentContext(PROFILE, opts);
}

async function snapshot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const png = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  return png;
}

// Signed-out visitors see a login form, so the presence of a password field is the signal.
async function signedOut(page) {
  return (await page.locator('input[type="password"]').count()) > 0;
}

async function login() {
  const ctx = await open(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  let closed = false;
  ctx.on('close', () => { closed = true; });
  await page.goto(`${BASE}/login/`).catch(() => {});
  log('Sign in in the browser window. This closes by itself once you are signed in.');
  const deadline = Date.now() + 10 * 60 * 1000;
  let seenForm = false, okTicks = 0;
  while (!closed && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    let hasForm = true;
    try {
      const pages = ctx.pages();
      const p = pages[pages.length - 1] || page;
      hasForm = (await p.locator('input[type="password"]').count()) > 0 || /\/login/.test(p.url());
    } catch { continue; }
    if (hasForm) { seenForm = true; okTicks = 0; } else if (++okTicks >= 4) break; // four quiet seconds without a login form
  }
  if (closed) { log('Window closed before sign-in finished. If you were signed in, run: node sync.mjs run --headed'); return; }
  if (okTicks < 4) { log('Timed out waiting for sign-in.'); await ctx.close(); process.exit(1); }
  await new Promise(r => setTimeout(r, 2500)); // let cookies settle
  await ctx.close();
  log('Signed in. Session saved in', PROFILE, '\nNext: node sync.mjs run --headed');
}

// Clicks an export control and returns the downloaded file path.
async function exportFrom(page, label, outName, steps) {
  fs.mkdirSync(OUT, { recursive: true });
  const target = path.join(OUT, outName);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    (async () => { for (const s of steps) await s(); })()
  ]);
  await download.saveAs(target);
  log(`${label}: saved ${target}`);
  return target;
}

const clickByText = (page, re, role = 'button') => async () => {
  const el = page.getByRole(role, { name: re }).first();
  if (!(await el.count())) { // fall back to any visible element with that text
    await page.getByText(re).first().click({ timeout: 15000 });
  } else await el.click({ timeout: 15000 });
};

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'recipe';
const LIST_URL = () => `${BASE}/#custom-recipes`;

// The recipes page is a list of names. Each one opens a recipe, whose "..." menu has "Export to CSV File...".
async function recipeNames(page) {
  await page.goto(LIST_URL(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (await signedOut(page)) throw new Error('NOT_SIGNED_IN');
  await page.getByText(/create recipe/i).first().waitFor({ timeout: 20000 });
  // Names are the plain text rows under the search box and sort control.
  return page.evaluate(() => {
    const sort = [...document.querySelectorAll('select, [role=combobox], div, span')].find(e => /^sorted by/i.test((e.innerText || '').trim()) && e.children.length < 3);
    const top = sort ? sort.getBoundingClientRect().bottom : 0;
    const skip = /^(create recipe|import recipe|search your recipes\.{0,3}|sorted by.*)$/i;
    const seen = new Set(), out = [];
    for (const e of document.querySelectorAll('body *')) {
      if (e.children.length) continue;
      const t = (e.innerText || '').trim();
      const r = e.getBoundingClientRect();
      if (!t || t.length > 120 || skip.test(t) || r.width === 0 || r.top < top - 1 || seen.has(t)) continue;
      seen.add(t); out.push(t);
    }
    return out;
  });
}

async function toList(page) {
  await page.goto('about:blank');
  await page.goto(LIST_URL(), { waitUntil: 'domcontentloaded' });
  await page.getByText(/create recipe/i).first().waitFor({ timeout: 20000 });
}

async function exportOneRecipe(page, name) {
  await toList(page);
  await page.getByText(name, { exact: true }).first().click({ timeout: 15000 });
  const idText = await page.getByText(/Recipe #\d+/).first().innerText({ timeout: 15000 });
  const id = (idText.match(/#(\d+)/) || [])[1] || slug(name);
  // The three dots sit next to ADD TO DIARY.
  const dots = page.getByRole('button', { name: /more|options|menu|actions|\.\.\.|\u2022/i }).first();
  if (await dots.count()) await dots.click({ timeout: 10000 });
  else await page.locator('xpath=//*[normalize-space(.)="ADD TO DIARY"]/following::button[1]').first().click({ timeout: 10000 });
  return exportFrom(page, name, `recipe-${id}-${slug(name)}.csv`, [
    async () => { await page.getByText(/export to csv file/i).first().click({ timeout: 10000 }); }
  ]);
}

async function exportRecipes(page) {
  const only = flag('recipe', null);
  let names = await recipeNames(page);
  if (!names.length) throw new Error('No recipes found on the page');
  if (typeof only === 'string') names = names.filter(n => n.toLowerCase().includes(only.toLowerCase()));
  const limit = Number(flag('limit', 0)); if (limit > 0) names = names.slice(0, limit);
  log(`Found ${names.length} recipes`);
  let failed = 0;
  for (const n of names) {
    try { await exportOneRecipe(page, n); }
    catch (e) { failed++; log(`  ${n}: failed (${e.message.split('\n')[0]})`); await snapshot(page, `error-${slug(n)}`); }
  }
  if (failed === names.length) throw new Error('Every recipe export failed');
  if (failed) log(`${failed} of ${names.length} recipes failed`);
}

async function exportServings(page, days) {
  // Best effort: Account > Export Data. Menu labels may differ, so run `explore` if this fails.
  await page.goto(`${BASE}/#account`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (await signedOut(page)) throw new Error('NOT_SIGNED_IN');
  await clickByText(page, /export data/i, 'link')().catch(() => clickByText(page, /export data/i)());
  return exportFrom(page, 'Food & recipe entries', `servings-${today}.csv`, [clickByText(page, /export/i)]);
}

async function run() {
  const headed = flag('headed', false) === true;
  const ctx = await open(!headed);
  const page = ctx.pages()[0] || await ctx.newPage();
  const failures = [];
  const steps = [['recipes', exportRecipes]];
  if (flag('servings', false) === true) steps.push(['servings', p => exportServings(p, Number(flag('days', 30)))]);
  for (const [name, fn] of steps) {
    try { await fn(page); }
    catch (e) {
      if (e.message === 'NOT_SIGNED_IN') { log('Not signed in. Run: node sync.mjs login'); await ctx.close(); process.exit(2); }
      const png = await snapshot(page, `error-${name}`);
      log(`${name} failed: ${e.message.split('\n')[0]}. Screenshot: ${png}`);
      failures.push(name);
    }
  }
  await ctx.close();
  process.exit(failures.length ? 1 : 0);
}

// Lists the buttons and links on a page, to fix the export steps if Cronometer changes its layout.
async function explore() {
  const target = String(flag('page', '#custom-recipes'));
  const ctx = await open(flag('headed', false) !== true ? true : false);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}/${target.startsWith('#') ? target : '#' + target}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (await signedOut(page)) { log('Not signed in. Run: node sync.mjs login'); await ctx.close(); process.exit(2); }
  const items = await page.evaluate(() => [...document.querySelectorAll('button, a, [role=button], [role=menuitem], select')]
    .map(e => ({ tag: e.tagName.toLowerCase(), text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 60) }))
    .filter(x => x.text));
  console.log(JSON.stringify(items, null, 1));
  const png = await snapshot(page, 'explore');
  log('Screenshot:', png);
  await ctx.close();
}

const PLIST = 'com.mealcost.cronometer-sync';
function install() {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const weekday = Number(flag('weekday', 1)), hour = Number(flag('hour', 7));
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${PLIST}</string>
<key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(dir, 'sync.mjs')}</string><string>run</string><string>--out</string><string>${OUT}</string></array>
<key>WorkingDirectory</key><string>${dir}</string>
<key>StartCalendarInterval</key><dict><key>Weekday</key><integer>${weekday}</integer><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>
<key>StandardOutPath</key><string>${path.join(HOME, 'Library/Logs/cronometer-sync.log')}</string>
<key>StandardErrorPath</key><string>${path.join(HOME, 'Library/Logs/cronometer-sync.log')}</string>
</dict></plist>`;
  const file = path.join(HOME, 'Library/LaunchAgents', `${PLIST}.plist`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, plist);
  console.log(`Wrote ${file}\nActivate with:\n  launchctl unload ${file} 2>/dev/null; launchctl load ${file}\nRuns weekly (weekday ${weekday}, ${hour}:00). Log: ~/Library/Logs/cronometer-sync.log`);
}

const help = `Cronometer sync (personal use)

  node sync.mjs login                Sign in once in a real window. The session is kept locally.
  node sync.mjs run [--servings]     Download one CSV per custom recipe (and the food entries CSV with --servings).
                                     Filters: --recipe \"text\"  --limit N
  node sync.mjs explore [--page #x]  List buttons on a page, to fix the steps if the layout changes.
  node sync.mjs install              Write a weekly macOS launchd job (--weekday 1 --hour 7).

Options: --channel chrome (use your installed Chrome)  --out DIR (default ~/Downloads/cronometer)  --headed  --profile DIR  --url BASE`;

const commands = { login, run, explore, install: async () => install(), help: async () => console.log(help) };
await (commands[cmd] || commands.help)();
