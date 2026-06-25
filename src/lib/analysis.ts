import type { TradeType } from "./constants";
import type { TickData } from "./deriv";
export type { TradeType, TickData };

/**
 * Evaluate if a tick would WIN for a given trade type.
 */
export function evaluateTrade(
  trade: TradeType,
  tick: { quote: number; lastDigit: number },
  prevTick?: { quote: number }
): boolean | null {
  if (trade.category === "over-under") {
    if (trade.direction === "over" && trade.threshold !== undefined) return tick.lastDigit > trade.threshold;
    if (trade.direction === "under" && trade.threshold !== undefined) return tick.lastDigit < trade.threshold;
  }
  if (trade.category === "even-odd") {
    if (trade.parity === "even") return tick.lastDigit % 2 === 0;
    if (trade.parity === "odd") return tick.lastDigit % 2 !== 0;
  }
  if (trade.category === "rise-fall") {
    if (!prevTick) return null;
    if (trade.rfDir === "rise") return tick.quote > prevTick.quote;
    if (trade.rfDir === "fall") return tick.quote < prevTick.quote;
  }
  return null;
}

// ------------------------------
// Entry point detection
// ------------------------------

export type EntryPointType = "digit" | "pattern" | "parity-run" | "direction-run";

export interface EntryPoint {
  type: EntryPointType;
  /** For digit: number; pattern: number[]; parity-run/direction-run: run length */
  value: number | number[];
  label: string;
  description: string;
  wins: number;
  losses: number;
  sampleSize: number;
  winRate: number;
  /** True if the most recent tick matches this entry context (so the NEXT tick would be the trade) */
  currentlyMatches: boolean;
  /** Number of ticks since this entry was last triggered */
  ticksSinceMatch: number;
  /** Recommended for bot: stable confidence */
  confidence: "high" | "medium" | "low";
  /**
   * How many ticks the entry window stays open AFTER the trigger is satisfied.
   * For single-digit and pattern entries this is strictly 1 (no gaps allowed).
   * For runs, the window is 1 tick after the run completes.
   */
  windowTicks: number;
  /** Human-readable window label, e.g. "next 1 tick · no gaps allowed" */
  windowLabel: string;
  /** Short rule note about gaps / consecutive requirement */
  windowRule: string;
}

// ------------------------------
// Signal stability with hysteresis
// ------------------------------

export type SignalLevel = "strong" | "good" | "neutral" | "weak" | "broken";

export interface BreakConditions {
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  winRateDropFromPeak: number;
  maxAllowedDrop: number;
  minWinRate: number;
  currentWinRate: number;
  ticksSinceEntryMatched: number;
  maxGapTicks: number;
}

export interface SignalStability {
  level: SignalLevel;
  lockedAtEpoch: number | null; // when it entered "strong"
  lockedDurationTicks: number;
  peakWinRate: number;
  currentWinRate: number;
  breakConditions: BreakConditions;
  willBreakSoon: boolean;
  stabilityScore: number; // 0..1
  statusLabel: string;
  reasonLabel: string;
}

// ------------------------------
// Symbol analysis snapshot
// ------------------------------

export interface SymbolAnalysis {
  symbol: string;
  displayName: string;
  group: "R" | "1HZ" | "JD";
  totalTicks: number;
  wins: number;
  losses: number;
  winRate: number;
  lastPrice: number | null;
  lastDigit: number | null;
  lastDigitDist: number[];
  recentOutcomes: boolean[];
  currentStreak: number;
  bestStreak: number;
  signal: SignalLevel;
  signalLabel: string;
  stability: SignalStability;
  /** Best entry point (highest win rate with enough samples). */
  bestEntry: EntryPoint | null;
  /** Top 3 entry points ranked by win rate. */
  topEntries: EntryPoint[];
  /** True if an entry currently matches the live state, so the next tick is a potential trade. */
  entryReady: boolean;
}

export const MAX_HISTORY = 400;
export const MAX_RECENT = 30;

// ------------------------------
// Hysteresis thresholds
// ------------------------------

