// radar-2: the token launch radar's value model.
//
// A protocol that records no token is scored by an implied value built only from
// the snapshot's own figures: its TVL, the market-cap-to-TVL ratio its live-token
// peers in the same category actually trade at, how its TVL moved in the last
// seven days, and how long it has run with no token. Nothing here names a
// protocol, and no multiple is written in by hand: every multiple is the median
// of the snapshot's own live-token peers, computed at run time.

export interface SnapshotProtocol {
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
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelDetail {
  category_multiple: number;
  peers: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
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
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelDetail;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  multiples: CategoryMultiple[];
  global_multiple: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** The constants of the radar-2 model, kept in one place so the page can show them. */
export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  min_peers: 3,
};

export const MODEL_VERSION = 'radar-2';

/** A protocol records no token when the snapshot carries no market cap, no Gecko id and no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The middle value, or the mean of the two middle values, of a sorted list. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** Four decimals, the rounding the board carries for its multipliers. */
export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Whole days between a YYYY-MM-DD listing date and the snapshot date, null when unlisted. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const [y, m, d] = listedAt.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  const listed = Date.UTC(y!, m! - 1, d!);
  const as = Date.UTC(ay!, am! - 1, ad!);
  // A listing after the snapshot cannot age backwards: clamp at zero.
  return Math.max(0, Math.floor((as - listed) / 86400000));
}

export interface Multiples {
  /** category -> {multiple, peers}, only categories with at least min_peers live peers. */
  byCategory: Map<string, CategoryMultiple>;
  /** The global median over every live-token protocol's ratio, clamped. */
  global: number;
  /** Every category multiple, highest first, ties by category name. */
  table: CategoryMultiple[];
}

/**
 * The market-cap-to-TVL multiples, from the snapshot's own live-token protocols.
 * A category's multiple is the median ratio of its live peers; a category with
 * fewer than three peers has none, and the board falls back to the global median.
 */
export function categoryMultiples(protocols: SnapshotProtocol[]): Multiples {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? '';
    const list = byCategory.get(key);
    if (list) list.push(ratio);
    else byCategory.set(key, [ratio]);
  }
  const global = clamp(median(all), MODEL.multiple_floor, MODEL.multiple_cap);
  const map = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of byCategory) {
    if (ratios.length < MODEL.min_peers) continue;
    map.set(category, {
      category,
      multiple: clamp(median(ratios), MODEL.multiple_floor, MODEL.multiple_cap),
      peers: ratios.length,
    });
  }
  const table = [...map.values()].sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { byCategory: map, global, table };
}

/** The implied value of one protocol, and the model that produced it. */
export function scoreProtocol(
  p: SnapshotProtocol,
  multiples: Multiples,
  asOf: string,
): { implied: number; detail: ModelDetail } {
  const cat = multiples.byCategory.get(p.category ?? '');
  const multiple = cat ? cat.multiple : multiples.global;
  const peers = cat ? cat.peers : 0;
  const growthPct = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  // The implied value multiplies the raw multipliers; the board only rounds
  // them for display, so a rounded multiplier must never feed the product.
  const growthMultiplier = 1 + (growthPct / 100) * MODEL.growth_weight;
  const age = ageDays(p.listed_at, asOf);
  const maturityMultiplier =
    MODEL.maturity_floor + (Math.min(age ?? MODEL.unknown_age_days, MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMultiplier * maturityMultiplier));
  return {
    implied,
    detail: {
      category_multiple: multiple,
      peers,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMultiplier),
      maturity_multiplier: round4(maturityMultiplier),
      age_days: age,
    },
  };
}

// ---------------------------------------------------------------- farm plans

