import { derivClient, type TickData } from "./deriv";
import { SymbolTracker, type SymbolAnalysis } from "./analysis";
import { MARKET_GROUPS, TRADE_TYPES, type TradeType, ALL_SYMBOLS } from "./constants";
import type { RankedSignal } from "./broadcast";

/**
 * FullScanner subscribes to all 15 synthetic markets and runs all 12 trade-type
 * analyzers on each tick (180 trackers total). Used by the 40-min auto-scan
 * to surface the best signals across everything.
 */
export class FullScanner {
  private trackers = new Map<string, Map<string, SymbolTracker>>(); // symbol -> tradeId -> tracker
  private unsubscribes: Array<() => void> = [];
  private running = false;

  isRunning() {
    return this.running;
  }

  /**
   * Starts the scanner. Subscribes to all 15 symbols and wires each tick
   * to 12 trade-type trackers per symbol.
   */
  async start(onUpdate?: () => void): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Build tracker matrix: 15 symbols × 12 trade types = 180 trackers.
    for (const symbol of ALL_SYMBOLS) {
      const group = MARKET_GROUPS.find((g) => g.symbols.some((s) => s.symbol === symbol.symbol));
      if (!group) continue;
      const perTrade = new Map<string, SymbolTracker>();
      for (const trade of TRADE_TYPES) {
        perTrade.set(trade.id, new SymbolTracker(symbol.symbol, symbol.displayName, group.id, trade));
      }
      this.trackers.set(symbol.symbol, perTrade);
    }

    // Ensure Deriv connection.
    await derivClient.connect();

    // Subscribe to each symbol and fan ticks out to its 12 trackers.
    await Promise.all(
      ALL_SYMBOLS.map(async (symbol) => {
        try {
          const hist = await derivClient.subscribeTicks(symbol.symbol, 500);
          const perTrade = this.trackers.get(symbol.symbol);
          if (!perTrade) return;
          // Load history into every tracker for this symbol.
          perTrade.forEach((tracker) => {
            tracker.loadHistory(
              { prices: hist.history.prices, times: hist.history.times },
              hist.pip_size
            );
          });
          // One listener per symbol fans out to 12 trackers.
          const off = derivClient.addTickListener(symbol.symbol, (tick: TickData) => {
            perTrade.forEach((tracker) => tracker.addTick(tick));
            onUpdate?.();
          });
          this.unsubscribes.push(off);
        } catch (e) {
          console.error("[FullScanner] subscribe failed for", symbol.symbol, e);
        }
      })
    );
  }

  /**
   * Stop the scanner and clean up subscriptions.
   */
  async stop() {
    if (!this.running) return;
    this.running = false;
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    for (const symbol of ALL_SYMBOLS) {
      await derivClient.unsubscribeSymbol(symbol.symbol);
    }
    this.trackers.clear();
  }

  /**
   * Take a snapshot of every tracker and return the top N signals ranked by
   * signal level → stability → win rate. Filters out neutral/weak/broken.
   */
  getTopSignals(limit = 5): RankedSignal[] {
    const ranked: RankedSignal[] = [];
    this.trackers.forEach((perTrade) => {
      perTrade.forEach((tracker, tradeId) => {
        const snap = tracker.snapshot();
        if (!snap.bestEntry) return;
        if (snap.signal === "weak" || snap.signal === "broken" || snap.signal === "neutral") return;
        const trade = TRADE_TYPES.find((t) => t.id === tradeId);
        if (!trade) return;
        ranked.push({ analysis: snap, trade, rank: 0 });
      });
    });

    const levelRank: Record<string, number> = {
      strong: 0,
      good: 1,
      neutral: 2,
      weak: 3,
      broken: 4,
    };

    ranked.sort((a, b) => {
      const la = levelRank[a.analysis.signal] ?? 9;
      const lb = levelRank[b.analysis.signal] ?? 9;
      if (la !== lb) return la - lb;
      if (b.analysis.stability.stabilityScore !== a.analysis.stability.stabilityScore)
        return b.analysis.stability.stabilityScore - a.analysis.stability.stabilityScore;
      return b.analysis.bestEntry!.winRate - a.analysis.bestEntry!.winRate;
    });

    return ranked.slice(0, limit).map((r, i) => ({ ...r, rank: i }));
  }

  /**
   * Get a snapshot of every tracker (used by UI).
   */
  getAllSnapshots(): Array<{ analysis: SymbolAnalysis; trade: TradeType }> {
    const out: Array<{ analysis: SymbolAnalysis; trade: TradeType }> = [];
    this.trackers.forEach((perTrade) => {
      perTrade.forEach((tracker, tradeId) => {
        const trade = TRADE_TYPES.find((t) => t.id === tradeId);
        if (!trade) return;
        out.push({ analysis: tracker.snapshot(), trade });
      });
    });
    return out;
  }
}
