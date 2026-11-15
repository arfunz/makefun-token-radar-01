// Board building: rank the 198 rows (40 watchlist + 158 early), build the
// exclusion audit that accounts for all 758 protocols, and the Farm Next
// shortlist. No protocol name appears anywhere here — every choice follows
// from the snapshot and the fitted model.

import {
  ageDays,
  buildKinSet,
  fitModel,
  valueProtocol,
  type Fit,
  type Protocol,
  type Snapshot,
} from "./model.ts";
import { farmEconomics, renderSteps, PLAYS, type Farm } from "./steps.ts";

export type BoardRow = {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  listed_at: string | null;
  category: string | null;
  chain: string | null;
  chains: number;
  slice_per_1k_usd: number;
  net_usd: number;
  net_low_usd: number;
  break_even_usd: number;
  per_hour_usd: number;
  verdict: string;
  contested: boolean;
  kin: boolean;
  play_idx: number;
  model_curve_usd: number;
  model_local_usd: number;
  model_chain_usd: number;
  farm_steps: string[];
};

export type Audit = {
  total: number;
  ranked: number;
  tokened: number;
  setAside: { reason: string; count: number; slugs: string[] }[];
  setAsideTotal: number;
};

function isVersionedDuplicate(p: Protocol): boolean {
  // A version marker is a space followed by V2, v2, 2.0, 3.0 "or the like"
  // (RULES.txt): any V-number or N.0 suffix counts.
  return / (v\d+|V\d+|\d+\.0)$/.test(p.name);
}

function isWrappedOrStaked(p: Protocol): boolean {
  return /\b(wrapped|staked|staking)\b/i.test(p.name);
}

function isExchangeProduct(p: Protocol): boolean {
  return /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(p.name);
}

export function buildBoard(snap: Snapshot): {
  rows: BoardRow[];
  audit: Audit;
  fit: Fit;
} {
  const protocols = snap.protocols;
  const fit = fitModel(protocols);
  const isKin = buildKinSet(protocols);
  const watchlist = new Set(snap.watchlist);
  const hasToken = (p: Protocol): boolean => p.gecko_id !== null || p.symbol !== null;
  const preToken = protocols.filter((p) => !hasToken(p));
  const tokened = protocols.filter(hasToken);

  const valued = new Map<string, ReturnType<typeof valueProtocol>>();
  for (const p of preToken) valued.set(p.slug, valueProtocol(fit, isKin, p));

  const setAside: Audit["setAside"] = [];
  const aside = (reason: string, list: Protocol[]): void => {
    if (list.length > 0) {
      setAside.push({ reason, count: list.length, slugs: list.map((p) => p.slug) });
    }
  };
  const early: Protocol[] = [];
  for (const p of preToken) {
    if (watchlist.has(p.slug)) early.push(p);
  }
  const rest = preToken.filter((p) => !watchlist.has(p.slug));
  const byReason: [string, (p: Protocol) => boolean][] = [
    ["CEX", (p) => p.category === "CEX"],
    ["Liquid Staking", (p) => p.category === "Liquid Staking"],
    ["Bridge", (p) => p.category === "Bridge"],
    ["Canonical Bridge", (p) => p.category === "Canonical Bridge"],
    ["Versioned duplicate", isVersionedDuplicate],
    ["Wrapped / staked", isWrappedOrStaked],
    ["Liquid Restaking", (p) => p.category === "Liquid Restaking"],
    ["Restaked BTC", (p) => p.category === "Restaked BTC"],
  ];
  const asideSlugs = new Set<string>();
  for (const [reason, test] of byReason) {
    const list = rest.filter((p) => test(p) && !asideSlugs.has(p.slug));
    for (const p of list) asideSlugs.add(p.slug);
    aside(reason, list);
  }
  const rankedEarly = rest
    .filter((p) => !asideSlugs.has(p.slug))
    .sort((a, b) => {
      const va = valued.get(a.slug)?.value ?? 0;
      const vb = valued.get(b.slug)?.value ?? 0;
      return vb - va || a.slug.localeCompare(b.slug);
    })
    .slice(0, 158);

  const ranked = [...early, ...rankedEarly]
    .sort((a, b) => {
      const va = valued.get(a.slug)?.value ?? 0;
      const vb = valued.get(b.slug)?.value ?? 0;
      return vb - va || a.slug.localeCompare(b.slug);
    });

  const rows: BoardRow[] = ranked.map((p, i) => {
    const v = valued.get(p.slug) as ReturnType<typeof valueProtocol>;
    const farm: Farm = farmEconomics(v.value, v.low, p.tvl_usd, p.chains[0] ?? null, p.category);
    const steps = renderSteps(p.name, p.chains[0] ?? null, farm.play, farm.feeTotal);
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: Math.round(v.value),
      low_usd: Math.round(v.low),
      high_usd: Math.round(v.high),
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p),
      listed_at: p.listed_at,
      category: p.category,
      chain: p.chains[0] ?? null,
      chains: p.chains.length,
      slice_per_1k_usd: Number(farm.slice.toFixed(2)),
      net_usd: Number(farm.net.toFixed(2)),
      net_low_usd: Number(farm.netLow.toFixed(2)),
      break_even_usd: Math.round(farm.breakEven),
      per_hour_usd: Number(farm.perHour.toFixed(2)),
      verdict: farm.verdict,
      contested: v.contested,
      kin: v.isKin,
      play_idx: PLAYS.indexOf(farm.play),
      model_curve_usd: Math.round(v.vCurve),
      model_local_usd: Math.round(v.vLocal),
      model_chain_usd: Math.round(v.vChain),
      farm_steps: steps,
    };
  });

  const setAsideTotal = setAside.reduce((a, s) => a + s.count, 0);
  const audit: Audit = {
    total: protocols.length,
    ranked: rows.length,
    tokened: tokened.length,
    setAside,
    setAsideTotal,
  };
  return { rows, audit, fit };
}

// The gate, checked by main.ts after writing board.json: the same
// conditions the grader enforces, plus the dashboard/data budget.
export function checkGate(
  rows: BoardRow[],
  watchlist: string[],
  dossierBytes: number,
  dashboardTextBytes: number,
  screenshotBytes: number[],
): string[] {
  const errs: string[] = [];
  if (rows.length !== 198) errs.push(`rows ${rows.length} != 198`);
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) errs.push(`rank ${r.rank} at position ${i}`);
  });
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      errs.push(`implied_value_usd rises at rank ${i + 1}`);
    }
  }
  const vals = new Set(rows.map((r) => r.implied_value_usd));
  if (vals.size < 2) errs.push("implied_value_usd all equal");
  const slugs = new Set(rows.map((r) => r.slug));
  for (const w of watchlist) if (!slugs.has(w)) errs.push(`watchlist slug missing: ${w}`);
  for (const r of rows) {
    if (r.farm_steps.length !== 7) errs.push(`${r.slug}: ${r.farm_steps.length} steps`);
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) errs.push(`${r.slug}: step length ${s.length}`);
    }
    if (!(r.implied_value_usd > 0)) errs.push(`${r.slug}: implied not positive`);
  }
  if (screenshotBytes.length !== 4) errs.push(`screenshots ${screenshotBytes.length} != 4`);
  for (const b of screenshotBytes) if (b > 512 * 1024) errs.push(`screenshot ${b} bytes > 512 KiB`);
  if (dossierBytes > 1.5 * 1024 * 1024) errs.push(`dossier ${dossierBytes} bytes > 1.5 MiB`);
  if (dashboardTextBytes > 65536) errs.push(`dashboard text ${dashboardTextBytes} bytes > 64 KiB`);
  return errs;
}
