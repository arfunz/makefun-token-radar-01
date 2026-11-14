# Token Radar

A token launch radar: every protocol with at least $50M of TVL and no token on
record, plus every other pre-token protocol the floor leaves out, ranked by an
implied value built only from the snapshot's own figures.

## The model (radar-2)

A protocol that records no token is scored by

```
implied = round( tvl_usd x category_multiple
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **category_multiple** is the median market-cap-to-TVL ratio of the snapshot's
  own live-token peers in the same category (at least 3 peers), otherwise the
  global median over all live-token protocols. Multiples are clamped to
  0.02–1.5 and computed at run time: no protocol name and no multiple is
  written in by hand.
- **growth** is the seven-day TVL change, clamped to −60…120%, at half weight.
- **maturity** is how long the protocol has run with no token, from 0.6 for a
  brand-new listing to 1.0 after three years; an unlisted protocol counts as
  one year old.

The board covers the whole watchlist — all 40 protocols at or above the $50M
floor with no token on record — plus 206 earlier pre-token protocols, for 246
rows. Above the floor, an early row must also pass the watchlist's exclusion:
wrapped, staked and bridged products of a token that already trades, exchange
products and versioned copies are kept out. Below the floor every rankable
pre-token protocol is taken. The top row is Steakhouse Financial at $464.9M of
implied value.

## The dashboard

`dashboard/` is a static page (no network, no framework) that reads `data.js`.
It is sortable and filterable — by name, category, chain, watchlist-only, and
pre-token versus live-token — and every row opens a detail view with the full
model breakdown and a seven-step farm plan. Implied-value bars are on a log
scale: the top row is worth thousands of times the smallest, so a linear bar
would hide every row below it. The farm plan names what to do, what it costs
and how long it takes, and the detail view totals the cost: the capital, held
in the position and not spent, plus the gas one-off and the weekly gas. The
page recomputes each row's implied value from its own figures and checks it
against the number `board.json` carries. A "How implied value is computed"
panel shows the formula and the category-multiples table.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

The program reads `/input/snapshot.json` by default (or `--input`), scores the
board, and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. It exits 1 when the board fails the
gate (a missing watchlist slug, ranks out of order, an implied value rising
with rank, a farm step outside 3–12 steps or 20–600 characters) or when fewer
than 3 screenshots are present. Two runs over the same snapshot write
identical bytes.

## Files

- `main.ts` — the program: read, score, write, dossier.
- `lib/model.ts` — the radar-2 model, the board, the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — board, detail and filtered views of the page.

MIT licensed. See LICENSE.