/** The capital a farm plan asks for, by the size of the protocol. */
export function farmCapital(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** The gas a plan's set-up step asks for: more capital, more set-up. */
export function farmSetupGas(capital: number): number {
  return capital >= 150 ? 8 : 4;
}

/** How long a position is held, by how long the protocol has run with no token. */
export function farmHoldDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The two qualifying actions for a protocol, by its category. The first match
 * wins; a category that matches nothing gets the generic pair. The actions name
 * what to do, never a slogan.
 */
export function actionsFor(p: SnapshotProtocol, capital: number): [string, string] {
  const name = p.name;
  const chain = p.chains[0] ?? 'its main chain';
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return [
      `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      'Borrow $20 of USDC against the supply, then repay it the same week so the wallet shows both sides of the market.',
    ];
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return [
      `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      `Swap $25 through ${name} on ${chain} once a week, in and out of the pool's pair.`,
    ];
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) {
    return [
      `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      "Claim the vault's yield once, then redeposit it so the wallet shows a full deposit-claim cycle.",
    ];
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return [
      `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
      `Bridge $25 back through ${name} a week later, so the wallet shows two-way volume.`,
    ];
  }
  if (c.includes('staking') || c.includes('restak')) {
    return [
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      `Use the receipt token once in a ${chain} lending market, then bring it back to ${name}.`,
    ];
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return [
      `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
      `Close the hedge and open a fresh one the next week, keeping the margin on ${name} throughout.`,
    ];
  }
  if (c.includes('prediction')) {
    return [
      `Fund $${capital} and place one market position on ${name}.`,
      'Settle one position and open another the following week, on a market that closes soon.',
    ];
  }
  if (c.includes('stable')) {
    return [
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      `Hold the stable asset in a ${chain} wallet for a full week, then use it to pay for one on-chain action.`,
    ];
  }
  if (c.includes('rwa')) {
    return [
      `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
      "Claim the asset's yield once, then hold the claim in the same wallet.",
    ];
  }
  if (c.includes('insurance')) {
    return [
      `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
      'Renew or extend the cover once before it lapses, so the wallet shows a repeat customer.',
    ];
  }
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Make one more qualifying action on ${name} the following week, such as a swap, a vote or a second deposit.`,
  ];
}

function step(text: string, cost: string, time: string): string {
  // The kit's stepText: a step is its action, then its cost and time, inside
  // the gate's 20..600 characters; a short step is padded, a long one cut.
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The seven-step farm plan for one protocol: what to do, what it costs, how long it takes. */
export function farmPlan(p: SnapshotProtocol, age: number | null): string[] {
  const capital = farmCapital(p.tvl_usd);
  const gas = farmSetupGas(capital);
  const hold = farmHoldDays(age);
  const [first, second] = actionsFor(p, capital);
  return [
    step('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
    step(first, `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
    step(second, 'about $2 of gas', '10 minutes'),
    step('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'),
    step(`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the $${capital} stays in the position`, `${hold} days`),
    step(`Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`, 'no fee to check, and never pay to claim', '10 minutes'),
    step('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes'),
  ];
}

/** What running a farm plan costs in total: the capital, held, plus the gas. */
export function farmTotal(p: SnapshotProtocol): { capital: number; setupGas: number; oneOffGas: number } {
  const capital = farmCapital(p.tvl_usd);
  const setupGas = farmSetupGas(capital);
  return { capital, setupGas, oneOffGas: 3 + setupGas + 2 };
}

// ---------------------------------------------------------------- the board

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A protocol the board may rank: pre-token, not a centralised exchange, not a versioned copy. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

/**
 * The watchlist's own exclusion, for early rows at or above the floor: a wrapped,
 * staked or bridged product of a token that already trades is not a launch to
 * watch, and neither is an exchange's own product or a versioned copy.
 */
export function passesWatchlistExclusion(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  return true;
}

export interface Board {
  rows: BoardRow[];
  watchlistSize: number;
  earlySize: number;
  liveSize: number;
  multiples: Multiples;
  live: LiveRow[];
}

/**
 * The board: every watchlist protocol, then every other rankable pre-token
 * protocol the floor leaves out. The watchlist is the floor, never the ceiling.
 */
export function buildBoard(snapshot: Snapshot): Board {
  const multiples = categoryMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const onWatchlist = watchlist.has(p.slug);
    if (!onWatchlist) {
      if (!isRankable(p)) continue;
      if (p.tvl_usd >= snapshot.floor_usd && !passesWatchlistExclusion(p)) continue;
    }
    const { implied, detail } = scoreProtocol(p, multiples, snapshot.as_of);
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: detail.age_days,
      implied_value_usd: implied,
      model: detail,
      farm_steps: farmPlan(p, detail.age_days),
    });
  }
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });
  const earlySize = scored.filter((r) => !watchlist.has(r.slug)).length;
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
  return {
    rows: scored,
    watchlistSize: snapshot.watchlist.length,
    earlySize,
    liveSize: live.length,
    multiples,
    live,
  };
}

/** The board's gate, as the scorer states it: null when the board is valid. */
export function boardIssue(rows: BoardRow[], watchlist: string[]): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board has ${rows.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  for (const r of rows) {
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
  }
  for (const slug of watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank}, expected ${i + 1}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `row ${r.slug} has an implied value that is not a positive whole number`;
    if (i > 0 && rows[i - 1]!.implied_value_usd < r.implied_value_usd) return 'implied value rises as rank ascends';
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} has ${r.farm_steps.length} farm steps, outside 3-12`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `row ${r.slug} has a farm step outside 20-600 characters`;
    }
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'every implied value is the same';
  return null;
}

/** The compact data the dashboard reads: one row per board entry, plus the live list. */
export function radarData(snapshot: Snapshot, board: Board): RadarData {
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: board.watchlistSize,
    board_size: board.rows.length,
    early_size: board.earlySize,
    live_size: board.liveSize,
    multiples: board.multiples.table,
    global_multiple: round4(board.multiples.global),
    watchlist: snapshot.watchlist,
    rows: board.rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
    })),
    live: board.live,
  };
}
