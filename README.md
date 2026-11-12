# Meal cost

Free meal cost calculator for Cronometer exports. Import your Food & Recipe Entries CSV, set prices once, and see what each meal and each day costs.

Live at https://mealcost.coachleonidas.com

## How it works

- Everything runs in the browser. Your data stays in your browser's localStorage and is never sent anywhere (CSP `connect-src 'none'`).
- Prices can be per kg or litre, per 100 g or ml, or per item. Add grams per item to bridge a mismatch between a price and a logged amount.
- Offers: override a price for one day without changing the price book.
- Day and week views, daily budget, cost per 100 g protein and per 1,000 kcal, cheaper protein swaps.
- Prices tab: sort by times logged or total amount logged, merge duplicate foods (with suggestions), search across merged names.
- Backup and restore as JSON (prices, offers, merges), CSV export, copy as text, 1080x1350 share image.

## Run locally

    npm install
    npm run dev

Or serve `public/` with any static server.

## Deploy

    npx wrangler login
    npx wrangler deploy

`wrangler.jsonc` routes `mealcost.coachleonidas.com` as a custom domain, so the `coachleonidas.com` zone must be in the same Cloudflare account.

## Tests

    pip install playwright && playwright install chromium
    python3 tests/test_app.py

The tests serve `public/` with the headers from `public/_headers` and check parsing, costing, offers, routing and the share image.

## Fonts

Bricolage Grotesque and IBM Plex Sans, self-hosted, SIL Open Font License 1.1.

## License

MIT
