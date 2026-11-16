# Meal cost

Free, private food diary with macro tracking and meal costs. Log food, set daily goals, track weight, and see what each meal and day costs. Imports Cronometer exports, including their vitamin and mineral columns.

Live at https://mealcost.coachleonidas.com

## How it works

- Diary: calories, protein, carbs, fat and fiber per food, per meal and per day against your goals. Move to any day, quick add calories, copy a meal or day from earlier, and see a live nutrition and cost preview while logging.
- Daily goals: type your own or use the built-in estimate (Mifflin-St Jeor, activity level, lose, maintain or build). Optional limits for sugar, sodium and more, and targets for vitamins and minerals.
- Nutrients: Cronometer exports carry 16 more nutrients, shown under All nutrients in the Diary and averaged in Progress.
- Progress: daily averages against goals, a weight log in kg or lb with a trend chart, spending, and trends.

- Everything runs in the browser. Without signing in, your data stays in your browser's localStorage and is never sent anywhere.
- Optional Google sign-in syncs prices, logs, offers, recipes, meals and categories across devices. The Worker stores one gzipped snapshot per user in D1. Conflicts between devices ask which copy to keep. CSP is `connect-src 'self'`, so the page can only talk to its own origin.
- Prices can be per kg or litre, per 100 g or ml, or per item. Add grams per item to bridge a mismatch between a price and a logged amount.
- Offers: override a price for one day without changing the price book.
- Daily budget, cost per 100 g protein and per 1,000 kcal, cheaper protein swaps.
- Foods tab: sort by times logged or total amount logged, merge duplicate foods (with suggestions), search across merged names.
- Price periods: a standard price on all dates, plus optional changes for a single day, a date range or from a date on (for example each shopping trip).
- Recipes: build a recipe from ingredients, see its cost, expand it in the Diary to see each ingredient's price. Cronometer exports a recipe as one row, so ingredients are entered in the app.
- Serving sizes without grams are estimated from calories when the same food was logged in grams.
- Categories come from the Cronometer Category column. Assign them to uncategorized foods on the Foods tab.
- Sort foods by protein, carbs, fat or fiber per 100 g or per 100 kcal.
- Trends: cost per 100 g protein, carbs, fat, per 10 g fiber and per 1,000 kcal by day or week, plus spend by category.
- Food page: tapping a diary entry or logging a food opens a Cronometer-style page with the amount controls and a live nutrition panel (energy, share from protein, carbs and fat, every nutrient with percent of your daily target, cost, ingredients). Vitamins, minerals and fat detail show when the food has them.
- Look: a light grey page with white cards, as in Cronometer. Dark mode is unchanged.
- Charts: a Cronometer-style library under Progress. Energy consumed (stacked protein, carbs, fat against the calorie goal), single nutrient with its target, nutrition score, electrolytes, food cost, single biometric, weight with body fat or waist, blood pressure and heart rate, lipid panel, Glucose Ketone Index and a custom two-variable chart. Timeframes from 7 days to all, custom dates, all/logged/completed days, 7-day trend, target line, zoom to fit, image (SVG) and data (CSV) download, print, and a Manage charts list. Measurements other than weight come from a Cronometer biometrics export or the Log a measurement button and sync like other data. Sleep stages, CGM traces and calcium absorption are not included.
- Meal builder tab: combine foods and recipes, see cost (always from current prices) and nutrition, save, edit, duplicate, compare two meals, add to the diary.
- Backup and restore as JSON (prices, offers, merges, periods, recipes, meals, categories), CSV export, copy as text, 1080x1350 share image.
- Course correction (Daily goals): checks your intake and weight over the last week, 2 weeks or 4 weeks against the weekly rate you want, at 7,500 kcal per kg. It suggests how many kcal a day to add or cut, and only fills the form when you press the button. Longer windows are steadier and need more logged days and weigh-ins.
- Guardrails from RP's published rules: advice never asks for more than 1% of body weight lost a week, stops loss advice below BMI 17, keeps protein fixed, shares calorie changes between carbs and fat, and keeps fat at 15% of calories or more and at least 5 g of fat and 5 g of carbs in every meal. When a floor is reached it holds calories and says so.
- Phases (weight plan): fat loss, maintenance or muscle gain with a length. Fat loss and gain are limited to 16 weeks, a rate is suggested from the length (0.7% of body weight a week at 6 weeks down to 0.5% at 12), and a second fat loss phase without maintenance of at least two thirds the length of the first is flagged.
- Meal plan for the day (Daily goals): splits your protein, carbs and fat over 4 to 6 meals from your wake time, with carbs weighted around your training time, less fat in the meals before and after training, and the last meal the largest. RP does not publish its exact split, so the spacing and weights are our own reading of its principles.
- Weight plan (Weight tab): set a start date, start weight, weekly change and optional goal. The chart draws the planned line (dashed) next to your actual weigh-ins and shows how far above or below plan you are. The plan's rate also drives the course correction.
- Nested recipes: a recipe can be an ingredient of another, costed and counted through every level. A recipe cannot contain itself.
- Import from MyFitnessPal (nutrition summary, one quick entry per meal), Lose It (per food) and Waistline (per food, columns matched by name). Drop the file anywhere like a Cronometer export.
- API tokens (Account): read-only tokens with scopes (diary, prices, weights) and an expiry. `GET /api/v1/data` and `/api/v1/me` with `Authorization: Bearer mct_...`.
- Export all my data (Account and data): one zip with `data.json` (restorable) and one CSV per table (diary, prices, price periods, offers, foods, recipes, meals, weights, goals).
- Scan label (Add a food, + sheet): photograph the front of a pack and its nutrition table. The model reads name, per 100 g or per portion values and barcode, the worker converts to per 100 g and warns when energy and macros disagree. Same access as receipts (receipts flag, coach tools or admin).
- Coach tools (users with the Coach flag, set by an admin under Access): a Clients desk with a read-only diary, macros, cost and trends per client, targets, private notes, and a weekly report (copy, CSV, print). A client is linked either by an invite link the client approves while signed in (scopes diary, prices, weights; revocable at any time; reads are logged and shown to the client), or kept as a profile where the coach imports the client's Cronometer exports.

