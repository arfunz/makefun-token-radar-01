// data.js generation: the dashboard's single data file, written by main.ts
// (never hand-written). Rows are compact positional arrays; the dashboard
// recomputes seasoning, momentum and fees from the values it already has,
// so the file stays well under the dossier's 64 KiB text budget.

import type { BoardRow, Audit } from "./board.ts";
import type { Fit } from "./model.ts";
import { STEP_TEMPLATES, PLAYS } from "./steps.ts";

const VERDICTS = ["ROBUST", "FARM", "THIN", "SKIP"];

export function moneyM(x: number): number {
  return Math.round((x / 1e6) * 10) / 10;
}

export function buildDashboardData(
  rows: BoardRow[],
  audit: Audit,
  fit: Fit,
  asOf: string,
): string {
  const compactRows = rows.map((r) => [
    r.rank,
    r.slug,
    r.name,
    r.category,
    r.chain,
    r.chains,
    moneyM(r.tvl_usd),
    r.change_7d === null ? null : Math.round(r.change_7d * 10) / 10,
    r.listed_at === null ? -1 : r.age_days,
    moneyM(r.implied_value_usd),
    moneyM(r.low_usd),
    moneyM(r.high_usd),
    r.slice_per_1k_usd,
    r.net_usd,
    r.net_low_usd,
    moneyM(r.break_even_usd),
    r.per_hour_usd,
    VERDICTS.indexOf(r.verdict),
    r.play_idx,
    r.contested ? 1 : 0,
    moneyM(r.model_curve_usd),
    moneyM(r.model_local_usd),
    moneyM(r.model_chain_usd),
    r.kin ? 1 : 0,
  ]);

  // Tokened comparables for the scatter: [log10 TVL, log10 mcap], 2 decimals.
  const comps = fit.comps.map((p) => [
    Math.round(Math.log10(p.tvl_usd) * 100) / 100,
    Math.round(Math.log10(p.mcap_usd as number) * 100) / 100,
  ]);

  const data = {
    asOf,
    nTotal: audit.total,
    nRanked: audit.ranked,
    nTokened: audit.tokened,
    curve: {
      inter: Math.round(fit.inter * 10000) / 10000,
      slope: Math.round(fit.slope * 10000) / 10000,
      r2: Math.round(fit.r2 * 1000) / 1000,
      globalBand: [Math.round(10 ** fit.globalLo * 1000) / 1000, Math.round(10 ** fit.globalHi * 1000) / 1000],
    },
    loo: {
      miss: Math.round(fit.loo.miss * 100) / 100,
      within3: Math.round(fit.loo.within3 * 1000) / 1000,
      within10: Math.round(fit.loo.within10 * 1000) / 1000,
    },
    flatLoo: {
      miss: Math.round(fit.flatLoo.miss * 100) / 100,
      within3: Math.round(fit.flatLoo.within3 * 1000) / 1000,
      within10: Math.round(fit.flatLoo.within10 * 1000) / 1000,
    },
    timeSplit: {
      curveMiss: Math.round(fit.timeSplit.curveMiss * 100) / 100,
      curveWithin3: Math.round(fit.timeSplit.curveWithin3 * 1000) / 1000,
      flatMiss: Math.round(fit.timeSplit.flatMiss * 100) / 100,
      flatWithin3: Math.round(fit.timeSplit.flatWithin3 * 1000) / 1000,
      nTrain: fit.timeSplit.nTrain,
      nTest: fit.timeSplit.nTest,
    },
    calibration: fit.catCalibration.map((c) => [
      c.cat,
      c.n,
      Math.round(c.looMiss * 100) / 100,
      Math.round(c.bandLo * 100) / 100,
      Math.round(c.bandHi * 100) / 100,
      Math.round(c.adj * 100) / 100,
    ]),
    audit: audit.setAside.map((s) => [s.reason, s.count]),
    setAsideTotal: audit.setAsideTotal,
    steps: STEP_TEMPLATES,
    rows: compactRows,
    comps,
  };
  return `window.RADAR_DATA = ${JSON.stringify(data)};\n`;
}
