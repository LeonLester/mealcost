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

## Hosting the model, limits, safety
- The model runs as two launchd agents on the owner's Mac: `com.mealcost.llama` (llama-server, key read from `~/.config/mealcost/llama.key`) and `com.mealcost.llama-tunnel` (cloudflared tunnel `llama`, config `~/.cloudflared/llama-config.yml`, only `/v1/chat/completions` is routed). Logs: `~/Library/Logs/llama/`. Cloudflare Access (service token `mealcost-worker`, expires 2027-11-14) guards `llama.coachleonidas.com`; the worker sends it as `CF_ACCESS_ID` and `CF_ACCESS_SECRET`. To rotate the key: write a new one to the key file, `launchctl kickstart -k gui/$(id -u)/com.mealcost.llama`, then `wrangler secret put LLAMA_KEY`.
- Rate limits live in D1 table `rl` (`limited()` in `src/worker.js`): receipts 8 per hour and 30 per day per user and 300 per day overall, writes 120 per minute per user, API 300 per minute per address, sign-in routes 40 per 10 minutes per address, reference prices 30 per minute per address. Address limits only apply behind Cloudflare (they need `cf-connecting-ip`).
- Receipt safety: the worker builds the whole model request, so the only user input is the image (must be a `data:image` URL under 6 MB). The model server is forced to emit one JSON object by a strict schema, the worker validates and cleans every field again, names with links or markup are dropped, and nothing is applied until the user reviews and taps Apply (big price jumps start unticked). Adding a system prompt made the model skip the last receipt line, so the instruction sits in the user prompt.
- Go-to meals: saved meals have a `slot` (Breakfast, Lunch, Dinner, Snacks, Pre-workout, Post-workout). The Diary shows one-tap chips per slot and an "Add a go-to meal" dialog in the More menu.
