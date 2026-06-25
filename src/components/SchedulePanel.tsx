"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullScanner } from "@/lib/fullScanner";
import { AUTO_SCAN_INTERVAL_MS } from "@/lib/constants";
import type { BroadcastConfig } from "@/lib/broadcast";
import { broadcastTopSignals, type RankedSignal } from "@/lib/broadcast";

export default function SchedulePanel({
  broadcastCfg,
  onToast,
}: {
  broadcastCfg: BroadcastConfig;
  onToast: (kind: "ok" | "err", text: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nextScanAt, setNextScanAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [topSignals, setTopSignals] = useState<RankedSignal[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);

  const scannerRef = useRef<FullScanner | null>(null);
  const tickRef = useRef(0);

  // Tick every second to update countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshSignals = useCallback(() => {
    const s = scannerRef.current;
    if (!s) return;
    const top = s.getTopSignals(5);
    setTopSignals(top);
    setTotalScanned(s.getAllSnapshots().length);
    tickRef.current += 1;
  }, []);

  const sendTopSignals = useCallback(
    async (reason: "scheduled" | "manual") => {
      if (!scannerRef.current) return;
      if (!broadcastCfg.telegram.enabled && !broadcastCfg.webhook.enabled) {
        onToast("err", "Enable Telegram or Webhook in settings first.");
        return;
      }
      setSending(true);
      try {
        refreshSignals();
        const nextIn = nextScanAt ? Math.max(0, nextScanAt - Date.now()) : AUTO_SCAN_INTERVAL_MS;
        const result = await broadcastTopSignals(broadcastCfg, topSignalsRef.current, nextIn);
        setLastSentAt(Date.now());
        const parts: string[] = [];
        if (result.telegram?.ok) parts.push("Telegram ✓");
        if (result.webhook?.ok) parts.push(`${broadcastCfg.webhook.label || "Webhook"} ✓`);
        if (parts.length) {
          onToast(
            "ok",
            `${reason === "scheduled" ? "⏰ Scheduled scan" : "🎯 Manual send"} delivered to ${parts.join(" + ")} · ${topSignalsRef.current.length} signals`
          );
        } else {
          const errs = [result.telegram?.error, result.webhook?.error].filter(Boolean).join(" | ");
          onToast("err", `Broadcast failed: ${errs || "unknown"}`);
        }
      } catch (e: any) {
        onToast("err", e?.message || "Broadcast failed");
      } finally {
        setSending(false);
      }
    },
    [broadcastCfg, onToast]
  );

  // Keep a stable ref to the latest topSignals so sendTopSignals uses fresh data.
  const topSignalsRef = useRef<RankedSignal[]>([]);
  useEffect(() => {
    topSignalsRef.current = topSignals;
  }, [topSignals]);

  // Start / stop the scanner when enabled changes.
  useEffect(() => {
    if (!enabled) {
      scannerRef.current?.stop();
      scannerRef.current = null;
      setNextScanAt(null);
      setTopSignals([]);
      setTotalScanned(0);
      return;
    }
    let cancelled = false;
    setScanning(true);
    const scanner = new FullScanner();
    scannerRef.current = scanner;
    scanner
      .start(() => {
        // Refresh top signals every 5 ticks to avoid re-renders on every tick.
        if (tickRef.current++ % 5 === 0) refreshSignals();
      })
      .then(() => {
        if (cancelled) return;
        setScanning(false);
        // Schedule the first scan 40 minutes from now.
        setNextScanAt((prev) => prev ?? Date.now() + AUTO_SCAN_INTERVAL_MS);
        refreshSignals();
      })
      .catch((e) => {
        if (cancelled) return;
        setScanning(false);
        onToast("err", `Scanner failed: ${e?.message || "unknown"}`);
      });

    return () => {
      cancelled = true;
      scanner.stop();
      scannerRef.current = null;
    };
  }, [enabled, refreshSignals, onToast]);

  // Check every second whether it's time to fire the scheduled scan.
  useEffect(() => {
    if (!enabled || !nextScanAt) return;
    if (now >= nextScanAt) {
      // Fire scheduled send.
      sendTopSignals("scheduled");
      // Advance the timer by 40 min WITHOUT resetting — keeps the cadence stable.
      setNextScanAt((prev) => (prev ?? now) + AUTO_SCAN_INTERVAL_MS);
    }
  }, [now, enabled, nextScanAt, sendTopSignals]);

  const handleManualSend = async () => {
    refreshSignals();
    await sendTopSignals("manual");
    // NOTE: we intentionally do NOT change nextScanAt here. The 40-min timer
    // keeps its original cadence so manual sends don't disrupt the schedule.
  };

  const msLeft = nextScanAt ? Math.max(0, nextScanAt - now) : 0;
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  const countdownStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const progress = nextScanAt ? 1 - msLeft / AUTO_SCAN_INTERVAL_MS : 0;

  const noChannels = !broadcastCfg.telegram.enabled && !broadcastCfg.webhook.enabled;

  return (
    <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#072015] to-[#04130b] p-5 md:p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 font-bold mb-1">
            🤖 Live Signals Bot
          </div>
          <div className="text-lg font-black">Auto-scan every 40 minutes</div>
          <div className="text-xs text-white/50 mt-1">
            Scans all 15 markets × all 12 trade types (180 combinations) and broadcasts the top signals to your Telegram channel.
          </div>
        </div>

        <button
          onClick={() => setEnabled((v) => !v)}
          disabled={noChannels}
          className={`relative inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border transition-all ${
            enabled
              ? "bg-red-500/15 border-red-400/40 text-red-200 hover:bg-red-500/25"
              : noChannels
              ? "bg-white/5 border-white/10 text-white/40 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] border-emerald-400 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50"
          }`}
        >
          {noChannels ? (
            <>⚠️ Set up a channel first</>
          ) : enabled ? (
            <>
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              Stop auto-scan
            </>
          ) : (
            <>▶️ Start auto-scan</>
          )}
        </button>
      </div>

      {/* Status panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-black/30 border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Status</div>
          <div className="flex items-center gap-2 mt-1">
            {scanning ? (
              <>
                <Spinner />
                <span className="text-sm text-white/80">Starting scanner…</span>
              </>
            ) : enabled ? (
              <>
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm text-emerald-300 font-semibold">Live · scanning</span>
              </>
            ) : (
              <span className="text-sm text-white/40">Idle</span>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-black/30 border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Next scan in</div>
          <div className="mt-1 font-mono text-2xl font-black bg-gradient-to-br from-lime-300 to-emerald-500 bg-clip-text text-transparent">
            {enabled ? countdownStr : "—:—"}
          </div>
          {enabled && (
            <div className="mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="rounded-xl bg-black/30 border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Coverage</div>
          <div className="mt-1 text-sm">
            <span className="font-black text-white">{enabled ? 15 : 0}</span>
            <span className="text-white/50"> markets · </span>
            <span className="font-black text-white">{enabled ? 12 : 0}</span>
            <span className="text-white/50"> trades</span>
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {enabled ? `${totalScanned} trackers live` : "Inactive"}
          </div>
        </div>
      </div>

      {/* Top signals preview */}
      {enabled && topSignals.length > 0 && (
        <div className="mb-4 rounded-xl bg-black/25 border border-emerald-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-widest text-emerald-300 font-bold">
              🏆 Current top signals
            </div>
            <div className="text-[10px] text-white/40 font-mono">
              live · updates every tick
            </div>
          </div>
          <div className="space-y-1.5">
            {topSignals.slice(0, 3).map((s, i) => (
              <div
                key={`${s.analysis.symbol}-${s.trade.id}`}
                className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5"
              >
                <div className="text-lg">{i === 0 ? "🏆" : i === 1 ? "🥈" : "🥉"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {s.analysis.displayName} · {s.trade.label}
                  </div>
                  <div className="text-[11px] text-white/50 truncate">
                    {s.analysis.bestEntry?.label}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-300 text-sm">
                    {((s.analysis.bestEntry?.winRate ?? 0) * 100).toFixed(1)}%
                  </div>
                  <div
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block ${
                      s.analysis.signal === "strong"
                        ? "bg-emerald-500 text-emerald-950"
                        : "bg-lime-400 text-lime-950"
                    }`}
                  >
                    {s.analysis.signal.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enabled && topSignals.length === 0 && !scanning && (
        <div className="mb-4 rounded-xl bg-black/25 border border-white/5 p-3 text-sm text-white/50">
          ⏳ Collecting data… Top signals will appear once enough ticks have been analyzed.
        </div>
      )}

      {/* Manual send */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleManualSend}
          disabled={!enabled || sending || topSignals.length === 0 || noChannels}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 text-[#04130b] font-bold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all"
        >
          {sending ? (
            <>
              <Spinner /> Sending…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              🎯 Send top signals now
            </>
          )}
        </button>
        {lastSentAt && (
          <div className="text-xs text-white/40">
            Last sent: {new Date(lastSentAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Note about timer cadence */}
      {enabled && (
        <div className="mt-3 text-[11px] text-white/40 leading-relaxed">
          💡 Manual sends don't reset the 40-minute timer — the scheduled scan keeps its original cadence.
        </div>
      )}
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