const STRONG_ENTER = 0.66; // win rate required to enter "strong"
const STRONG_HOLD = 0.58; // minimum win rate to stay strong (hysteresis)
const GOOD_ENTER = 0.56;
const MAX_CONSECUTIVE_LOSSES = 3; // 3 losses in a row breaks the strong signal
const MAX_PEAK_DROP = 0.12; // drop > 12% from peak breaks the signal
const MAX_ENTRY_GAP = 25; // if entry condition hasn't matched in 25 ticks, signal weakens

// ------------------------------
// Entry point builders
// ------------------------------

function buildDigitEntry(
  digit: number,
  wins: number,
  losses: number,
  currentLastDigit: number | null,
  ticksSinceDigit: number,
  trade: TradeType
): EntryPoint {
  const sampleSize = wins + losses;
  const winRate = sampleSize === 0 ? 0 : wins / sampleSize;
  const matches = currentLastDigit === digit;
  return {
    type: "digit",
    value: digit,
    label: `After digit ${digit}`,
    description: `Trade ${trade.label} when the previous tick's last digit is ${digit}.`,
    wins,
    losses,
    sampleSize,
    winRate,
    currentlyMatches: matches,
    ticksSinceMatch: ticksSinceDigit,
    confidence: sampleSize >= 25 && winRate >= 0.65 ? "high" : sampleSize >= 15 && winRate >= 0.58 ? "medium" : "low",
    windowTicks: 1,
    windowLabel: "Next 1 tick only",
    windowRule: "Trade on the very next tick after digit appears — any later tick invalidates the entry.",
  };
}

function buildPatternEntry(
  pattern: number[],
  wins: number,
  losses: number,
  recentDigits: number[],
  ticksSincePattern: number,
  trade: TradeType
): EntryPoint {
  const sampleSize = wins + losses;
  const winRate = sampleSize === 0 ? 0 : wins / sampleSize;
  const matches =
    recentDigits.length >= pattern.length &&
    pattern.every((p, i) => recentDigits[recentDigits.length - pattern.length + i] === p);
  return {
    type: "pattern",
    value: pattern,
    label: `Pattern [${pattern.join(",")}]`,
    description: `Trade ${trade.label} when the last ${pattern.length} digits are ${pattern.join("→")}.`,
    wins,
    losses,
    sampleSize,
    winRate,
    currentlyMatches: matches,
    ticksSinceMatch: ticksSincePattern,
    confidence: sampleSize >= 12 && winRate >= 0.70 ? "high" : sampleSize >= 8 && winRate >= 0.62 ? "medium" : "low",
    windowTicks: 1,
    windowLabel: "Next 1 tick · no gaps allowed",
    windowRule: `Digits must be consecutive — ${pattern.join(" → ")} must appear on back-to-back ticks. Any other digit in between breaks the pattern.`,
  };
}

function buildParityRunEntry(
  parity: "even" | "odd",
  runLen: number,
  wins: number,
  losses: number,
  currentRun: { parity: "even" | "odd"; length: number } | null,
  ticksSinceMatch: number,
  trade: TradeType
): EntryPoint {
  const sampleSize = wins + losses;
  const winRate = sampleSize === 0 ? 0 : wins / sampleSize;
  const matches = currentRun !== null && currentRun.parity === parity && currentRun.length >= runLen;
  return {
    type: "parity-run",
    value: runLen,
    label: `${runLen}+ ${parity} in a row`,
    description: `Trade ${trade.label} after ${runLen} or more consecutive ${parity} last digits.`,
    wins,
    losses,
    sampleSize,
    winRate,
    currentlyMatches: matches,
    ticksSinceMatch: ticksSinceMatch,
    confidence: sampleSize >= 15 && winRate >= 0.65 ? "high" : sampleSize >= 10 && winRate >= 0.58 ? "medium" : "low",
    windowTicks: 1,
    windowLabel: "Next 1 tick · consecutive run",
    windowRule: `All ${runLen}+ digits must be ${parity} in an unbroken row. The moment any opposite digit appears, the run — and the entry — resets.`,
  };
}

