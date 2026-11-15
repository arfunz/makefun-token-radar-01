// radar-4 model: everything is fitted at runtime from the snapshot's own
// tokened comparables. No protocol name and no coefficient is hardcoded:
// the curve, the category calibration, the chain model and the local-comps
// multiple are all computed from /input/snapshot.json on every run.

export type Protocol = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
};

export type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
};

export const AS_OF = "2026-11-14";

export function log10(x: number): number {
  return Math.log10(x);
}

// Linear-interpolation quantile, matching the usual definition: position
// q*(n-1) between the two nearest order statistics.
export function quant(sortedAsc: number[], q: number): number {
  const v = sortedAsc;
  const n = v.length;
  if (n === 0) throw new Error("quant of empty array");
  if (n === 1) return v[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  const f = pos - lo;
  return v[lo] * (1 - f) + v[hi] * f;
}

export function median(vals: number[]): number {
  return quant([...vals].sort((a, b) => a - b), 0.5);
}

export function ols(xs: number[], ys: number[]): { inter: number; slope: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxy / sxx;
  const inter = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - my) * (ys[i] - my);
    const r = ys[i] - (inter + slope * xs[i]);
    ssRes += r * r;
  }
  return { inter, slope, r2: 1 - ssRes / ssTot };
}

// Two-regressor OLS (intercept + log TVL + log chain count) via 3x3
// Gaussian elimination on the normal equations.
export function ols2(xs0: number[], xs1: number[], ys: number[]): [number, number, number] {
  const n = xs0.length;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) A.push([1, xs0[i], xs1[i]]);
  const M: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const v = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += A[i][r] * A[i][c];
      M[r][c] = s;
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += A[i][r] * ys[i];
    v[r] = s;
  }
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    const tmpRow = M[c];
    M[c] = M[piv];
    M[piv] = tmpRow;
    const tmpV = v[c];
    v[c] = v[piv];
    v[piv] = tmpV;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = 0; k < 3; k++) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  return [v[0] / M[0][0], v[1] / M[1][1], v[2] / M[2][2]];
}

// change_7d is in per cent (RULES.txt). Normalise defensively to a
// fraction and clamp: a +4448% week is a data quirk, not momentum.
export function normChange(v: number | null): number {
  if (v === null || v === undefined) return 0;
  return Math.max(-0.5, Math.min(0.5, v / 100));
}

export function ageDays(p: Protocol): number {
  if (!p.listed_at) return 365;
  const [y, m, d] = p.listed_at.split("-").map(Number);
  const listed = Date.UTC(y, m - 1, d);
  const asOf = Date.UTC(2026, 10, 14);
  return Math.max(0, Math.floor((asOf - listed) / 86400000));
}

export function seasoning(p: Protocol): number {
  return 0.55 + 0.45 * Math.min(1, ageDays(p) / 730);
}

export function momentum(p: Protocol): number {
  return Math.max(0.9, Math.min(1.1, 1 + 0.5 * normChange(p.change_7d)));
}

export function usableComps(protocols: Protocol[]): Protocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
}

// A protocol's "family stem": lowercase alphanumeric name with a trailing
// version marker stripped. Two protocols share a stem when one's stem
// contains the other's (a versioned or extended product of the same family).
export function stem(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\s+(v\d+(\.\d+)?|2\.0|3\.0|classic|one|two)\s*$/, "");
  return n.replace(/[^a-z0-9]+/g, "");
}

export function buildKinSet(protocols: Protocol[]): (p: Protocol) => boolean {
  const tokStems = protocols
    .filter((p) => p.gecko_id !== null || p.symbol !== null)
    .map((p) => stem(p.name));
  return (p: Protocol): boolean => {
    const st = stem(p.name);
    for (const ts of tokStems) {
      if (ts.length >= 5 && ts !== st && (ts.includes(st) || st.includes(ts))) return true;
    }
    return false;
  };
}

export type Fit = {
  comps: Protocol[];
  inter: number;
  slope: number;
  r2: number;
  residuals: number[];
  globalLo: number;
  globalHi: number;
  catAdj: Map<string, number>;
  catBand: Map<string, { lo: number; hi: number; n: number }>;
  chainCoef: [number, number, number];
  globalMedianMult: number;
  loo: { miss: number; within3: number; within10: number };
  flatLoo: { miss: number; within3: number; within10: number };
  timeSplit: {
    curveMiss: number;
    curveWithin3: number;
    flatMiss: number;
    flatWithin3: number;
    nTrain: number;
    nTest: number;
  };
  catCalibration: { cat: string; n: number; looMiss: number; bandLo: number; bandHi: number; adj: number }[];
};

