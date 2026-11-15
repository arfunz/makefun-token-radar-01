// Farm economics: fee and play tables, the verdict maths, and the seven
// farm-step templates. A step is rendered from the same template list for
// board.json and for the dashboard dialog, so the two can never drift.

export const TICKET_USD = 1000;
export const HOLD_DAYS = 60;
export const TBILL_USD = (TICKET_USD * 0.04 * HOLD_DAYS) / 365; // $6.58
export const AIRDROP_SHARE = 0.1;

export const CHAIN_FEES: Record<string, number> = {
  Ethereum: 4.0,
  Base: 0.9,
  Arbitrum: 0.8,
  Optimism: 0.8,
  Polygon: 0.4,
  Solana: 0.25,
  "BNB Chain": 1.2,
  Binance: 1.2,
  Avalanche: 0.8,
  Ink: 2.5,
  Tron: 1.5,
};

export type Play = {
  play: string;
  asset: string;
  action: string;
  playFee: number;
  hours: number;
};

export const PLAYS: Play[] = [
  { play: "Vault deposit", asset: "stablecoins", action: "check the curator's allocation", playFee: 1.0, hours: 2.5 },
  { play: "Liquidity pool", asset: "the pool's two assets", action: "collect fees and rebalance the range", playFee: 2.0, hours: 3.5 },
  { play: "Supply & borrow", asset: "stablecoins", action: "check borrow health and rates", playFee: 1.5, hours: 2.0 },
  { play: "Trade & volume", asset: "margin collateral", action: "place and manage positions", playFee: 2.5, hours: 5.0 },
  { play: "Delta-neutral deposit", asset: "stablecoins", action: "check the funding rate", playFee: 2.0, hours: 3.0 },
  { play: "Restake", asset: "liquid staking tokens", action: "check restaking rewards", playFee: 1.0, hours: 2.0 },
  { play: "Deposit & use", asset: "stablecoins", action: "use the protocol weekly", playFee: 1.5, hours: 3.0 },
];

export function playForCategory(cat: string | null): Play {
  switch (cat) {
    case "Risk Curators":
    case "Yield":
    case "RWA":
      return PLAYS[0];
    case "Dexes":
      return PLAYS[1];
    case "Lending":
    case "CDP":
      return PLAYS[2];
    case "Prediction Market":
    case "Derivatives":
      return PLAYS[3];
    case "Basis Trading":
      return PLAYS[4];
    case "Restaking":
      return PLAYS[5];
    default:
      return PLAYS[6];
  }
}

export function chainFee(chain: string | null): number {
  if (chain === null || chain === undefined) return 1.5;
  return CHAIN_FEES[chain] ?? 1.5;
}

export type Verdict = "ROBUST" | "FARM" | "THIN" | "SKIP";

export type Farm = {
  slice: number;
  fees: number;
  net: number;
  netLow: number;
  breakEven: number;
  perHour: number;
  verdict: Verdict;
  play: Play;
  feeTotal: number;
};

export function farmEconomics(
  impliedValue: number,
  bandLow: number,
  tvl: number,
  chain: string | null,
  cat: string | null,
): Farm {
  const play = playForCategory(cat);
  const fees = chainFee(chain) + play.playFee;
  const slice = (AIRDROP_SHARE * impliedValue * TICKET_USD) / tvl;
  const lowSlice = (AIRDROP_SHARE * bandLow * TICKET_USD) / tvl;
  const net = slice - fees - TBILL_USD;
  const netLow = lowSlice - fees - TBILL_USD;
  const breakEven = ((fees + TBILL_USD) * tvl) / 100;
  let verdict: Verdict;
  if (netLow > 0) verdict = "ROBUST";
  else if (net > 0) verdict = "FARM";
  else if (slice > fees) verdict = "THIN";
  else verdict = "SKIP";
  return {
    slice,
    fees,
    net,
    netLow,
    breakEven,
    perHour: net / play.hours,
    verdict,
    play,
    feeTotal: fees,
  };
}

export function money(x: number): string {
  return `$${x.toFixed(2)}`;
}

// Seven concrete farm steps. Slots: {name} {chain} {play} {asset} {action}
// {fee} {tbill} {hours} {hold}. The last step carries the cost and time.
export const STEP_TEMPLATES: string[] = [
  "Open {name} on {chain} and connect the wallet you farm with; check the pool or vault accepts new deposits before you move any funds.",
  "Deposit $1,000 of {asset} into the {play} position on {chain}; confirm the deposit receipt and your share of the pool before you leave the page.",
  "Do the weekly action the position needs: {action}. Record the transaction hash and the gas paid each time so you can prove the farm later.",
  "Check the position once a week: if TVL falls more than 20% in a week, halve the position; if the pool pauses deposits, withdraw.",
  "Keep the position open for the full {hold}-day hold; do not chase a second farm with the same $1,000 while this one is running.",
  "After {hold} days, withdraw the deposit and any rewards to your wallet; note the exit fee and the final balance against your $1,000 ticket.",
  "If {name} issues a token, claim the airdrop from its official claim page only; never sign a claim link from a chat or an ad. Cost: {fee} fees + {tbill} opportunity cost. Time: {hours} hours hands-on over {hold} days.",
];

export function renderSteps(
  name: string,
  chain: string | null,
  play: Play,
  feeTotal: number,
): string[] {
  const fill = (t: string): string =>
    t
      .replaceAll("{name}", name)
      .replaceAll("{chain}", chain ?? "its main chain")
      .replaceAll("{play}", play.play)
      .replaceAll("{asset}", play.asset)
      .replaceAll("{action}", play.action)
      .replaceAll("{fee}", money(feeTotal))
      .replaceAll("{tbill}", money(TBILL_USD))
      .replaceAll("{hours}", String(play.hours))
      .replaceAll("{hold}", String(HOLD_DAYS));
  return STEP_TEMPLATES.map(fill);
}
