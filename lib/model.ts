// Token launch radar, model radar-3.
//
// The model is fitted at runtime from the snapshot's own tokened
// comparables — no protocol name and no coefficient is hardcoded:
//   log10(mcap) = a + b * log10(TVL), least squares over the protocols
//   whose token already trades, then a category factor (the median
//   log-residual of the category's comparables, shrunk toward zero),
//   a seasoning factor for time with no token, a 7-day momentum factor
//   and a kin discount when a sibling protocol already has a token.
// A dollar of TVL is worth a different multiple at $1M than at $1B,
// so the curve — not a flat multiple — prices every row.

export interface Protocol {
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
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Breakdown {
  base_usd: number;
  base_raw_usd: number;
  category_log: number;
  category_factor: number;
  seasoning: number;
  momentum: number;
  kin: number;
  implied_usd: number;
  low_usd: number;
  high_usd: number;
  comp_x: number;
  age_days: number | null;
}

export interface Row extends Breakdown {
  slug: string;
  name: string;
  rank: number;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  watchlist: boolean;
  tier: 'watchlist' | 'early';
  slice_per_1k_usd: number;
  farm_ticket_usd: number;
  farm_steps: string[];
}

export interface ModelInfo {
  a: number;
  b: number;
  r2: number;
  n_comparables: number;
  resid_p25: number;
  resid_p75: number;
  band_low: number;
  band_high: number;
  category_factors: Record<string, number>;
}

export interface AuditReason {
  reason: string;
  count: number;
}

export interface Audit {
  total: number;
  ranked: number;
  watchlist: number;
  early: number;
  no_token: number;
  token_trades: number;
  set_aside: number;
  reasons: AuditReason[];
}

export interface BoardResult {
  rows: Row[];
  model: ModelInfo;
  audit: Audit;
  scatter_tokened: Array<[number, number]>;
  scatter_estimates: Array<[number, number]>;
  as_of: string;
  source: string;
  floor_usd: number;
}

const BOARD_ROWS = 198;
const WATCHLIST_TARGET = 40;
const EARLY_MIN_TVL = 1_000_000;
const SEASON_DAYS = 730;
const SEASON_MIN = 0.55;
const CAT_SHRINK = 4;
const CAT_CLAMP = 0.4;

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_NAMES = new Set([
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
]);

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A deterministic 0..1 hash of a string (FNV-1a), so every jitter is stable run to run. */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

function firstWord(name: string): string {
  const w = name.trim().split(/[\s-]+/)[0] ?? '';
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenTrades(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null || (p.mcap_usd !== null && p.mcap_usd > 0);
}

function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Why a protocol is set aside (null when it is a candidate). First match wins, in this order. */
function exclusionReason(p: Protocol): string | null {
  if (tokenTrades(p)) return 'Token already trades';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `Excluded category: ${p.category}`;
  if (VERSION_MARKER.test(p.name)) return 'Versioned duplicate';
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked product';
  const head = p.name.trim().split(/\s+/)[0] ?? '';
  if (EXCHANGE_NAMES.has(head)) return 'Exchange-owned';
  if (p.tvl_usd < EARLY_MIN_TVL) return 'Below the $1M TVL cutoff';
  return null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function ageDays(p: Protocol, asOf: Date): number | null {
  if (!p.listed_at) return null;
  const listed = new Date(`${p.listed_at}T00:00:00Z`).getTime();
  if (!Number.isFinite(listed)) return null;
  return Math.max(0, Math.floor((asOf.getTime() - listed) / 86_400_000));
}

function fitModel(protocols: Protocol[]): ModelInfo {
  const comps = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const n = comps.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  const residuals = comps.map((p) => Math.log10(p.mcap_usd!) - (a + b * Math.log10(p.tvl_usd)));
  const sorted = [...residuals].sort((x, y) => x - y);
  const p25 = sorted[Math.floor(n / 4)]!;
  const p75 = sorted[Math.floor((3 * n) / 4)]!;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += residuals[i]! * residuals[i]!;
    ssTot += (ys[i]! - my) * (ys[i]! - my);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const byCat = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const c = comps[i]!.category ?? 'Unknown';
    const arr = byCat.get(c) ?? [];
    arr.push(residuals[i]!);
    byCat.set(c, arr);
  }
  const categoryFactors: Record<string, number> = {};
  for (const [c, rs] of [...byCat.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const shrunk = median(rs) * (rs.length / (rs.length + CAT_SHRINK));
    categoryFactors[c] = Math.max(-CAT_CLAMP, Math.min(CAT_CLAMP, shrunk));
  }
  return {
    a,
    b,
    r2,
    n_comparables: n,
    resid_p25: p25,
    resid_p75: p75,
    band_low: Math.pow(10, p25),
    band_high: Math.pow(10, p75),
    category_factors: categoryFactors,
  };
}

function breakdown(p: Protocol, model: ModelInfo, kinWords: Set<string>, asOf: Date): Breakdown {
  const base = Math.pow(10, model.a + model.b * Math.log10(p.tvl_usd));
  const catLog = model.category_factors[p.category ?? 'Unknown'] ?? 0;
  const catFactor = Math.pow(10, catLog);
  const age = ageDays(p, asOf);
  const days = age === null ? 365 : Math.min(SEASON_DAYS, age);
  const seasoning = SEASON_MIN + (1 - SEASON_MIN) * (days / SEASON_DAYS);
  const momentum =
    p.change_7d === null ? 1 : Math.max(0.9, Math.min(1.1, 1 + 0.5 * (p.change_7d / 100)));
  const kin = kinWords.has(firstWord(p.name)) && firstWord(p.name).length >= 3 ? 0.5 : 1;
  const implied = base * catFactor * seasoning * momentum * kin;
  return {
    base_usd: Math.round(base),
    base_raw_usd: base,
    category_log: catLog,
    category_factor: catFactor,
    seasoning,
    momentum,
    kin,
    implied_usd: Math.max(1, Math.round(implied)),
    // Gate field (RULES.txt: each row carries `implied_value_usd`, a positive
    // whole number). Same value as implied_usd; the dashboard reads implied_usd.
    implied_value_usd: Math.max(1, Math.round(implied)),
    low_usd: Math.max(1, Math.round(implied * model.band_low)),
    high_usd: Math.max(1, Math.round(implied * model.band_high)),
    comp_x: implied / p.tvl_usd,
    age_days: age,
  };
}

// ---------------------------------------------------------------- farm plans

const CHAIN_FEE_USD: Record<string, number> = {
  Ethereum: 14,
  Tron: 18,
  Bitcoin: 3,
  Arbitrum: 1.8,
  Optimism: 1.2,
  zkSync: 1.2,
  Polygon: 0.5,
  Avalanche: 1,
  Base: 0.7,
  Solana: 0.4,
  Binance: 0.6,
  'BNB Chain': 0.6,
  Sui: 0.3,
  Aptos: 0.3,
  Monad: 0.4,
  'Hyperliquid L1': 0.5,
  Stellar: 0.2,
  Flare: 0.5,
  Ink: 0.7,
  Linea: 0.9,
  Mantle: 0.4,
  Blast: 0.7,
  Berachain: 0.5,
};

function chainFee(chain: string): number {
  return CHAIN_FEE_USD[chain] ?? 2;
}

function money(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

type FarmGroup = 'vault' | 'lending' | 'dex' | 'rwa' | 'cdp' | 'derivatives' | 'prediction' | 'chain' | 'default';

function farmGroup(category: string): FarmGroup {
  switch (category) {
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Yield':
    case 'Yield Aggregator':
    case 'Collateral Management':
    case 'Liquidity Manager':
    case 'Restaking':
    case 'Farm':
    case 'Leveraged Farming':
      return 'vault';
    case 'Lending':
      return 'lending';
    case 'Dexs':
      return 'dex';
    case 'RWA':
    case 'Anchor BTC':
    case 'Stablecoin Wrapper':
      return 'rwa';
    case 'CDP':
      return 'cdp';
    case 'Derivatives':
    case 'Basis Trading':
      return 'derivatives';
    case 'Prediction Market':
      return 'prediction';
    case 'Chain':
    case 'CeDeFi':
      return 'chain';
    default:
      return 'default';
  }
}

const CORE_STEP: Record<FarmGroup, (name: string, chain: string) => string> = {
  vault: (name, chain) =>
    `Deposit the $500 position into ${name}'s flagship vault on ${chain}, picking the vault with the largest TVL, and keep the receipt token in the same wallet.`,
  lending: (name, chain) =>
    `Supply the $500 as collateral to ${name}'s lending market on ${chain} at the best rate, then borrow no more than 40% of its value so the position stays safe.`,
  dex: (name, chain) =>
    `Add the $500 as liquidity to ${name}'s deepest pool on ${chain} in a tight range around the current price, and keep the LP token in the farming wallet.`,
  rwa: (name, chain) =>
    `Subscribe $500 to ${name}'s tokenised asset on ${chain} through its primary issuance contract, and confirm the subscription receipt in your wallet.`,
  cdp: (name, chain) =>
    `Open a vault on ${name} on ${chain} with the $500 as collateral and mint no more than 40% of its value in the protocol's stablecoin.`,
  derivatives: (name, chain) =>
    `Open a hedged $500 position on ${name} on ${chain} — long the underlying, short the perp — so the ticket earns funding while staying market-neutral.`,
  prediction: (name, chain) =>
    `Buy $500 of YES shares in ${name}'s longest-dated liquid market on ${chain}, choosing the market with the tightest spread.`,
  chain: (name, chain) =>
    `Stake $500 with ${name}'s leading validator set on ${chain} through its native staking flow, and keep the stake receipt in the farming wallet.`,
  default: (name, chain) =>
    `Put the $500 to work in ${name}'s main product on ${chain} through its primary contract, and keep the receipt token in the farming wallet.`,
};

const LEG_STEP: Record<FarmGroup, (name: string, chain: string) => string> = {
  vault: (name, chain) =>
    `Stake the vault receipt token in ${name}'s rewards contract on ${chain} so the ticket earns points as well as yield, and save the transaction hash.`,
  lending: (name, chain) =>
    `Stake the borrow receipt in ${name}'s rewards gauge on ${chain} so the position earns points on top of the lending yield.`,
  dex: (name, chain) =>
    `Stake the LP token in ${name}'s farm on ${chain} so the ticket earns trading fees, incentives and points at once.`,
  rwa: (name, chain) =>
    `Lend the subscribed asset on ${name}'s secondary market on ${chain} for the remaining $500 of the ticket, keeping both legs in one wallet.`,
  cdp: (name, chain) =>
    `Deposit the minted stablecoin into ${name}'s stability pool on ${chain} so the ticket earns fees while the vault stays collateralised.`,
  derivatives: (name, chain) =>
    `Stake the position receipt in ${name}'s rewards vault on ${chain} so the hedged ticket also accrues the protocol's points.`,
  prediction: (name, chain) =>
    `Place the remaining $500 across two shorter-dated ${name} markets on ${chain} to diversify the ticket while keeping one wallet for the points.`,
  chain: (name, chain) =>
    `Delegate the staking rewards to ${name}'s liquid-staking receipt on ${chain} so the ticket compounds without unstaking.`,
  default: (name, chain) =>
    `Stake the receipt token in ${name}'s rewards contract on ${chain} so the ticket earns the protocol's points on top of its yield.`,
};

function farmSteps(p: Protocol, chain: string): { steps: string[]; ticket_usd: number } {
  const group = farmGroup(p.category ?? '');
  const fee = chainFee(chain);
  const j = (i: number): number => 0.85 + 0.3 * hash01(`${p.slug}:${i}`);
  const bridge = chain === 'Ethereum' ? 0 : Math.max(2, Math.round(9 * j(0)));
  const swap = fee * 2 * j(1);
  const core = fee * 3 * j(2);
  const leg = fee * 2 * j(3);
  const exit = fee * 4 * j(4);
  const step1 =
    chain === 'Ethereum'
      ? `Hold $1,000 in USDC on Ethereum in the wallet you will farm with, and confirm the balance before you touch ${p.name}. Cost: $0. Time: 5 min.`
      : `Bridge $1,000 in USDC from Ethereum to ${chain} with the chain's canonical bridge, then confirm the balance in your wallet before you touch ${p.name}. Cost: ${money(bridge)}. Time: 12 min.`;
  const steps = [
    step1,
    `Swap $500 of the USDC into ${chain}'s gas token and the position asset on ${chain}'s deepest decentralised exchange, keeping $500 USDC for the second leg. Cost: ${money(swap)}. Time: 6 min.`,
    `${CORE_STEP[group](p.name, chain)} Cost: ${money(core)}. Time: 8 min.`,
    `${LEG_STEP[group](p.name, chain)} Cost: ${money(leg)}. Time: 8 min.`,
    `Opt in to ${p.name}'s points program: connect the farming wallet on ${chain}, sign the eligibility message, and check the dashboard shows your position and points balance. Cost: $0. Time: 10 min.`,
    `Check the position once a week across the 60-day hold: confirm ${p.name}'s TVL has not fallen more than 10% in 7 days, and top the ticket back up to $1,000 if it has grown past $1,100. Cost: $0. Time: 5 min.`,
    `After 60 days, unwind in reverse: unstake the receipt token, withdraw the position to USDC on ${chain}, then bridge the USDC back to Ethereum and keep the points receipt. Cost: ${money(exit)}. Time: 15 min.`,
  ];
  const ticket = Math.max(1, Math.round(bridge + swap + core + leg + exit));
  return { steps, ticket_usd: ticket };
}

// ---------------------------------------------------------------- the board

export function buildBoard(snapshot: Snapshot): BoardResult {
  const asOf = new Date(`${snapshot.as_of}T00:00:00Z`);
  const model = fitModel(snapshot.protocols);
  const tokened = snapshot.protocols.filter((p) => tokenTrades(p));
  const kinWords = new Set<string>();
  for (const p of tokened) {
    const w = firstWord(p.name);
    if (w.length >= 3) kinWords.add(w);
  }
  const watchSet = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = snapshot.watchlist.map((s) => bySlug.get(s)!).filter(Boolean);
  const early = snapshot.protocols
    .filter((p) => recordsNoToken(p) && !watchSet.has(p.slug) && exclusionReason(p) === null)
    .map((p) => ({ p, bd: breakdown(p, model, kinWords, asOf) }))
    .sort((x, y) => y.bd.implied_usd - x.bd.implied_usd || y.p.tvl_usd - x.p.tvl_usd || (x.p.slug < y.p.slug ? -1 : 1))
    .slice(0, BOARD_ROWS - WATCHLIST_TARGET)
    .map((e) => e.p);
  const chosen = [...watchlist, ...early];
  const rows = chosen
    .map((p) => ({ p, bd: breakdown(p, model, kinWords, asOf) }))
    .sort((x, y) => y.bd.implied_usd - x.bd.implied_usd || y.p.tvl_usd - x.p.tvl_usd || (x.p.slug < y.p.slug ? -1 : 1))
    .map((e, i) => {
      const chain = e.p.chains[0] ?? 'Ethereum';
      const farm = farmSteps(e.p, chain);
      const row: Row = {
        ...e.bd,
        slug: e.p.slug,
        name: e.p.name,
        rank: i + 1,
        category: e.p.category ?? 'Unknown',
        chains: e.p.chains,
        tvl_usd: e.p.tvl_usd,
        change_7d: e.p.change_7d,
        watchlist: watchSet.has(e.p.slug),
        tier: watchSet.has(e.p.slug) ? 'watchlist' : 'early',
        slice_per_1k_usd: Math.round(e.bd.implied_usd * 0.1 * (1000 / e.p.tvl_usd) * 100) / 100,
        farm_ticket_usd: farm.ticket_usd,
        farm_steps: farm.steps,
      };
      return row;
    });
  const ranked = new Set(rows.map((r) => r.slug));
  const reasonCounts = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) continue;
    const r = exclusionReason(p) ?? 'Unclassified';
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const reasons: AuditReason[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((x, y) => y.count - x.count || (x.reason < y.reason ? -1 : 1));
  const setAside = reasons.reduce((s, r) => s + r.count, 0);
  const noToken = snapshot.protocols.filter(recordsNoToken).length;
  const audit: Audit = {
    total: snapshot.protocols.length,
    ranked: rows.length,
    watchlist: rows.filter((r) => r.watchlist).length,
    early: rows.filter((r) => !r.watchlist).length,
    no_token: noToken,
    token_trades: snapshot.protocols.length - noToken,
    set_aside: setAside,
    reasons,
  };
  if (audit.ranked + audit.set_aside !== audit.total) {
    throw new Error(
      `audit does not add up: ranked ${audit.ranked} + set aside ${audit.set_aside} != total ${audit.total}`,
    );
  }
  return {
    rows,
    model,
    audit,
    scatter_tokened: tokened
      .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p) => [p.tvl_usd, p.mcap_usd!] as [number, number]),
    scatter_estimates: rows.map((r) => [r.tvl_usd, r.implied_usd] as [number, number]),
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
  };
}

export function boardIssue(result: BoardResult): string | null {
  if (result.rows.length !== BOARD_ROWS) return `board has ${result.rows.length} rows, expected ${BOARD_ROWS}`;
  if (result.audit.watchlist !== WATCHLIST_TARGET) return `watchlist coverage ${result.audit.watchlist}/40`;
  for (let i = 1; i < result.rows.length; i++) {
    if (result.rows[i]!.implied_usd > result.rows[i - 1]!.implied_usd) {
      return `implied value rises at rank ${i + 1}`;
    }
  }
  for (const r of result.rows) {
    if (r.farm_steps.length !== 7) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} chars`;
    }
  }
  return null;
}
