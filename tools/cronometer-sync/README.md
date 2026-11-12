# Cronometer sync

Downloads your Cronometer exports on a schedule so you can drop them into the Meal cost app. Personal use only. Cronometer has no public API, so this drives the website with your own signed-in browser profile. Your password is never stored: you sign in once in a real window and the session stays in a local folder (`~/.mealcost-cronometer`).

## Set up

    cd tools/cronometer-sync
    npm install
    npx playwright install chromium     # or skip this and add --channel chrome to every command

## Use

    node sync.mjs login                 # sign in once, then close the window
    node sync.mjs run                   # one CSV per custom recipe -> ~/Downloads/cronometer/recipe-ID-name.csv
    node sync.mjs run --recipe tzatziki --limit 3   # only some recipes, handy for a first test
    node sync.mjs run --servings        # also try the food entries export (best effort)
    node sync.mjs explore --page '#custom-recipes'   # list buttons if Cronometer changes its layout
    node sync.mjs install               # weekly macOS job (Monday 07:00). Follow the printed launchctl line.

Options: `--out DIR`, `--headed` (watch it work), `--channel chrome`, `--profile DIR`.

Exit codes: 0 done, 1 an export failed (a screenshot is saved next to the files), 2 not signed in. When the session expires, run `login` again.

## Notes

- Cronometer only exports one recipe at a time (open it, then the three-dot menu, then Export to CSV File), so the tool does that for every recipe in the list. It is tested against a stand-in page only. The first real run may need a small selector fix. Run with `--headed`, and if it fails, send the `error-recipes.png` screenshot and the output of `explore`.
- Keep the downloaded CSVs out of git. The repo ignores `*.csv`.