function buildDirectionRunEntry(
  dir: "up" | "down",
  runLen: number,
  wins: number,
  losses: number,
  currentRun: { dir: "up" | "down"; length: number } | null,
  ticksSinceMatch: number,
  trade: TradeType
): EntryPoint {
  const sampleSize = wins + losses;
  const winRate = sampleSize === 0 ? 0 : wins / sampleSize;
  const matches = currentRun !== null && currentRun.dir === dir && currentRun.length >= runLen;
  return {
    type: "direction-run",
    value: runLen,
    label: `${runLen}+ ${dir} ticks`,
    description: `Trade ${trade.label} after ${runLen} or more consecutive ${dir === "up" ? "rising" : "falling"} ticks.`,
    wins,
    losses,
    sampleSize,
    winRate,
    currentlyMatches: matches,
    ticksSinceMatch: ticksSinceMatch,
    confidence: sampleSize >= 15 && winRate >= 0.65 ? "high" : sampleSize >= 10 && winRate >= 0.58 ? "medium" : "low",
    windowTicks: 1,
    windowLabel: "Next 1 tick · consecutive run",
    windowRule: `All ${runLen}+ ticks must move in the same direction without interruption. One opposite tick resets the run.`,
  };
}

// ------------------------------
// Tracker
// ------------------------------

interface TrackedTick {
  quote: number;
  digit: number;
  epoch: number;
  outcome: boolean | null; // null when rise/fall can't evaluate (first tick)
}

export class SymbolTracker {
  private ticks: TrackedTick[] = [];
  private bestWinStreak = 0;

  // Hysteresis state
  private signalLevel: SignalLevel = "neutral";
  private lockedAtEpoch: number | null = null;
  private peakWinRate = 0;
  private consecutiveLosses = 0;

  constructor(
    public readonly symbol: string,
    public readonly displayName: string,
    public readonly group: "R" | "1HZ" | "JD",
    public readonly trade: TradeType
  ) {}

  loadHistory(history: { prices: number[]; times: number[] }, pipSize: number) {
    this.ticks = [];
    this.signalLevel = "neutral";
    this.lockedAtEpoch = null;
    this.peakWinRate = 0;
    this.consecutiveLosses = 0;
    const factor = Math.pow(10, pipSize);
    for (let i = 0; i < history.prices.length; i++) {
      const quote = history.prices[i];
      const epoch = history.times[i];
      const digit = Math.abs(Math.round(quote * factor)) % 10;
      const prev = this.ticks[this.ticks.length - 1];
      const outcome = evaluateTrade(
        this.trade,
        { quote, lastDigit: digit },
        prev ? { quote: prev.quote } : undefined
      );
      this.ticks.push({ quote, digit, epoch, outcome });
      this.updateHysteresis(outcome, epoch);
    }
    if (this.ticks.length > MAX_HISTORY) {
      this.ticks = this.ticks.slice(-MAX_HISTORY);
    }
    this.bestWinStreak = this.computeBestStreak();
  }

  addTick(tick: TickData) {
    const prev = this.ticks[this.ticks.length - 1];
    const outcome = evaluateTrade(
      this.trade,
      { quote: tick.quote, lastDigit: tick.lastDigit },
      prev ? { quote: prev.quote } : undefined
    );
    this.ticks.push({ quote: tick.quote, digit: tick.lastDigit, epoch: tick.epoch, outcome });
    this.updateHysteresis(outcome, tick.epoch);
    if (this.ticks.length > MAX_HISTORY) this.ticks.shift();
    this.bestWinStreak = Math.max(this.bestWinStreak, this.computeBestStreak());
  }

