# Handoff notes

Meal cost: free, privacy-first food diary with prices. Vanilla JS in `public/`, localStorage keys prefixed `mcc.`, Cloudflare Worker + D1 in `src/worker.js` for optional Google sync, Capacitor 8 Android app in `android/`.

Owner: Leonidas (GitHub LeonLester, personal email leonidask914@gmail.com for commits). Prefers short, professional replies, no emojis, no m-dashes.

## Where things live
- Web app: `public/app.js` (all views), `style.css`, `sync.js` (sign-in and sync), `native.js` (Android glue), `autocomplete.js`, `theme.js`.
- Site: https://mealcost.coachleonidas.com, deployed by `.github/workflows/deploy.yml` on push to `main` (tests first).
- Android: `.github/workflows/android.yml` builds a signed APK on every push, publishes it from `main` only to the `android-latest` release, runs an emulator smoke test, and builds the self-hosted F-Droid repo (`scripts/fdroid.sh`, `fdroid/`) onto the `gh-pages` branch.
- Tests: `python3 tests/serve.py` (port 8765) then `python3 tests/test_app.py`; sync tests need `tests/mock_google.py 9100` and `wrangler dev` (see deploy.yml).

## Facts that matter
- The APK signing key and the F-Droid repo key live in the GitHub Actions cache (repository secrets cannot be set from the cloud sessions). `.github/workflows/keepalive.yml` keeps them alive. Only `main` publishes, so one key is used.
- Android sign-in opens Chrome, returns by deep link `com.coachleonidas.mealcost://signin?code=...`, trades the code for a bearer token at `/auth/app-token`.
- Barcode lookup: Open Food Facts, then USDA FoodData Central. Scan uses Google's ML Kit code scanner (needs Play services), web uses BarcodeDetector.
- GitHub Pages must be set to deploy from the `gh-pages` branch (done by the owner) for the F-Droid repo to be reachable.

## Open items
- Test the native barcode scan and the Google sign-in round trip on a real phone (adb).
- Store signing keys as repository secrets (`ANDROID_KEYSTORE_BASE64` etc., workflow already supports them).
- Open Prices (Open Food Facts) and BLS averages as a "Prices near you" section; Kroger API optional.
- Parked: macro tracking (OpenNutriTracker style), receipt scanning with inventory, MyFitnessPal importer (needs a real export sample), Cronometer recipe export test.

## Receipt parsing and access control
- Worker route `POST /api/receipt` forwards a shrunken photo to a llama.cpp server (OpenAI-style `/v1/chat/completions`, multimodal model) and returns `{store, date, currency, items[]}`. Only users with `users.receipts = 1` (migration `0002_access.sql`) or an admin may call it. The Foods screen shows "Scan receipt" for them; they review the lines and apply prices.
- Admins are the emails in the `ADMIN_EMAILS` secret (comma separated). They get Menu > "Access (admin)" (`#admin`, `public/receipts.js`) to tick which users have receipts or stay free. Users appear after their first sign-in.
- Worker secrets: `ADMIN_EMAILS`, `LLAMA_URL` (public tunnel URL), `LLAMA_KEY` (the llama-server API key). Optional `CF_ACCESS_ID` and `CF_ACCESS_SECRET` if the tunnel sits behind Cloudflare Access.
- Setup: run llama-server with `--api-key <KEY>`, expose it with a named Cloudflare Tunnel (`cloudflared tunnel route dns` to a hostname, service `http://127.0.0.1:8080`), then `npx wrangler secret put` each secret above. If the Mac or the tunnel is off, the app says the model is offline.
- Android updates: `AppUpdatePlugin.java` downloads the APK inside the app and opens the system installer (first time the user must allow installs from Meal cost). Check for updates shows its result as a banner on the Diary, not a popup.

## Coach tools, label scan, export
- Migration `0004_coach.sql`: `users.coach`, `coach_clients` (status profile, invited, active, revoked), `coach_data` (profile snapshots), `coach_notes`, `audit`. Run `npm run migrate` (or the deploy workflow) before the new worker is live, then tick Coach tools for the owner on the Access page.
- Server logic is in `src/coach.js`. Invite tokens are random, stored hashed, single use, valid 14 days. The client approves while signed in, and can only narrow the scopes the coach asked for. Revoking or deleting the account ends access at once. Coach notes never reach the client. Coach reads of live data are logged at most once per 10 minutes per link, and the client sees the recent reads under Account and data.
- Client side is `public/coach.js`: it swaps the global `S` for the client's snapshot (`coWith`), so existing cost and stats code is reused. `window.__mcView` makes `store.set` a no-op and a click guard allows only read-only actions, so nothing from a client view is saved or synced.
- `POST /api/label` (`src/label.js`, `public/label.js`) uses the same model server and access rule as receipts. Limits: 30 per hour and 100 per day per user, 600 per day overall. Results fill the Add a food form for review.
- `public/export.js` builds the export zip (stored entries, no compression) and reads zips back for restore.

