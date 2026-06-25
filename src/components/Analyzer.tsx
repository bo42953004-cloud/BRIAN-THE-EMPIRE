"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derivClient, type ConnectionStatus, type TickData } from "@/lib/deriv";
import { SymbolTracker, type SymbolAnalysis, type EntryPoint, toBotMessage } from "@/lib/analysis";
import { MARKET_GROUPS, TRADE_TYPES, type TradeType } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import UrlDisplay from "@/components/UrlDisplay";
import SettingsDrawer from "@/components/SettingsDrawer";
import {
  type BroadcastConfig,
  DEFAULT_BROADCAST_CONFIG,
  loadBroadcastConfig,
  broadcastSignal,
  isOnCooldown,
  markBroadcast,
  remainingCooldown,
} from "@/lib/broadcast";

export default function Analyzer() {
  const [selectedTrade, setSelectedTrade] = useState<TradeType | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("closed");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyses, setAnalyses] = useState<Record<string, SymbolAnalysis>>({});
  const [error, setError] = useState<string | null>(null);
  const [showBotPanel, setShowBotPanel] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastCfg, setBroadcastCfg] = useState<BroadcastConfig>(DEFAULT_BROADCAST_CONFIG);
  const [autoBroadcast, setAutoBroadcast] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const trackersRef = useRef<Map<string, SymbolTracker>>(new Map());

  // Load broadcast config on mount (client-side only).
  useEffect(() => {
    setBroadcastCfg(loadBroadcastConfig());
  }, []);

  const showToast = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  }, []);

  useEffect(() => {
    const off = derivClient.onStatus(setStatus);
    return () => {
      off();
    };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedTrade) return;
    setError(null);
    setAnalyzing(true);
    try {
      const prev = trackersRef.current;
      for (const sym of prev.keys()) await derivClient.unsubscribeSymbol(sym);
      trackersRef.current = new Map();
      setAnalyses({});

      await derivClient.connect();

      const newTrackers = new Map<string, SymbolTracker>();
      MARKET_GROUPS.forEach((g) => {
        g.symbols.forEach((s) => {
          const tracker = new SymbolTracker(s.symbol, s.displayName, s.group, selectedTrade);
          newTrackers.set(s.symbol, tracker);
        });
      });
      trackersRef.current = newTrackers;

      await Promise.all(
        Array.from(newTrackers.entries()).map(async ([symbol, tracker]) => {
          try {
            const hist = await derivClient.subscribeTicks(symbol, 500);
            tracker.loadHistory({ prices: hist.history.prices, times: hist.history.times }, hist.pip_size);
            derivClient.addTickListener(symbol, (tick: TickData) => {
              tracker.addTick(tick);
              setAnalyses((prev) => ({ ...prev, [symbol]: tracker.snapshot() }));
            });
            setAnalyses((prev) => ({ ...prev, [symbol]: tracker.snapshot() }));
          } catch (e) {
            console.error("subscribe failed for", symbol, e);
          }
        })
      );
    } catch (e: any) {
      setError(e?.message || "Failed to connect to Deriv API.");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedTrade]);

  const handleStop = useCallback(async () => {
    for (const sym of trackersRef.current.keys()) await derivClient.unsubscribeSymbol(sym);
    trackersRef.current = new Map();
    setAnalyses({});
  }, []);

  // Strong (or stable) signals
  const strongSignals = useMemo(() => {
    return Object.values(analyses)
      .filter((a) => a.signal === "strong" || a.signal === "good")
      .sort((a, b) => {
        // strong first, then stability score, then win rate
        const levelRank: Record<string, number> = { strong: 0, good: 1, neutral: 2, weak: 3, broken: 4 };
        const la = levelRank[a.signal] ?? 9;
        const lb = levelRank[b.signal] ?? 9;
        if (la !== lb) return la - lb;
        if (b.stability.stabilityScore !== a.stability.stabilityScore)
          return b.stability.stabilityScore - a.stability.stabilityScore;
        return b.winRate - a.winRate;
      });
  }, [analyses]);

  const avgWinRate = useMemo(() => {
    const arr = Object.values(analyses).filter((a) => a.totalTicks > 0);
    if (!arr.length) return 0;
    return arr.reduce((s, a) => s + a.winRate, 0) / arr.length;
  }, [analyses]);

  const readySignals = useMemo(
    () => Object.values(analyses).filter((a) => a.entryReady && a.bestEntry && (a.signal === "strong" || a.signal === "good")),
    [analyses]
  );

  const copyBotConfig = useCallback(
    async (a: SymbolAnalysis) => {
      if (!selectedTrade) return;
      const msg = toBotMessage(a, selectedTrade.label);
      try {
        await navigator.clipboard.writeText(msg);
        setCopiedKey(a.symbol);
        setTimeout(() => setCopiedKey((k) => (k === a.symbol ? null : k)), 1800);
      } catch {
        /* ignore */
      }
    },
    [selectedTrade]
  );

  const exportAllStrong = useCallback(async () => {
    if (!selectedTrade) return;
    const header = `👑 EMPIRETRADER · ${strongSignals.length} LIVE SIGNALS — ${selectedTrade.label}\n🕐 ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC\n\n`;
    const msgs = strongSignals.map((a) => toBotMessage(a, selectedTrade.label)).join("\n\n");
    try {
      await navigator.clipboard.writeText(header + msgs);
      setCopiedKey("__all__");
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      /* ignore */
    }
  }, [selectedTrade, strongSignals]);

  const handleBroadcast = useCallback(
    async (a: SymbolAnalysis) => {
      if (!selectedTrade) return;
      if (!broadcastCfg.telegram.enabled && !broadcastCfg.webhook.enabled) {
        showToast("err", "Enable Telegram or Webhook in settings first.");
        setSettingsOpen(true);
        return;
      }
      try {
        const result = await broadcastSignal(broadcastCfg, a, selectedTrade);
        markBroadcast(a.symbol, selectedTrade.id);
        const parts: string[] = [];
        if (result.telegram?.ok) parts.push("Telegram ✓");
        if (result.webhook?.ok) parts.push(`${broadcastCfg.webhook.label || "Webhook"} ✓`);
        if (parts.length) {
          showToast("ok", `Sent to ${parts.join(" + ")} · ${a.displayName}`);
        } else {
          const errs = [result.telegram?.error, result.webhook?.error].filter(Boolean).join(" | ");
          showToast("err", `Broadcast failed: ${errs || "unknown"}`);
        }
      } catch (e: any) {
        showToast("err", e?.message || "Broadcast failed");
      }
    },
    [selectedTrade, broadcastCfg, showToast]
  );

  // Auto-broadcast effect: fires when a signal qualifies + not on cooldown.
  useEffect(() => {
    if (!autoBroadcast || !selectedTrade) return;
    if (!broadcastCfg.telegram.enabled && !broadcastCfg.webhook.enabled) return;
    strongSignals.forEach((a) => {
      if (!a.bestEntry) return;
      if (broadcastCfg.filters.strongOnly && a.signal !== "strong") return;
      const rank = broadcastCfg.filters.minConfidence;
      const rankVal = rank === "high" ? 3 : rank === "medium" ? 2 : 1;
      const confVal = a.bestEntry.confidence === "high" ? 3 : a.bestEntry.confidence === "medium" ? 2 : 1;
      if (confVal < rankVal) return;
      if (isOnCooldown(a.symbol, selectedTrade.id, broadcastCfg.filters.cooldownSeconds)) return;
      handleBroadcast(a);
    });
  }, [strongSignals, autoBroadcast, selectedTrade, broadcastCfg, handleBroadcast]);

  return (
    <div className="min-h-screen bg-[#03120a] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-lime-500/10 rounded-full blur-[120px]" />
      </div>

      <Navbar />

      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-12">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusPill status={status} />
            {analyzing && (
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <Spinner /> Streaming from 15 markets…
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <UrlDisplay compact />
              <button
                onClick={() => setSettingsOpen(true)}
                title="Broadcast settings"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-500/10 text-xs text-emerald-200 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-lime-300 to-emerald-500 bg-clip-text text-transparent">EMPIRE</span>TRADER
            </h1>
          </div>
          <p className="text-white/60 max-w-2xl">
            Stable, locked signals with hysteresis. Each entry point is a concrete digit or pattern your Deriv DBot can use directly.
          </p>
        </div>

        {/* Controls */}
        <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#072015] to-[#04130b] p-5 md:p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 font-bold mb-1">Step 1</div>
              <div className="text-lg font-bold">Select trade type</div>
            </div>
            <div className="hidden sm:block text-xs text-white/40 font-mono">{selectedTrade ? `→ ${selectedTrade.label}` : "no selection"}</div>
          </div>
          <div className="space-y-5">
            <TradeGroup label="Over / Under" items={TRADE_TYPES.filter((t) => t.category === "over-under")} selected={selectedTrade} onSelect={setSelectedTrade} />
            <TradeGroup label="Even / Odd" items={TRADE_TYPES.filter((t) => t.category === "even-odd")} selected={selectedTrade} onSelect={setSelectedTrade} />
            <TradeGroup label="Rise / Fall" items={TRADE_TYPES.filter((t) => t.category === "rise-fall")} selected={selectedTrade} onSelect={setSelectedTrade} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={!selectedTrade || analyzing}
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 text-[#04130b] font-bold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {analyzing ? (<><Spinner /> Analyzing…</>) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Analyze now
                </>
              )}
            </button>
            {Object.keys(analyses).length > 0 && (
              <button onClick={handleStop} className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-emerald-500/30 bg-white/5 text-white font-semibold text-sm hover:bg-white/10 transition">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                Stop
              </button>
            )}
            {strongSignals.length > 0 && (
              <button
                onClick={() => setShowBotPanel((v) => !v)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 font-semibold text-sm hover:bg-emerald-500/25 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 8h6M9 12h6M9 16h4" />
                </svg>
                {showBotPanel ? "Hide" : "Show"} bot export ({strongSignals.length})
              </button>
            )}
            {(broadcastCfg.telegram.enabled || broadcastCfg.webhook.enabled) && (
              <button
                onClick={() => setAutoBroadcast((v) => !v)}
                className={`inline-flex items-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-sm border transition ${
                  autoBroadcast
                    ? "bg-red-500/20 border-red-400/50 text-red-200 hover:bg-red-500/30"
                    : "bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25"
                }`}
                title={autoBroadcast ? "Auto-broadcast is ON — click to stop" : "Auto-broadcast is OFF — click to start"}
              >
                {autoBroadcast ? (
                  <>
                    <span className="relative flex w-2 h-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    🔴 Auto-broadcast ON
                  </>
                ) : (
                  <>📡 Auto-broadcast</>
                )}
              </button>
            )}
            {error && <div className="text-red-300 text-xs">{error}</div>}
          </div>
        </div>

        {/* Summary stats */}
        {Object.keys(analyses).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Markets tracked" value={Object.keys(analyses).length.toString()} />
            <StatCard label="Strong signals" value={Object.values(analyses).filter((a) => a.signal === "strong").length.toString()} accent />
            <StatCard label="Entry ready now" value={readySignals.length.toString()} sub={readySignals.length ? readySignals.map((s) => s.displayName).join(", ") : "waiting for trigger"} accent={readySignals.length > 0} />
            <StatCard label="Avg. win rate" value={`${(avgWinRate * 100).toFixed(1)}%`} />
          </div>
        )}

        {/* Strong Signals Dashboard */}
        {strongSignals.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black">🎯 EMPIRETRADER · Strong Stable Signals</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold uppercase tracking-widest">Hysteresis-locked</span>
                </div>
                <p className="text-sm text-white/50 mt-1">
                  These signals are locked in until a break condition is met (3 losses in a row, &gt;12% drop from peak, or win rate falling below 58%).
                </p>
              </div>
              {strongSignals.length >= 2 && (
                <button
                  onClick={exportAllStrong}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-emerald-500/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/15 transition"
                >
                  {copiedKey === "__all__" ? (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12" /></svg> ✅ Copied all</>
                  ) : (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> 📡 Copy all signals</>
                  )}
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {strongSignals.map((a) => (
                <StrongSignalCard
                  key={a.symbol}
                  analysis={a}
                  trade={selectedTrade}
                  copied={copiedKey === a.symbol}
                  onCopy={() => copyBotConfig(a)}
                  onBroadcast={() => handleBroadcast(a)}
                  cooldownSec={selectedTrade ? remainingCooldown(a.symbol, selectedTrade.id, broadcastCfg.filters.cooldownSeconds) : 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* Bot Export Panel */}
        {showBotPanel && strongSignals.length > 0 && selectedTrade && (
          <BotExportPanel signals={strongSignals} trade={selectedTrade} copiedKey={copiedKey} onCopy={copyBotConfig} />
        )}

        {/* Market groups */}
        {MARKET_GROUPS.map((group) => {
          const groupAnalyses = group.symbols.map((s) => analyses[s.symbol]).filter(Boolean);
          return (
            <section key={group.id} className="mb-10">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-black">{group.label}</h2>
                  <p className="text-sm text-white/50">{group.description}</p>
                </div>
                <div className="text-xs font-mono text-emerald-400/80">
                  {groupAnalyses.length}/{group.symbols.length} live
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {group.symbols.map((s) => (
                  <MarketCard key={s.symbol} analysis={analyses[s.symbol]} trade={selectedTrade} onCopy={() => copyBotConfig(analyses[s.symbol])} copied={copiedKey === s.symbol} />
                ))}
              </div>
            </section>
          );
        })}

        {Object.keys(analyses).length === 0 && !analyzing && (
          <div className="rounded-3xl border border-dashed border-emerald-500/20 bg-white/[0.02] p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 grid place-items-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7 text-emerald-300">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Ready to scan 15 markets</h3>
            <p className="text-white/50 max-w-md mx-auto text-sm">
              Select a trade type above and click <span className="text-emerald-300 font-semibold">Analyze now</span>. The analyzer will lock onto strong signals and keep them stable until explicit break conditions trigger.
            </p>
          </div>
        )}

        <footer className="mt-16 pt-8 border-t border-emerald-500/10 text-center text-white/40 text-xs">
          Data streamed live from Deriv WebSocket API · EMPIRETRADER provides analysis only — not financial advice.
        </footer>
      </main>

      {/* Broadcast Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={(c) => {
          setBroadcastCfg(c);
          showToast("ok", "Broadcast settings saved");
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)]">
          <div
            className={`rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-lg flex items-start gap-3 ${
              toast.kind === "ok"
                ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-100"
                : "bg-red-500/15 border-red-400/40 text-red-100"
            }`}
          >
            <div className={`mt-0.5 w-6 h-6 rounded-full grid place-items-center shrink-0 ${
              toast.kind === "ok" ? "bg-emerald-500/30" : "bg-red-500/30"
            }`}>
              {toast.kind === "ok" ? "✅" : "⚠️"}
            </div>
            <div className="flex-1 text-sm leading-snug">{toast.text}</div>
            <button
              onClick={() => setToast(null)}
              className="text-white/40 hover:text-white/80 shrink-0"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function TradeGroup({ label, items, selected, onSelect }: { label: string; items: TradeType[]; selected: TradeType | null; onSelect: (t: TradeType) => void }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-bold mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => {
          const active = selected?.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              title={t.description}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                active
                  ? "bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] border-emerald-400 shadow-lg shadow-emerald-500/30 scale-[1.02]"
                  : "bg-white/[0.03] text-white border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StrongSignalCard({
  analysis,
  trade,
  copied,
  onCopy,
  onBroadcast,
  cooldownSec,
}: {
  analysis: SymbolAnalysis;
  trade: TradeType | null;
  copied: boolean;
  onCopy: () => void;
  onBroadcast: () => void;
  cooldownSec: number;
}) {
  const s = analysis.stability;
  const entry = analysis.bestEntry;
  const isStrong = analysis.signal === "strong";
  const isAtRisk = s.willBreakSoon;

  return (
    <div
      className={`relative rounded-2xl border p-5 overflow-hidden ${
        isStrong
          ? isAtRisk
            ? "border-amber-400/50 bg-gradient-to-br from-amber-500/10 via-emerald-500/10 to-transparent"
            : "border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-green-500/10 to-transparent"
          : "border-lime-400/40 bg-gradient-to-br from-lime-500/15 via-emerald-500/5 to-transparent"
      }`}
    >
      {/* Animated glow for strong */}
      {isStrong && !isAtRisk && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-400/30 rounded-full blur-3xl animate-pulse pointer-events-none" />
      )}
      {isAtRisk && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-400/30 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{analysis.group}</div>
            <div className="font-black text-lg">{analysis.displayName}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${
              isAtRisk ? "bg-amber-400 text-amber-950" : isStrong ? "bg-emerald-500 text-emerald-950" : "bg-lime-400 text-lime-950"
            }`}>
              {isAtRisk ? "AT RISK" : isStrong ? "LOCKED" : "GOOD"}
            </div>
            <WinRing rate={analysis.winRate} size={36} />
          </div>
        </div>

        {/* Best entry */}
        {entry && (
          <div className="mb-4 rounded-xl bg-black/30 border border-emerald-500/30 p-3">
            <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold mb-1.5 flex items-center justify-between">
              <span>Best entry point</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                entry.confidence === "high" ? "bg-emerald-500 text-emerald-950" :
                entry.confidence === "medium" ? "bg-lime-400 text-lime-950" :
                "bg-white/10 text-white/60"
              }`}>
                {entry.confidence.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <EntryVisual entry={entry} />
              <div className="text-right">
                <div className="text-xl font-black bg-gradient-to-br from-lime-300 to-emerald-500 bg-clip-text text-transparent leading-none">
                  {(entry.winRate * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-white/50 font-mono">{entry.sampleSize} trades</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-white/60 leading-snug">{entry.description}</div>
            {/* Window / TTL banner */}
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-transparent p-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-0.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                ⚡ Window: {entry.windowLabel}
              </div>
              <div className="text-[10px] text-white/60 leading-snug pl-[14px]">
                {entry.windowRule}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              {entry.currentlyMatches ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ENTRY READY — next tick
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                  Last triggered {entry.ticksSinceMatch} tick{entry.ticksSinceMatch === 1 ? "" : "s"} ago
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stability bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
            <span>Stability</span>
            <span className="text-white/70">{s.statusLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-black/30 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isAtRisk ? "bg-gradient-to-r from-amber-400 to-red-400" : "bg-gradient-to-r from-emerald-500 to-lime-400"
              }`}
              style={{ width: `${Math.round(s.stabilityScore * 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-white/50 mt-1">{s.reasonLabel}</div>
        </div>

        {/* Break conditions */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          <BreakChip
            label="Losses"
            value={`${s.breakConditions.consecutiveLosses}/${s.breakConditions.maxConsecutiveLosses}`}
            danger={s.breakConditions.consecutiveLosses >= 2}
          />
          <BreakChip
            label="Drop"
            value={`${(s.breakConditions.winRateDropFromPeak * 100).toFixed(0)}%/${(s.breakConditions.maxAllowedDrop * 100).toFixed(0)}%`}
            danger={s.breakConditions.winRateDropFromPeak > s.breakConditions.maxAllowedDrop * 0.7}
          />
          <BreakChip
            label="Locked"
            value={s.level === "strong" ? `${s.lockedDurationTicks}t` : "—"}
            danger={false}
            positive={s.lockedDurationTicks >= 20}
          />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onBroadcast}
            disabled={cooldownSec > 0}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] text-xs font-bold shadow-md shadow-emerald-500/30 hover:shadow-emerald-400/50 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            title={cooldownSec > 0 ? `Cooldown ${cooldownSec}s` : "Send this signal now to Telegram/Webhook"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {cooldownSec > 0 ? `Wait ${cooldownSec}s` : "📡 Broadcast"}
          </button>
          <button
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/25 transition"
          >
            {copied ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12" /></svg> ✅ Copied</>
            ) : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> 📋 Copy</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketCard({ analysis, trade, onCopy, copied }: { analysis?: SymbolAnalysis; trade: TradeType | null; onCopy: () => void; copied: boolean }) {
  if (!analysis) {
    return (
      <div className="rounded-2xl border border-emerald-500/10 bg-white/[0.02] p-5 h-full">
        <div className="text-xs text-white/40 font-mono">awaiting data…</div>
      </div>
    );
  }
  const winPct = (analysis.winRate * 100).toFixed(1);
  const isStrong = analysis.signal === "strong";
  const isGood = analysis.signal === "good";
  const isBroken = analysis.signal === "broken";

  const signalColor = isStrong
    ? "from-emerald-500/30 to-green-500/10 border-emerald-400/40"
    : isGood
    ? "from-lime-500/25 to-emerald-500/10 border-lime-400/40"
    : isBroken
    ? "from-amber-500/15 to-red-500/5 border-amber-500/30"
    : analysis.signal === "neutral"
    ? "from-white/5 to-white/[0.02] border-white/10"
    : "from-red-500/10 to-transparent border-red-500/20";

  const signalBadge = isStrong
    ? "bg-emerald-500 text-emerald-950"
    : isGood
    ? "bg-lime-400 text-lime-950"
    : isBroken
    ? "bg-amber-400 text-amber-950"
    : analysis.signal === "neutral"
    ? "bg-white/20 text-white/80"
    : "bg-red-500/70 text-red-50";

  const maxDigit = Math.max(...analysis.lastDigitDist, 1);

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 transition-all hover:scale-[1.02] ${signalColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{analysis.group}</div>
          <div className="font-bold text-base">{analysis.displayName}</div>
        </div>
        <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${signalBadge}`}>{analysis.signal.toUpperCase()}</div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <WinRing rate={analysis.winRate} />
        <div className="flex-1">
          <div className="text-2xl font-black bg-gradient-to-br from-lime-300 to-emerald-500 bg-clip-text text-transparent">{winPct}%</div>
          <div className="text-[11px] text-white/50">{analysis.wins}W · {analysis.losses}L</div>
        </div>
      </div>

      {/* Best entry mini */}
      {analysis.bestEntry ? (
        <div className="mb-3 rounded-lg bg-black/25 border border-emerald-500/20 p-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-widest text-emerald-300/80 font-bold">Best entry</div>
            <div className="text-[10px] text-white/50 font-mono">{(analysis.bestEntry.winRate * 100).toFixed(0)}% · {analysis.bestEntry.sampleSize}n</div>
          </div>
          <div className="mt-1">
            <EntryVisual entry={analysis.bestEntry} compact />
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[9px] text-amber-300/90 font-semibold">
            <span>⚡</span>
            <span className="truncate">{analysis.bestEntry.windowLabel}</span>
          </div>
          {analysis.entryReady && (
            <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 text-[9px] font-bold">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> TRIGGER NOW
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 rounded-lg bg-black/25 border border-white/5 p-2.5 text-[11px] text-white/40">
          Collecting entry data…
        </div>
      )}

      <div className="flex items-center justify-between text-xs mb-3 py-2 px-2.5 rounded-lg bg-black/20 border border-white/5">
        <div>
          <div className="text-white/40 text-[10px] uppercase tracking-wider">Price</div>
          <div className="font-mono font-bold">{analysis.lastPrice?.toFixed(2) ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-white/40 text-[10px] uppercase tracking-wider">Last digit</div>
          <div className="font-mono font-bold text-emerald-300">{analysis.lastDigit ?? "—"}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
          <span>Digits</span>
          <span>{analysis.totalTicks}t</span>
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {analysis.lastDigitDist.map((c, d) => {
            const intensity = c / maxDigit;
            const isTarget = isTargetDigit(d, trade);
            return (
              <div key={d} className="flex flex-col items-center gap-1">
                <div
                  className="w-full h-8 rounded-sm transition-all"
                  style={{
                    backgroundColor: isTarget
                      ? `rgba(132, 204, 22, ${0.2 + intensity * 0.7})`
                      : `rgba(16, 185, 129, ${0.1 + intensity * 0.5})`,
                    boxShadow: isTarget && intensity > 0.4 ? "0 0 8px rgba(163, 230, 53, 0.6)" : "none",
                  }}
                  title={`${d}: ${c}`}
                />
                <div className="text-[9px] font-mono text-white/50">{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
          <span>Recent</span>
          <span className={analysis.currentStreak > 0 ? "text-emerald-300" : analysis.currentStreak < 0 ? "text-red-300" : ""}>
            {analysis.currentStreak > 0 ? `${analysis.currentStreak}W streak` : analysis.currentStreak < 0 ? `${-analysis.currentStreak}L streak` : "—"}
          </span>
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {analysis.recentOutcomes.slice(-30).map((o, i) => (
            <div key={i} className={`flex-1 min-w-[6px] h-4 rounded-sm ${o ? "bg-gradient-to-t from-emerald-500 to-lime-400" : "bg-white/10"}`} />
          ))}
        </div>
      </div>

      {analysis.bestEntry && (
        <button
          onClick={onCopy}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/70 text-[10px] font-semibold hover:bg-emerald-500/15 hover:border-emerald-400/30 hover:text-emerald-200 transition"
        >
          {copied ? (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><polyline points="20 6 9 17 4 12" /></svg> ✅</>
          ) : (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy</>
          )}
        </button>
      )}
    </div>
  );
}

function EntryVisual({ entry, compact = false }: { entry: EntryPoint; compact?: boolean }) {
  if (entry.type === "digit") {
    return (
      <div className="flex items-center gap-2">
        <div className={`${compact ? "w-8 h-8 text-base" : "w-10 h-10 text-lg"} rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400 text-[#04130b] font-black grid place-items-center shadow-md shadow-emerald-500/30`}>
          {entry.value}
        </div>
        {!compact && (
          <div className="text-[11px] text-white/60 leading-tight">
            <div className="font-semibold text-white">After digit {entry.value as number}</div>
            <div>Place trade on next tick</div>
          </div>
        )}
      </div>
    );
  }
  if (entry.type === "pattern") {
    const digits = entry.value as number[];
    return (
      <div className="flex items-center gap-1.5">
        {digits.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`${compact ? "w-7 h-7 text-sm" : "w-8 h-8 text-base"} rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400 text-[#04130b] font-black grid place-items-center shadow-sm`}>
              {d}
            </div>
            {i < digits.length - 1 && <span className="text-emerald-400/60 text-xs">→</span>}
          </div>
        ))}
        {!compact && (
          <div className="ml-1 text-[11px] text-white/60 leading-tight">
            <div className="font-semibold text-white">After pattern</div>
            <div>Then trade next tick</div>
          </div>
        )}
      </div>
    );
  }
  if (entry.type === "parity-run") {
    const runLen = entry.value as number;
    const parity = entry.label.includes("even") ? "even" : "odd";
    return (
      <div className="flex items-center gap-2">
        <div className={`${compact ? "w-8 h-8" : "w-10 h-10"} rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400 text-[#04130b] font-black grid place-items-center shadow-md shadow-emerald-500/30 ${compact ? "text-[10px]" : "text-xs"}`}>
          {runLen}+
        </div>
        {!compact && (
          <div className="text-[11px] text-white/60 leading-tight">
            <div className="font-semibold text-white">{runLen}+ {parity} in a row</div>
            <div>Then trade next tick</div>
          </div>
        )}
      </div>
    );
  }
  if (entry.type === "direction-run") {
    const runLen = entry.value as number;
    const up = entry.label.includes("up");
    return (
      <div className="flex items-center gap-2">
        <div className={`${compact ? "w-8 h-8" : "w-10 h-10"} rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400 text-[#04130b] font-black grid place-items-center shadow-md shadow-emerald-500/30 ${compact ? "text-[10px]" : "text-xs"}`}>
          {up ? "↑" : "↓"}{runLen}
        </div>
        {!compact && (
          <div className="text-[11px] text-white/60 leading-tight">
            <div className="font-semibold text-white">{runLen}+ {up ? "rising" : "falling"} ticks</div>
            <div>Then trade next tick</div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

function BreakChip({ label, value, danger, positive }: { label: string; value: string; danger: boolean; positive?: boolean }) {
  return (
    <div className={`rounded-md px-2 py-1.5 text-center border ${
      danger ? "bg-red-500/15 border-red-500/40 text-red-300" :
      positive ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200" :
      "bg-white/5 border-white/10 text-white/70"
    }`}>
      <div className="text-[9px] uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-xs font-bold font-mono">{value}</div>
    </div>
  );
}

function BotExportPanel({
  signals,
  trade,
  copiedKey,
  onCopy,
}: {
  signals: SymbolAnalysis[];
  trade: TradeType;
  copiedKey: string | null;
  onCopy: (a: SymbolAnalysis) => void;
}) {
  return (
    <section className="mb-10 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#0a2818] to-[#04130b] p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 grid place-items-center text-emerald-300 text-lg">
              🤖
            </div>
            <h3 className="text-xl font-black">Bot Broadcast Preview</h3>
          </div>
          <p className="text-sm text-white/60">
            Each card below is what your Deriv DBot / DTrader will receive when you click <span className="text-emerald-300 font-semibold">Copy</span>. It's an emoji-rich, bot-style message — ready to paste anywhere.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {signals.map((a) => {
          if (!a.bestEntry) return null;
          const msg = toBotMessage(a, trade.label);
          return (
            <div key={a.symbol} className="rounded-xl border border-emerald-500/20 bg-black/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-emerald-500/15 to-lime-500/10 border-b border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <span className="text-sm">📡</span>
                  <span className="font-bold">{a.displayName}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    a.signal === "strong" ? "bg-emerald-500 text-emerald-950" : "bg-lime-400 text-lime-950"
                  }`}>
                    {a.signal === "strong" ? "🔒 STRONG" : "✅ GOOD"}
                  </span>
                  {a.entryReady && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-red-50 animate-pulse">🚨 READY</span>
                  )}
                </div>
                <button
                  onClick={() => onCopy(a)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/40 transition"
                >
                  {copiedKey === a.symbol ? "✅ Copied" : "📋 Copy message"}
                </button>
              </div>
              <pre className="text-[11px] text-emerald-50/90 p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
{msg}
              </pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function isTargetDigit(digit: number, trade: TradeType | null): boolean {
  if (!trade) return false;
  if (trade.category === "over-under") {
    if (trade.direction === "over" && trade.threshold !== undefined) return digit > trade.threshold;
    if (trade.direction === "under" && trade.threshold !== undefined) return digit < trade.threshold;
  }
  if (trade.category === "even-odd") {
    if (trade.parity === "even") return digit % 2 === 0;
    if (trade.parity === "odd") return digit % 2 !== 0;
  }
  return false;
}

function WinRing({ rate, size = 48 }: { rate: number; size?: number }) {
  const pct = Math.min(1, Math.max(0, rate));
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 to-transparent" : "border-emerald-500/10 bg-white/[0.02]"}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">{label}</div>
      <div className={`text-xl font-black ${accent ? "text-emerald-300" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/50 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { color: string; label: string }> = {
    open: { color: "bg-emerald-500", label: "Connected" },
    connecting: { color: "bg-yellow-400", label: "Connecting…" },
    closed: { color: "bg-white/30", label: "Idle" },
    error: { color: "bg-red-500", label: "Error" },
  };
  const m = map[status];
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold">
      <span className="relative flex w-2 h-2">
        {(status === "open" || status === "connecting") && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${m.color} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${m.color}`} />
      </span>
      {m.label}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