  private updateHysteresis(outcome: boolean | null, epoch: number) {
    if (outcome === null) return;

    if (outcome === false) this.consecutiveLosses++;
    else this.consecutiveLosses = 0;

    // Current win rate over the last 60 trades (rolling)
    const rollingN = 60;
    const slice = this.ticks.slice(-rollingN).filter((t) => t.outcome !== null);
    const wins = slice.filter((t) => t.outcome === true).length;
    const currentWinRate = slice.length === 0 ? 0 : wins / slice.length;
    if (currentWinRate > this.peakWinRate) this.peakWinRate = currentWinRate;
    const dropFromPeak = this.peakWinRate - currentWinRate;

    const shouldBreak =
      this.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES ||
      dropFromPeak > MAX_PEAK_DROP ||
      (slice.length >= 20 && currentWinRate < STRONG_HOLD);

    if (this.signalLevel === "strong") {
      if (shouldBreak) {
        this.signalLevel = "broken";
        this.lockedAtEpoch = null;
      }
    } else if (this.signalLevel === "broken") {
      // Recover only when conditions are clearly healthy again
      if (
        this.consecutiveLosses === 0 &&
        currentWinRate >= STRONG_ENTER &&
        slice.length >= 20
      ) {
        this.signalLevel = "strong";
        this.lockedAtEpoch = epoch;
        this.peakWinRate = currentWinRate;
      } else if (currentWinRate >= GOOD_ENTER) {
        this.signalLevel = "good";
      } else if (currentWinRate < 0.48) {
        this.signalLevel = "weak";
      } else {
        this.signalLevel = "neutral";
      }
    } else {
      if (currentWinRate >= STRONG_ENTER && slice.length >= 20 && this.consecutiveLosses === 0) {
        this.signalLevel = "strong";
        this.lockedAtEpoch = epoch;
        this.peakWinRate = currentWinRate;
      } else if (currentWinRate >= GOOD_ENTER) {
        this.signalLevel = "good";
      } else if (currentWinRate >= 0.48) {
        this.signalLevel = "neutral";
      } else {
        this.signalLevel = "weak";
      }
    }
  }

  private computeBestStreak(): number {
    let best = 0, cur = 0;
    for (const t of this.ticks) {
      if (t.outcome === true) { cur++; best = Math.max(best, cur); }
      else if (t.outcome === false) cur = 0;
    }
    return best;
  }

  private currentStreak(): number {
    if (this.ticks.length === 0) return 0;
    let streak = 0;
    let i = this.ticks.length - 1;
    while (i >= 0 && this.ticks[i].outcome === null) i--;
    if (i < 0) return 0;
    const last = this.ticks[i].outcome;
    while (i >= 0 && this.ticks[i].outcome === last) {
      streak++;
      i--;
    }
    return last ? streak : -streak;
  }

  // ---- Entry-point discovery ----