function residualsOf(comps: Protocol[], inter: number, slope: number): number[] {
  return comps.map((p) => log10(p.mcap_usd as number) - (inter + slope * log10(p.tvl_usd)));
}

function categoryAdjustment(
  residualsByCat: Map<string, number[]>,
  cat: string | null,
): number {
  if (cat === null) return 0;
  const rs = residualsByCat.get(cat);
  if (!rs || rs.length < 6) return 0;
  const med = median(rs);
  const adj = (med * rs.length) / (rs.length + 20);
  return Math.max(-0.4, Math.min(0.4, adj));
}

export function fitModel(protocols: Protocol[]): Fit {
  const comps = usableComps(protocols);
  const xs = comps.map((p) => log10(p.tvl_usd));
  const ys = comps.map((p) => log10(p.mcap_usd as number));
  const { inter, slope, r2 } = ols(xs, ys);
  const residuals = residualsOf(comps, inter, slope);
  const sortedRes = [...residuals].sort((a, b) => a - b);
  const globalLo = quant(sortedRes, 0.25);
  const globalHi = quant(sortedRes, 0.75);

  const residualsByCat = new Map<string, number[]>();
  comps.forEach((p, i) => {
    const cat = p.category ?? "";
    const arr = residualsByCat.get(cat) ?? [];
    arr.push(residuals[i]);
    residualsByCat.set(cat, arr);
  });

  const catAdj = new Map<string, number>();
  const catBand = new Map<string, { lo: number; hi: number; n: number }>();
  for (const [cat, rs] of residualsByCat) {
    catAdj.set(cat, categoryAdjustment(residualsByCat, cat));
    if (rs.length >= 6) {
      const med = median(rs);
      const dev = rs.map((r) => r - med).sort((a, b) => a - b);
      catBand.set(cat, { lo: quant(dev, 0.25), hi: quant(dev, 0.75), n: rs.length });
    } else {
      catBand.set(cat, { lo: globalLo, hi: globalHi, n: rs.length });
    }
  }

  const chainCoef = ols2(
    xs,
    comps.map((p) => log10(p.chains.length)),
    ys,
  );
  const globalMedianMult = median(comps.map((p) => (p.mcap_usd as number) / p.tvl_usd));

  // Leave-one-out backtest of the curve + category adjustment, and of a
  // single flat mcap/TVL multiple, over the same comps.
  const looErrs: number[] = [];
  const flatErrs: number[] = [];
  const catLooErrs = new Map<string, number[]>();
  for (let i = 0; i < comps.length; i++) {
    const p = comps[i];
    const others = comps.filter((_, j) => j !== i);
    const o = ols(
      others.map((q) => log10(q.tvl_usd)),
      others.map((q) => log10(q.mcap_usd as number)),
    );
    const oRes = residualsOf(others, o.inter, o.slope);
    const oByCat = new Map<string, number[]>();
    others.forEach((q, k) => {
      const arr = oByCat.get(q.category ?? "") ?? [];
      arr.push(oRes[k]);
      oByCat.set(q.category ?? "", arr);
    });
    const adj = categoryAdjustment(oByCat, p.category);
    const pred = o.inter + o.slope * log10(p.tvl_usd) + adj;
    const err = Math.abs(log10(p.mcap_usd as number) - pred);
    looErrs.push(err);
    const catArr = catLooErrs.get(p.category ?? "") ?? [];
    catArr.push(err);
    catLooErrs.set(p.category ?? "", catArr);
    const flatMed = median(others.map((q) => (q.mcap_usd as number) / q.tvl_usd));
    flatErrs.push(Math.abs(log10(p.mcap_usd as number) - log10(p.tvl_usd * flatMed)));
  }
  const looMiss = 10 ** median(looErrs);
  const loo: Fit["loo"] = {
    miss: looMiss,
    within3: looErrs.filter((e) => e < log10(3)).length / looErrs.length,
    within10: looErrs.filter((e) => e < 1).length / looErrs.length,
  };
  const flatLoo: Fit["flatLoo"] = {
    miss: 10 ** median(flatErrs),
    within3: flatErrs.filter((e) => e < log10(3)).length / flatErrs.length,
    within10: flatErrs.filter((e) => e < 1).length / flatErrs.length,
  };

  // Time split: fit on tokens listed before 2024, test on 2024 and later.
  const pre = comps.filter((p) => p.listed_at && p.listed_at < "2024-01-01");
  const post = comps.filter((p) => p.listed_at && p.listed_at >= "2024-01-01");
  const t = ols(
    pre.map((p) => log10(p.tvl_usd)),
    pre.map((p) => log10(p.mcap_usd as number)),
  );
  const flatPre = median(pre.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const tErrs = post.map((p) =>
    Math.abs(log10(p.mcap_usd as number) - (t.inter + t.slope * log10(p.tvl_usd))),
  );
  const tFlatErrs = post.map((p) =>
    Math.abs(log10(p.mcap_usd as number) - log10(p.tvl_usd * flatPre)),
  );
  const timeSplit: Fit["timeSplit"] = {
    curveMiss: 10 ** median(tErrs),
    curveWithin3: tErrs.filter((e) => e < log10(3)).length / tErrs.length,
    flatMiss: 10 ** median(tFlatErrs),
    flatWithin3: tFlatErrs.filter((e) => e < log10(3)).length / tFlatErrs.length,
    nTrain: pre.length,
    nTest: post.length,
  };

  const catCalibration: Fit["catCalibration"] = [];
  for (const [cat, errs] of catLooErrs) {
    if (errs.length < 6) continue;
    const band = catBand.get(cat) as { lo: number; hi: number; n: number };
    catCalibration.push({
      cat,
      n: errs.length,
      looMiss: 10 ** median(errs),
      bandLo: 10 ** band.lo,
      bandHi: 10 ** band.hi,
      adj: catAdj.get(cat) ?? 0,
    });
  }
  catCalibration.sort((a, b) => a.looMiss - b.looMiss);

  return {
    comps,
    inter,
    slope,
    r2,
    residuals,
    globalLo,
    globalHi,
    catAdj,
    catBand,
    chainCoef,
    globalMedianMult,
    loo,
    flatLoo,
    timeSplit,
    catCalibration,
  };
}

// Local-comps multiple: the median mcap/TVL of comparables whose TVL sits
// within 10x of the protocol's, same category first, then any category,
// then the global median. A genuinely local view, independent of the curve.
export function localMultiple(fit: Fit, cat: string | null, tvl: number): number {
  const inBand = (q: Protocol): boolean => q.tvl_usd >= tvl / 10 && q.tvl_usd <= tvl * 10;
  const catBand = fit.comps.filter((q) => q.category === cat && inBand(q));
  if (catBand.length >= 3) {
    return median(catBand.map((q) => (q.mcap_usd as number) / q.tvl_usd));
  }
  const anyBand = fit.comps.filter(inBand);
  if (anyBand.length >= 3) {
    return median(anyBand.map((q) => (q.mcap_usd as number) / q.tvl_usd));
  }
  return fit.globalMedianMult;
}

export type Valued = {
  value: number;
  low: number;
  high: number;
  vCurve: number;
  vLocal: number;
  vChain: number;
  spread: number;
  contested: boolean;
  isKin: boolean;
  season: number;
  mom: number;
};

// The ensemble: three independent pricings of the same protocol, combined
// by their lower quartile (conservative), then seasoned, momentum-adjusted
// and kin-discounted. The band is the protocol's category band.
export function valueProtocol(fit: Fit, isKin: (p: Protocol) => boolean, p: Protocol): Valued {
  const lt = log10(p.tvl_usd);
  const adj = fit.catAdj.get(p.category ?? "") ?? 0;
  const vCurve = 10 ** (fit.inter + fit.slope * lt + adj);
  const vLocal = p.tvl_usd * localMultiple(fit, p.category, p.tvl_usd);
  const [c0, c1, c2] = fit.chainCoef;
  const vChain = 10 ** (c0 + c1 * lt + c2 * log10(p.chains.length));
  const trio = [vCurve, vLocal, vChain].sort((a, b) => a - b);
  const q1 = trio[0] + 0.5 * (trio[1] - trio[0]);
  const kin = isKin(p);
  const season = seasoning(p);
  const mom = momentum(p);
  const value = q1 * season * mom * (kin ? 0.5 : 1);
  const band = fit.catBand.get(p.category ?? "") ?? { lo: fit.globalLo, hi: fit.globalHi, n: 0 };
  const spread = trio[2] / trio[0];
  return {
    value,
    low: value * 10 ** band.lo,
    high: value * 10 ** band.hi,
    vCurve,
    vLocal,
    vChain,
    spread,
    contested: spread > 3,
    isKin: kin,
    season,
    mom,
  };
}

export function ageLabel(p: Protocol): string {
  const d = ageDays(p);
  if (!p.listed_at) return "—";
  if (d >= 365) return `${(d / 365).toFixed(1)}y`;
  if (d >= 30) return `${Math.round(d / 30)}mo`;
  return `${d}d`;
}