## Adaptive target, nested recipes, importers, API tokens
- `courseCorrection` is in `public/nutrition.js` and shown by `adaptiveCard` in `public/diary.js`. It uses the last 7 days (days with at least 800 kcal), a least squares weight slope and 7,500 kcal per kg. The wanted weekly rate is `goals.profile.rate` in kg a week. It is advice only.
- Recipes can contain recipes. `recipeCostOf` recurses (depth cap 6), `perUnit` guards against loops, `recipeHas` blocks a cycle when saving.
- `public/otherimport.js` is tried first by `parseCronometer` and returns null for Cronometer files. The Waistline mapping is by column names and was only tested on a synthetic file. Check it against a real export.
- Migration `0005_tokens.sql`: `api_tokens` (hash only). `src/tokens.js`: `/api/tokens` needs a session, `/api/v1/*` needs a token and is read-only, 60 per minute per token. Run `npm run migrate` before deploying.

## Hosting the model, limits, safety
- Moving the model to another machine, step by step: [docs/model-server.md](docs/model-server.md).
- The model runs as two launchd agents on the owner's Mac: `com.mealcost.llama` (llama-server, key read from `~/.config/mealcost/llama.key`) and `com.mealcost.llama-tunnel` (cloudflared tunnel `llama`, config `~/.cloudflared/llama-config.yml`, only `/v1/chat/completions` is routed). Logs: `~/Library/Logs/llama/`. Cloudflare Access (service token `mealcost-worker`, expires 2027-11-14) guards `llama.coachleonidas.com`; the worker sends it as `CF_ACCESS_ID` and `CF_ACCESS_SECRET`. To rotate the key: write a new one to the key file, `launchctl kickstart -k gui/$(id -u)/com.mealcost.llama`, then `wrangler secret put LLAMA_KEY`.
- Rate limits live in D1 table `rl` (`limited()` in `src/worker.js`): receipts 8 per hour and 30 per day per user and 300 per day overall, writes 120 per minute per user, API 300 per minute per address, sign-in routes 40 per 10 minutes per address, reference prices 30 per minute per address. Address limits only apply behind Cloudflare (they need `cf-connecting-ip`).
- Receipt safety: the worker builds the whole model request, so the only user input is the image (must be a `data:image` URL under 6 MB). The model server is forced to emit one JSON object by a strict schema, the worker validates and cleans every field again, names with links or markup are dropped, and nothing is applied until the user reviews and taps Apply (big price jumps start unticked). Adding a system prompt made the model skip the last receipt line, so the instruction sits in the user prompt.
- Go-to meals: saved meals have a `slot` (Breakfast, Lunch, Dinner, Snacks, Pre-workout, Post-workout). The Diary shows one-tap chips per slot and an "Add a go-to meal" dialog in the More menu.

## Layout, pantry
- Navigation: phones get a bottom bar with a centre + (Add sheet) and a More screen (`public/more.js`); from 641 px wide the same nav becomes a sidebar (icon rail below 1024 px). Sidebar-only links (Meals, Pantry, Targets) carry the class `desk`.
- Pantry (`public/pantry.js`): `S.pantry[food] = { qty, unit }` with unit g, ml or item, synced like the rest. Logging a food (or a go-to meal) takes it out when "Take foods out of the pantry" is on; a receipt scan can add its lines. Meal ideas filter saved meals by protein, cost and kcal limits, and rank meals you can make now first. Suggestions only come from the user's own saved meals, so the recipes always make sense.

## Look and icon
- Colours follow the Coach Leonidas brand: near-black `#0D0D0D`, warm off-white `#F4F0E8`, gold `#BF9A3F` (light theme fills) and `#D4B05A` (dark theme). `--brand-ink` is the accessible gold for text on light backgrounds. Macro colours: protein blue, carbs teal, fat purple, fibre green.
- The app icon is the gold line art of the logo (traced from `https://coachleonidas.com/images/logo.png`, which is only 200 px, so it was smoothed) on a dark tile. Source art and sizes are produced from `assets/` with `npx @capacitor/assets generate --android`; the web icons and `public/logo-mark.png` were made from the same art. `public/og.png` (share image) still has the old look.
- Planning ahead: the Diary navigates to any date, week arrows sit beside the day strip, future days show a Planned tag, and the day menu can copy a day to another date (and the next four weeks).