  private buildEntryPoints(): EntryPoint[] {
    const entries: EntryPoint[] = [];
    const recentTicks = this.ticks.slice(-MAX_HISTORY);
    if (recentTicks.length < 10) return [];

    // We need pairs (context_tick, outcome_tick). context_tick provides the entry, outcome_tick provides the result.
    const pairs: { ctx: TrackedTick; result: TrackedTick }[] = [];
    for (let i = 1; i < recentTicks.length; i++) {
      if (recentTicks[i].outcome === null) continue;
      pairs.push({ ctx: recentTicks[i - 1], result: recentTicks[i] });
    }
    if (pairs.length < 8) return [];

    const lastTick = recentTicks[recentTicks.length - 1];
    const lastDigit = lastTick?.digit ?? null;

    // Ticks since each digit appeared (for ticksSinceMatch)
    const ticksSinceDigit = new Array(10).fill(MAX_HISTORY);
    for (let i = recentTicks.length - 1; i >= 0; i--) {
      const d = recentTicks[i].digit;
      if (ticksSinceDigit[d] === MAX_HISTORY) ticksSinceDigit[d] = recentTicks.length - 1 - i;
    }

    // 1) Single-digit entries
    const digitStats: { wins: number; losses: number }[] = Array.from({ length: 10 }, () => ({ wins: 0, losses: 0 }));
    for (const { ctx, result } of pairs) {
      if (result.outcome === true) digitStats[ctx.digit].wins++;
      else digitStats[ctx.digit].losses++;
    }
    for (let d = 0; d < 10; d++) {
      const { wins, losses } = digitStats[d];
      if (wins + losses >= 6) {
        entries.push(buildDigitEntry(d, wins, losses, lastDigit, ticksSinceDigit[d], this.trade));
      }
    }

    // 2) Pattern entries — last-2-digit patterns, only keep high-performing ones
    const patternMap = new Map<string, { wins: number; losses: number; lastSeen: number }>();
    for (let i = 2; i < recentTicks.length; i++) {
      const res = recentTicks[i];
      if (res.outcome === null) continue;
      const a = recentTicks[i - 2].digit;
      const b = recentTicks[i - 1].digit;
      const key = `${a},${b}`;
      const s = patternMap.get(key) ?? { wins: 0, losses: 0, lastSeen: -1 };
      if (res.outcome === true) s.wins++; else s.losses++;
      s.lastSeen = i;
      patternMap.set(key, s);
    }
    const recentDigits = recentTicks.slice(-5).map((t) => t.digit);
    for (const [key, s] of patternMap) {
      if (s.wins + s.losses < 6) continue;
      const [a, b] = key.split(",").map(Number);
      const winRate = s.wins / (s.wins + s.losses);
      if (winRate < 0.58) continue; // only keep patterns with edge
      const ticksSince = recentTicks.length - 1 - s.lastSeen;
      entries.push(buildPatternEntry([a, b], s.wins, s.losses, recentDigits, ticksSince, this.trade));
    }

    // 3) Parity-run entries (2+, 3+ in a row of even/odd)
    // Build runs
    const parityRuns: { parity: "even" | "odd"; length: number; endIdx: number }[] = [];
    let currentRun: { parity: "even" | "odd"; length: number; startIdx: number } | null = null;
    for (let i = 0; i < recentTicks.length; i++) {
      const p: "even" | "odd" = recentTicks[i].digit % 2 === 0 ? "even" : "odd";
      if (currentRun && currentRun.parity === p) {
        currentRun.length++;
      } else {
        if (currentRun) parityRuns.push({ ...currentRun, endIdx: i - 1 });
        currentRun = { parity: p, length: 1, startIdx: i };
      }
    }
    if (currentRun) parityRuns.push({ ...currentRun, endIdx: recentTicks.length - 1 });

    const liveRun = parityRuns[parityRuns.length - 1] ?? null;
    const liveRunState = liveRun ? { parity: liveRun.parity, length: liveRun.length } : null;

    for (const parity of ["even", "odd"] as const) {
      for (const runLen of [2, 3]) {
        let wins = 0, losses = 0, lastMatchIdx = -1;
        for (const r of parityRuns) {
          if (r.parity !== parity || r.length < runLen) continue;
          // Outcome of the tick IMMEDIATELY after the run's end
          const nextIdx = r.endIdx + 1;
          if (nextIdx < recentTicks.length && recentTicks[nextIdx].outcome !== null) {
            if (recentTicks[nextIdx].outcome === true) wins++; else losses++;
            lastMatchIdx = Math.max(lastMatchIdx, r.endIdx);
          }
        }
        if (wins + losses >= 6) {
          const ticksSince = lastMatchIdx === -1 ? MAX_HISTORY : recentTicks.length - 1 - lastMatchIdx;
          entries.push(buildParityRunEntry(parity, runLen, wins, losses, liveRunState, ticksSince, this.trade));
        }
      }
    }

    // 4) Direction-run entries for rise/fall trades only
    if (this.trade.category === "rise-fall") {
      const dirRuns: { dir: "up" | "down"; length: number; endIdx: number }[] = [];
      let cur: { dir: "up" | "down"; length: number } | null = null;
      for (let i = 1; i < recentTicks.length; i++) {
        const d: "up" | "down" = recentTicks[i].quote > recentTicks[i - 1].quote ? "up" : "down";
        if (cur && cur.dir === d) cur.length++;
        else {
          if (cur) dirRuns.push({ ...cur, endIdx: i - 1 });
          cur = { dir: d, length: 1 };
        }
      }
      if (cur) dirRuns.push({ ...cur, endIdx: recentTicks.length - 1 });
      const liveDirRun = dirRuns[dirRuns.length - 1] ?? null;
      const liveDirState = liveDirRun ? { dir: liveDirRun.dir, length: liveDirRun.length } : null;

      for (const dir of ["up", "down"] as const) {
        for (const runLen of [2, 3]) {
          let wins = 0, losses = 0, lastMatchIdx = -1;
          for (const r of dirRuns) {
            if (r.dir !== dir || r.length < runLen) continue;
            const nextIdx = r.endIdx + 1;
            if (nextIdx < recentTicks.length && recentTicks[nextIdx].outcome !== null) {
              if (recentTicks[nextIdx].outcome === true) wins++; else losses++;
              lastMatchIdx = Math.max(lastMatchIdx, r.endIdx);
            }
          }
          if (wins + losses >= 6) {
            const ticksSince = lastMatchIdx === -1 ? MAX_HISTORY : recentTicks.length - 1 - lastMatchIdx;
            entries.push(buildDirectionRunEntry(dir, runLen, wins, losses, liveDirState, ticksSince, this.trade));
          }
        }
      }
    }

    // Rank by win rate, then sample size, then confidence
    entries.sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.sampleSize - a.sampleSize;
    });

    return entries;
  }

  snapshot(): SymbolAnalysis {
    const outcomes = this.ticks.filter((t) => t.outcome !== null).map((t) => t.outcome as boolean);
    const wins = outcomes.filter(Boolean).length;
    const losses = outcomes.length - wins;
    const winRate = outcomes.length === 0 ? 0 : wins / outcomes.length;
    const last = this.ticks[this.ticks.length - 1];

    // Rolling recent win rate
    const recentTicks = this.ticks.slice(-60).filter((t) => t.outcome !== null);
    const recentWins = recentTicks.filter((t) => t.outcome === true).length;
    const recentWinRate = recentTicks.length === 0 ? 0 : recentWins / recentTicks.length;

    const allEntries = this.buildEntryPoints();
    const bestEntry = allEntries[0] ?? null;
    const topEntries = allEntries.slice(0, 3);

    // Ticks since last entry matched (for best entry)
    const ticksSinceEntryMatched = bestEntry ? bestEntry.ticksSinceMatch : MAX_HISTORY;

    // Build stability info
    const peak = this.peakWinRate;
    const dropFromPeak = peak - recentWinRate;
    const stability = this.buildStability(recentWinRate, dropFromPeak, ticksSinceEntryMatched);

    const signalLabel = this.signalLabel(stability);

    return {
      symbol: this.symbol,
      displayName: this.displayName,
      group: this.group,
      totalTicks: this.ticks.length,
      wins,
      losses,
      winRate,
      lastPrice: last?.quote ?? null,
      lastDigit: last?.digit ?? null,
      lastDigitDist: this.computeDigitDist(),
      recentOutcomes: outcomes.slice(-MAX_RECENT),
      currentStreak: this.currentStreak(),
      bestStreak: this.bestWinStreak,
      signal: stability.level,
      signalLabel,
      stability,
      bestEntry,
      topEntries,
      entryReady: !!bestEntry && bestEntry.currentlyMatches,
    };
  }

  private buildStability(currentWinRate: number, dropFromPeak: number, ticksSinceEntryMatched: number): SignalStability {
    const level = this.signalLevel;
    const nowEpoch = this.ticks[this.ticks.length - 1]?.epoch ?? null;
    const lockedDurationTicks =
      level === "strong" && this.lockedAtEpoch !== null && nowEpoch !== null
        ? Math.max(0, this.ticks.length - this.ticks.findIndex((t) => t.epoch >= this.lockedAtEpoch!))
        : 0;

    const breakConditions: BreakConditions = {
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: MAX_CONSECUTIVE_LOSSES,
      winRateDropFromPeak: dropFromPeak,
      maxAllowedDrop: MAX_PEAK_DROP,
      minWinRate: STRONG_HOLD,
      currentWinRate,
      ticksSinceEntryMatched,
      maxGapTicks: MAX_ENTRY_GAP,
    };

    const willBreakSoon =
      level === "strong" &&
      (this.consecutiveLosses >= 2 || dropFromPeak > MAX_PEAK_DROP * 0.7 || currentWinRate < STRONG_HOLD + 0.03);

    // Stability score: higher when strongly locked and far from break
    let stabilityScore = 0;
    if (level === "strong") {
      const lockBonus = Math.min(lockedDurationTicks / 40, 0.4);
      const winBonus = Math.min(Math.max(currentWinRate - STRONG_HOLD, 0) * 2, 0.3);
      const lossPenalty = (this.consecutiveLosses / MAX_CONSECUTIVE_LOSSES) * 0.5;
      const dropPenalty = (dropFromPeak / MAX_PEAK_DROP) * 0.4;
      stabilityScore = Math.max(0, Math.min(1, 0.4 + lockBonus + winBonus - lossPenalty - dropPenalty));
    } else if (level === "good") {
      stabilityScore = 0.35 + Math.min(currentWinRate - GOOD_ENTER, 0.1) * 2;
    } else if (level === "broken") {
      stabilityScore = 0.1;
    } else if (level === "neutral") {
      stabilityScore = 0.25;
    } else {
      stabilityScore = 0.1;
    }

    const statusLabel = this.statusLabel(level, lockedDurationTicks, willBreakSoon);
    const reasonLabel = this.reasonLabel(level, currentWinRate, dropFromPeak, this.consecutiveLosses);

    return {
      level,
      lockedAtEpoch: this.lockedAtEpoch,
      lockedDurationTicks,
      peakWinRate: this.peakWinRate,
      currentWinRate,
      breakConditions,
      willBreakSoon,
      stabilityScore,
      statusLabel,
      reasonLabel,
    };
  }

  private statusLabel(level: SignalLevel, lockedTicks: number, willBreakSoon: boolean): string {
    if (level === "strong") {
      if (willBreakSoon) return "Strong · at risk";
      if (lockedTicks >= 30) return "Strong · locked";
      if (lockedTicks >= 10) return "Strong · stable";
      return "Strong · fresh";
    }
    if (level === "good") return "Good opportunity";
    if (level === "broken") return "Broken · recovering";
    if (level === "neutral") return "Neutral";
    return "Weak";
  }

  private reasonLabel(level: SignalLevel, winRate: number, drop: number, losses: number): string {
    if (level === "strong") {
      if (losses >= 2) return `${losses} consecutive loss${losses > 1 ? "es" : ""}`;
      if (drop > MAX_PEAK_DROP * 0.7) return `Win rate dropping from peak`;
      return `Win rate ${(winRate * 100).toFixed(0)}% holding steady`;
    }
    if (level === "broken") return "Break condition hit";
    return `Win rate ${(winRate * 100).toFixed(0)}%`;
  }

  private signalLabel(s: SignalStability): string {
    return s.statusLabel;
  }

  private computeDigitDist(): number[] {
    const dist = new Array(10).fill(0);
    for (const t of this.ticks) dist[t.digit]++;
    return dist;
  }
}

