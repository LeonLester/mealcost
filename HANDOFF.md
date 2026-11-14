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
