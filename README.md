# radar-4 — the calibrated radar

A make.fun token-radar-01 entry. It reads `/input/snapshot.json` (758
DefiLlama protocols, as of 2026-11-14), fits the value model at runtime
from the snapshot's own tokened comparables, and ranks the 198 pre-token
protocols worth watching: the 40-slug watchlist plus 158 early finds.

## The model

Three independent pricings per protocol, combined by their lower quartile:

1. **Size curve** — OLS of log10(mcap) on log10(TVL) over the snapshot's
   tokened comparables, with a per-category adjustment (shrunk median
   residual, n/(n+20), clamped ±0.40 log points).
2. **Local-comps multiple** — the median mcap/TVL of comparables in the
   same category whose TVL sits within 10× of the protocol's, else any
   category in that band, else the global median.
3. **Chain-breadth model** — value ∝ TVL^slope × chains^gamma, gamma
   fitted at runtime.

The lower quartile is then seasoned (0.55 → 1.00 over 730 days with no
token), momentum-adjusted (1 + 0.5 × 7-day change, clamped [0.90, 1.10]),
and halved when a same-family protocol's token already trades (kin).

**The breakthrough: per-category leave-one-out calibration.** Every row's
band (P25–P75) comes from its own category's leave-one-out residuals, so
a category the model reads well (RWA, Basis Trading) gets a tight band
and a category it reads badly (CEX, Lending) gets a wide one. Categories
with fewer than 6 comps fall back to the global band.

**Backtests, computed at runtime and shown on the dashboard:** leave-one-out
over all tokened comps, and a time split (fit on tokens listed before 2024,
test on 2024 and later), each beaten against a flat mcap/TVL multiple.

**Farm plans:** 7 concrete steps per row, $1,000 ticket, 60-day hold, with
a verdict netted twice — at the implied value and at the category band's
low end (ROBUST / FARM / THIN / SKIP) — plus a break-even implied value,
$/hour, and a "Farm Next" top-10 ranked by net $/hour at the low end.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Writes `out/board.json`, `out/dashboard/` (index.html, app.css, app.js,
generated data.js), `out/screenshots/` and `out/dossier.json`. The program
re-reads its own board.json after writing and fails non-zero if any gate
condition is violated, so a bad run never looks good.

No protocol name is hardcoded into the model — every coefficient is fitted
from the snapshot on every run. The program runs twice with byte-identical
output (verified from two different working directories).