// ------------------------------
// Bot config export helper
// ------------------------------

export interface BotTradeConfig {
  symbol: string;
  symbolDisplayName: string;
  tradeType: string;
  tradeLabel: string;
  entryCondition: {
    type: EntryPointType;
    value: number | number[];
    description: string;
  };
  confidence: "high" | "medium" | "low";
  winRate: number;
  sampleSize: number;
  signalLevel: SignalLevel;
  stabilityScore: number;
  generatedAt: string;
}

export function toBotConfig(a: SymbolAnalysis, tradeLabel: string): BotTradeConfig | null {
  if (!a.bestEntry) return null;
  return {
    symbol: a.symbol,
    symbolDisplayName: a.displayName,
    tradeType: a.symbol,
    tradeLabel: `${a.displayName} · ${tradeLabel}`,
    entryCondition: {
      type: a.bestEntry.type,
      value: a.bestEntry.value,
      description: a.bestEntry.description,
    },
    confidence: a.bestEntry.confidence,
    winRate: a.bestEntry.winRate,
    sampleSize: a.bestEntry.sampleSize,
    signalLevel: a.signal,
    stabilityScore: a.stability.stabilityScore,
    generatedAt: new Date().toISOString(),
  };
}

// ------------------------------
// Bot-style message (emoji-rich copy output)
// ------------------------------