## Run locally

    npm install
    npm run dev

Or serve `public/` with any static server.

## Deploy

One-time setup for sign-in and sync:

1. Create the database and put the id it prints into `wrangler.jsonc` (`database_id`):

        npx wrangler d1 create mealcost
        npx wrangler d1 migrations apply mealcost --remote

2. In Google Cloud Console, create an OAuth client (type Web application). Add this authorized redirect URI:

        https://mealcost.coachleonidas.com/auth/google/callback

   Put the client ID in `wrangler.jsonc` under `vars.GOOGLE_CLIENT_ID`, and store the secret:

        npx wrangler secret put GOOGLE_CLIENT_SECRET

3. Deploy:

        npx wrangler login
        npx wrangler deploy

`wrangler.jsonc` routes `mealcost.coachleonidas.com` as a custom domain, so the `coachleonidas.com` zone must be in the same Cloudflare account. No email service is used.

Without the database and Google settings the app still works as before, and the sign-in link reports that it is not configured.

## Continuous deployment

Pushing to `main` runs the tests and then deploys through GitHub Actions (`.github/workflows/deploy.yml`). Pull requests run the tests only. The deploy job applies pending D1 migrations first, then runs `wrangler deploy`.

Add these repository secrets (Settings, Secrets and variables, Actions), and create an environment named `production`:

- `CLOUDFLARE_API_TOKEN`: a token with Workers Scripts edit, D1 edit, and Workers Routes edit on the coachleonidas.com zone.
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers overview page in the Cloudflare dashboard.

`GOOGLE_CLIENT_SECRET` stays in Cloudflare (`wrangler secret put`) and is never stored in GitHub.

## Test sync locally

    python3 tests/mock_google.py 9100 &
    python3 tests/mock_llama.py 9200 &
    npx wrangler d1 migrations apply mealcost --local
    npx wrangler dev --port 8788 --var GOOGLE_CLIENT_ID:test-client GOOGLE_CLIENT_SECRET:s \
      GOOGLE_AUTH_URL:http://127.0.0.1:9100/auth GOOGLE_TOKEN_URL:http://127.0.0.1:9100/token PUBLIC_ORIGIN:http://localhost:8788 \
      ADMIN_EMAILS:admin@example.com LLAMA_URL:http://127.0.0.1:9200 LLAMA_KEY:test-key
    python3 tests/test_sync.py

## Tests

    pip install playwright && playwright install chromium
    python3 tests/test_app.py
    node tests/test_label.mjs

The tests serve `public/` with the headers from `public/_headers` and check parsing, costing, offers, routing and the share image.

## Fonts

Bricolage Grotesque and IBM Plex Sans, self-hosted, SIL Open Font License 1.1.

## License

MIT

## Install on Android with F-Droid

CI builds a self-hosted F-Droid repository on every push to `main` and publishes it to GitHub Pages.
Open https://leonlester.github.io/mealcost/fdroid/ on the phone and tap Add to F-Droid, or add
`https://leonlester.github.io/mealcost/fdroid/repo` in F-Droid under Settings, Repositories.
The repository key and the APK signing key live in the GitHub Actions cache, kept alive by
`.github/workflows/keepalive.yml`. Metadata is in `fdroid/metadata`, the build is `scripts/fdroid.sh`.

## Install on iPhone (sideloading)

The easiest way on iPhone is still the web app: open https://mealcost.coachleonidas.com in Safari, tap Share, then Add to Home Screen.

There is also a native build for people who want it. Apple only runs apps signed by a developer account, so the release file is unsigned and you sign it with your own free Apple ID using a sideloading tool.

1. Download `mealcost-unsigned.ipa` from https://github.com/LeonLester/mealcost/releases/tag/ios-latest on your Mac or PC.
2. Install it with one of these tools. All of them sign the app with your Apple ID:
   - Sideloadly (Mac or Windows): open Sideloadly, plug in the iPhone, drag the `.ipa` in, enter your Apple ID, press Start.
   - AltStore (Mac or Windows): install AltServer, install AltStore on the phone, then open the `.ipa` in AltStore.
   - SideStore: like AltStore, refreshes over Wi-Fi without a computer after setup.
3. On the iPhone, open Settings, General, VPN and Device Management, trust your Apple ID. Turn on Developer Mode (Settings, Privacy and Security) if iOS asks.
4. Free Apple IDs sign for 7 days, up to 3 apps. The tool must refresh the app every week or it stops opening. Your data stays on the phone.

Or build it yourself on a Mac with Xcode: `npm ci && npm run build:web && npx cap add ios && npx cap sync ios && npx cap open ios`, then pick your team under Signing and run on the phone.

The iPhone build does not update itself. Download a newer `.ipa` and install it over the old one. It is built by `.github/workflows/ios.yml` on every push to `main`. Barcode scanning and Google sign-in on iPhone are not tested yet.
