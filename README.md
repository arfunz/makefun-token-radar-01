# Token launch radar

A radar for pre-token protocols, ranked by implied launch value. It reads the
sealed DeFiLlama snapshot (`snapshot.json`, as of 2026-11-14), fits its value
model on the snapshot's own tokened comparables, and writes a ranked board, a
sortable dashboard and a dossier for the judge.

## Model — radar-3

All coefficients are fitted at runtime; no protocol name and no coefficient
is hardcoded:

- **Size curve.** Least-squares fit of `log10(market cap) = a + b · log10(TVL)`
  over the snapshot's 128 tokened protocols. A dollar of TVL is worth a
  different multiple at $1M than at $1B, so the curve — not a flat multiple —
  prices every row.
- **Category factor.** The median log-residual of the category's tokened
  comparables, shrunk toward zero by count and clamped to ±0.40 in log10.
- **Seasoning.** 0.55 at listing, rising to 1.00 after 730 days with no token.
- **Momentum.** `1 + 0.5 × 7-day TVL change`, clamped to 0.90–1.10.
- **Kin.** ×0.5 when a sibling protocol (same first word of name) already has
  a token trading.
- **Range.** Every row carries the fitted residuals' P25–P75 band, applied to
  the point estimate.

## Board

198 rows: all 40 watchlist protocols, plus the 158 best early pre-token
protocols (TVL ≥ $1M, records no token) by implied value. The 144 protocols
set aside are counted on the dashboard's Exclusion audit tab, with a reason
each. Every row carries a 7-step farm plan for a $1,000 ticket held 60 days,
each step costed in dollars and minutes, plus a slice-per-$1k figure (what
$1,000 staked would hold if depositors got 10% pro rata).

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. It resolves the dashboard and
screenshots from the script's own location, so it runs from any working
directory. Node standard library only; no network, no build step.

## License

MIT — see LICENSE.