function entryEmoji(entry: EntryPoint): string {
  if (entry.type === "digit") return `🔢 After digit ${entry.value}`;
  if (entry.type === "pattern") return `🔗 Pattern [${(entry.value as number[]).join(" → ")}]`;
  if (entry.type === "parity-run") {
    const parity = entry.label.includes("even") ? "even" : "odd";
    return `♻️ ${entry.value}+ ${parity} in a row`;
  }
  if (entry.type === "direction-run") {
    const up = entry.label.includes("up");
    return `${up ? "📈" : "📉"} ${entry.value}+ ${up ? "up" : "down"} ticks`;
  }
  return "🎯 Entry";
}

function progressBar(score: number, len = 12): string {
  const filled = Math.round(Math.max(0, Math.min(1, score)) * len);
  return "█".repeat(filled) + "░".repeat(len - filled);
}

function signalEmoji(level: SignalLevel): string {
  switch (level) {
    case "strong": return "🔒 STRONG";
    case "good": return "✅ GOOD";
    case "broken": return "⚠️ BROKEN";
    case "neutral": return "➖ NEUTRAL";
    default: return "⬇️ WEAK";
  }
}

function confidenceEmoji(c: "high" | "medium" | "low"): string {
  return c === "high" ? "💎 HIGH" : c === "medium" ? "🟢 MEDIUM" : "🟡 LOW";
}

