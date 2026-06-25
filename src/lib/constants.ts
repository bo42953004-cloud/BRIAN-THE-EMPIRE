export type TradeCategory = "over-under" | "even-odd" | "rise-fall";

export interface TradeType {
  id: string;
  category: TradeCategory;
  label: string;
  short: string;
  description: string;
  /** For Over/Under, the threshold digit */
  threshold?: number;
  /** For Over/Under, whether it's over or under */
  direction?: "over" | "under";
  /** For Rise/Fall, which direction */
  rfDir?: "rise" | "fall";
  /** For Even/Odd */
  parity?: "even" | "odd";
}

export const TRADE_TYPES: TradeType[] = [
  // Over
  { id: "over-6", category: "over-under", label: "Over 6", short: "O6", description: "Last digit is 7, 8 or 9", threshold: 6, direction: "over" },
  { id: "over-5", category: "over-under", label: "Over 5", short: "O5", description: "Last digit is 6, 7, 8 or 9", threshold: 5, direction: "over" },
  { id: "over-4", category: "over-under", label: "Over 4", short: "O4", description: "Last digit is 5, 6, 7, 8 or 9", threshold: 4, direction: "over" },
  { id: "over-3", category: "over-under", label: "Over 3", short: "O3", description: "Last digit is 4, 5, 6, 7, 8 or 9", threshold: 3, direction: "over" },
  // Under
  { id: "under-3", category: "over-under", label: "Under 3", short: "U3", description: "Last digit is 0, 1 or 2", threshold: 3, direction: "under" },
  { id: "under-4", category: "over-under", label: "Under 4", short: "U4", description: "Last digit is 0, 1, 2 or 3", threshold: 4, direction: "under" },
  { id: "under-5", category: "over-under", label: "Under 5", short: "U5", description: "Last digit is 0, 1, 2, 3 or 4", threshold: 5, direction: "under" },
  { id: "under-6", category: "over-under", label: "Under 6", short: "U6", description: "Last digit is 0, 1, 2, 3, 4 or 5", threshold: 6, direction: "under" },
  // Even / Odd
  { id: "even", category: "even-odd", label: "Even", short: "EVEN", description: "Last digit is 0, 2, 4, 6 or 8", parity: "even" },
  { id: "odd", category: "even-odd", label: "Odd", short: "ODD", description: "Last digit is 1, 3, 5, 7 or 9", parity: "odd" },
  // Rise / Fall
  { id: "rise", category: "rise-fall", label: "Rise", short: "RISE", description: "Tick price is higher than previous tick", rfDir: "rise" },
  { id: "fall", category: "rise-fall", label: "Fall", short: "FALL", description: "Tick price is lower than previous tick", rfDir: "fall" },
];

export interface MarketSymbol {
  symbol: string;
  displayName: string;
  group: "R" | "1HZ" | "JD";
}

export const MARKET_GROUPS: { id: "R" | "1HZ" | "JD"; label: string; description: string; symbols: MarketSymbol[] }[] = [
  {
    id: "R",
    label: "R — Volatility",
    description: "Classic Volatility Indices (1 tick / sec)",
    symbols: [
      { symbol: "R_10", displayName: "Vol 10", group: "R" },
      { symbol: "R_25", displayName: "Vol 25", group: "R" },
      { symbol: "R_50", displayName: "Vol 50", group: "R" },
      { symbol: "R_75", displayName: "Vol 75", group: "R" },
      { symbol: "R_100", displayName: "Vol 100", group: "R" },
    ],
  },
  {
    id: "1HZ",
    label: "1HZ — Volatility 1s",
    description: "Ultra-fast volatility (1 tick / sec)",
    symbols: [
      { symbol: "1HZ10V", displayName: "Vol 10 (1s)", group: "1HZ" },
      { symbol: "1HZ25V", displayName: "Vol 25 (1s)", group: "1HZ" },
      { symbol: "1HZ50V", displayName: "Vol 50 (1s)", group: "1HZ" },
      { symbol: "1HZ75V", displayName: "Vol 75 (1s)", group: "1HZ" },
      { symbol: "1HZ100V", displayName: "Vol 100 (1s)", group: "1HZ" },
    ],
  },
  {
    id: "JD",
    label: "JD — Jump",
    description: "Jump Indices (jumps once per second)",
    symbols: [
      { symbol: "JD10", displayName: "Jump 10", group: "JD" },
      { symbol: "JD25", displayName: "Jump 25", group: "JD" },
      { symbol: "JD50", displayName: "Jump 50", group: "JD" },
      { symbol: "JD75", displayName: "Jump 75", group: "JD" },
      { symbol: "JD100", displayName: "Jump 100", group: "JD" },
    ],
  },
];

export const ALL_SYMBOLS = MARKET_GROUPS.flatMap((g) => g.symbols);

/** URL traders are directed to for placing trades */
export const TRADING_SITE_URL = "https://the-empiretrader.site";

/** Schedule interval for auto-scan (ms) */
export const AUTO_SCAN_INTERVAL_MS = 40 * 60 * 1000; // 40 minutes
