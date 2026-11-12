# Meal cost

Free meal cost calculator for Cronometer exports. Import your Food & Recipe Entries CSV, set prices once, and see what each meal and each day costs.

Live at https://mealcost.coachleonidas.com

## How it works

- Everything runs in the browser. Without signing in, your data stays in your browser's localStorage and is never sent anywhere.
- Optional Google sign-in syncs prices, logs, offers, recipes, meals and categories across devices. The Worker stores one gzipped snapshot per user in D1. Conflicts between devices ask which copy to keep. CSP is `connect-src 'self'`, so the page can only talk to its own origin.
- Prices can be per kg or litre, per 100 g or ml, or per item. Add grams per item to bridge a mismatch between a price and a logged amount.
- Offers: override a price for one day without changing the price book.
- Day and week views, daily budget, cost per 100 g protein and per 1,000 kcal, cheaper protein swaps.
- Prices tab: sort by times logged or total amount logged, merge duplicate foods (with suggestions), search across merged names.
- Price periods: a standard price on all dates, plus optional changes for a single day, a date range or from a date on (for example each shopping trip).
- Recipes: build a recipe from ingredients, see its cost, expand it on the Day view to see each ingredient's price. Cronometer exports a recipe as one row, so ingredients are entered in the app.
- Serving sizes without grams are estimated from calories when the same food was logged in grams.
- Categories come from the Cronometer Category column. Assign them to uncategorized foods on the Prices tab.
- Sort foods by protein, carbs, fat or fiber per 100 g or per 100 kcal.
- Trends tab: cost per 100 g protein, carbs, fat, per 10 g fiber and per 1,000 kcal by day or week, plus spend by category.
- Meal builder tab: combine foods and recipes, see cost (always from current prices) and nutrition, save, edit, duplicate, compare two meals, add to the diary.
- Backup and restore as JSON (prices, offers, merges, periods, recipes, meals, categories), CSV export, copy as text, 1080x1350 share image.

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
    npx wrangler d1 migrations apply mealcost --local
    npx wrangler dev --port 8788 --var GOOGLE_CLIENT_ID:test-client GOOGLE_CLIENT_SECRET:s \
      GOOGLE_AUTH_URL:http://127.0.0.1:9100/auth GOOGLE_TOKEN_URL:http://127.0.0.1:9100/token PUBLIC_ORIGIN:http://localhost:8788
    python3 tests/test_sync.py

## Tests

    pip install playwright && playwright install chromium
    python3 tests/test_app.py

The tests serve `public/` with the headers from `public/_headers` and check parsing, costing, offers, routing and the share image.

## Fonts

Bricolage Grotesque and IBM Plex Sans, self-hosted, SIL Open Font License 1.1.

## License

MIT