function pad(label: string, width = 12): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

/**
 * Generate a lively, emoji-rich message formatted like a bot broadcast.
 * This is the text that gets copied to clipboard for Deriv DBot / DTrader users.
 */
export function toBotMessage(a: SymbolAnalysis, tradeLabel: string): string {
  const entry = a.bestEntry;
  if (!entry) return `🤖 No valid entry yet for ${a.displayName}`;

  const now = new Date();
  const utc = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const winPct = (entry.winRate * 100).toFixed(1);
  const overallPct = (a.winRate * 100).toFixed(1);
  const stabPct = Math.round(a.stability.stabilityScore * 100);

  const bc = a.stability.breakConditions;
  const line = "━".repeat(34);

  const parts: string[] = [];
  parts.push(`👑 EMPIRETRADER · LIVE SIGNAL ${a.entryReady ? "🚨 READY NOW" : ""}`);
  parts.push(line);
  parts.push(`🎯 ${pad("Trade:")} ${tradeLabel}`);
  parts.push(`📊 ${pad("Market:")} ${a.displayName}`);
  parts.push(`🏷️ ${pad("Group:")} ${a.group}  (${a.symbol})`);
  parts.push(line);
  parts.push(`${entryEmoji(entry)}`);
  parts.push(`⚡ ${pad("Window:")} ${entry.windowLabel}`);
  parts.push(`   💡 ${entry.windowRule}`);
  parts.push(line);
  parts.push(`📈 ${pad("Entry win:")} ${winPct}%   (${entry.wins}W · ${entry.losses}L)`);
  parts.push(`🧪 ${pad("Sample:")} ${entry.sampleSize} trades`);
  parts.push(`${confidenceEmoji(entry.confidence)}`);
  parts.push(`📊 ${pad("Overall:")} ${overallPct}% across ${a.totalTicks} ticks`);
  parts.push(`🏆 ${pad("Best streak:")} ${a.bestStreak} wins in a row`);
  parts.push(`🔥 ${pad("Current:")} ${a.currentStreak > 0 ? `${a.currentStreak}W streak` : a.currentStreak < 0 ? `${-a.currentStreak}L streak` : "—"}`);
  parts.push(line);
  parts.push(`🔒 ${pad("Signal:")} ${signalEmoji(a.signal)}`);
  if (a.stability.level === "strong" && a.stability.lockedDurationTicks > 0) {
    parts.push(`⏱️ ${pad("Locked:")} ${a.stability.lockedDurationTicks} ticks holding steady`);
  }
  parts.push(`⚡ ${pad("Stability:")} ${progressBar(a.stability.stabilityScore)} ${stabPct}%`);
  parts.push(`📉 ${pad("Peak:")} ${(a.stability.peakWinRate * 100).toFixed(1)}%  →  now ${(a.stability.currentWinRate * 100).toFixed(1)}%`);
  parts.push(`⚠️ Break if:`);
  parts.push(`   • ${bc.consecutiveLosses}/${bc.maxConsecutiveLosses} consecutive losses`);
  parts.push(`   • ${(bc.winRateDropFromPeak * 100).toFixed(0)}% / ${(bc.maxAllowedDrop * 100).toFixed(0)}% drop from peak`);
  parts.push(`   • Win rate falls below ${(bc.minWinRate * 100).toFixed(0)}%`);
  parts.push(line);
  parts.push(`💬 ${pad("Tip:")} ${a.entryReady ? "✅ Entry matched — trade on the NEXT tick!" : `⏳ Wait for trigger (last seen ${entry.ticksSinceMatch} ticks ago)`}`);
  parts.push(`🕐 ${pad("Generated:")} ${utc}`);
  parts.push(`🌐 ${pad("Source:")} EMPIRETRADER`);
  return parts.join("\n");
}
