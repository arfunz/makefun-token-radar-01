# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's **token-radar-01** bounty ("Build the best token launch radar", $1,325 USDC).

The radar reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that
still record no token and are not a wrapped, staked or bridged product of a token that
already trades, ranks them by what their launch would be worth, and shows a reader how to
farm each one.

## The model (radar-2)

Implied value follows only from the snapshot's own figures, and no protocol name is ever
special-cased — one function scores every row:

```
implied = round( tvl_usd × category_multiple
                 × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)
                 × (0.6 + min(age_days, 1095) / 1095 × 0.4) )
```

- **category_multiple** — the median market-cap-to-TVL ratio of the snapshot's own
  live-token protocols in the same category (at least 3 peers; otherwise the global median
  across every live-token protocol), clamped to [0.02, 1.5]. A lending protocol is priced
  like lending protocols trade; a DEX like DEXs trade. The multiple is computed from the
  snapshot at run time, so it moves with the market the snapshot records.
- **growth** — the protocol's seven-day TVL change, clamped to [-60, +120]%.
- **maturity** — how long the protocol has run with no token (days since DefiLlama first
  listed it; 365 days when unlisted), scaled to [0.6, 1.0].

The board covers the whole pre-token universe the snapshot records: all 40 watchlist
protocols (TVL ≥ $50M, no token, not wrapped/staked/bridged) plus every other rankable
pre-token protocol — 246 rows in this snapshot. Above the floor, wrapped, staked and
bridged products of a token that already trades (WBTC, USDT0, a chain's canonical bridge)
are kept out, because their token already exists. Live-token protocols are set aside with
their market caps shown, never mixed into the ranking.

Each row carries a seven-step farm plan derived from the protocol's own record (category,
chains, TVL, age): two qualifying actions for its category, a weekly action, a hold window,
a claim check and a farm log — each step with its cost and time.

## The dashboard

`dashboard/` is a static page with no network and no framework: a sortable, filterable
board (search, category, chain, watchlist-only), a detail view for every protocol with the
model's own breakdown and its farm plan, a live-token view, and a panel showing the
category multiples the model computed. The page recomputes each row from the snapshot
figures and checks the number `board.json` carries. The implied-value bars use a log scale,
because the top row is worth thousands of times the smallest one, and the detail view
totals the farm plan's cost (capital held in the position, one-off gas, then weekly gas)
before the steps.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes the ranked board to
`/output/board.json`, the dashboard's data to `/output/data.js`, copies `dashboard/` and
`screenshots/` to `/output`, and writes `/output/dossier.json` with the vendored
`vendor/makefun-board.ts`.

## License

MIT. See `LICENSE`.
