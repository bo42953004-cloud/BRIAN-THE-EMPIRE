import type { SymbolAnalysis } from "./analysis";
import type { TradeType } from "./constants";
import { TRADING_SITE_URL } from "./constants";

// ------------------------------
// Broadcast config (stored in localStorage on the client)
// ------------------------------

export interface BroadcastConfig {
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
  webhook: {
    enabled: boolean;
    url: string;
    /** Optional secret header for your webhook */
    secret: string;
    label: string; // e.g. "WhatsApp (CallMeBot)"
  };
  filters: {
    /** Minimum confidence to broadcast: high | medium | low */
    minConfidence: "high" | "medium" | "low";
    /** Only broadcast signals that are strong (skip "good") */
    strongOnly: boolean;
    /** Cooldown seconds per (symbol, tradeType) pair */
    cooldownSeconds: number;
  };
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  telegram: { enabled: false, botToken: "", chatId: "" },
  webhook: { enabled: false, url: "", secret: "", label: "WhatsApp (webhook)" },
  filters: {
    minConfidence: "high",
    strongOnly: true,
    cooldownSeconds: 60,
  },
};

const STORAGE_KEY = "empiretrader.broadcast.config.v1";

export function loadBroadcastConfig(): BroadcastConfig {
  if (typeof window === "undefined") return DEFAULT_BROADCAST_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BROADCAST_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BROADCAST_CONFIG, ...parsed };
  } catch {
    return DEFAULT_BROADCAST_CONFIG;
  }
}

export function saveBroadcastConfig(cfg: BroadcastConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

// ------------------------------
// Cooldown tracking
// ------------------------------

const cooldownMap = new Map<string, number>(); // key -> epoch ms of last broadcast

export function isOnCooldown(symbol: string, tradeId: string, cooldownSeconds: number): boolean {
  const key = `${symbol}:${tradeId}`;
  const last = cooldownMap.get(key) ?? 0;
  return Date.now() - last < cooldownSeconds * 1000;
}

export function markBroadcast(symbol: string, tradeId: string) {
  cooldownMap.set(`${symbol}:${tradeId}`, Date.now());
}

export function remainingCooldown(symbol: string, tradeId: string, cooldownSeconds: number): number {
  const key = `${symbol}:${tradeId}`;
  const last = cooldownMap.get(key) ?? 0;
  const remaining = cooldownSeconds * 1000 - (Date.now() - last);
  return Math.max(0, Math.ceil(remaining / 1000));
}

// ------------------------------
// Telegram HTML formatter
// ------------------------------

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function entryHtml(a: SymbolAnalysis): string {
  const e = a.bestEntry;
  if (!e) return "<i>no entry</i>";
  if (e.type === "digit") return `🔢 After digit <b>${esc(e.value as number)}</b>`;
  if (e.type === "pattern") return `🔗 Pattern <code>${esc((e.value as number[]).join(" → "))}</code>`;
  if (e.type === "parity-run") {
    const parity = e.label.includes("even") ? "even" : "odd";
    return `♻️ <b>${esc(e.value as number)}+</b> ${parity} in a row`;
  }
  if (e.type === "direction-run") {
    const up = e.label.includes("up");
    return `${up ? "📈" : "📉"} <b>${esc(e.value as number)}+</b> ${up ? "up" : "down"} ticks`;
  }
  return esc(e.label);
}

function confidenceBadge(c: "high" | "medium" | "low"): string {
  return c === "high" ? "💎 HIGH" : c === "medium" ? "🟢 MEDIUM" : "🟡 LOW";
}

function signalBadge(level: string): string {
  return level === "strong" ? "🔒 STRONG" : level === "good" ? "✅ GOOD" : "➖ " + level.toUpperCase();
}

/**
 * Format an HTML message suitable for Telegram (supports parse_mode=HTML).
 */
export function toTelegramHtml(a: SymbolAnalysis, trade: TradeType): string {
  const e = a.bestEntry;
  if (!e) return "";
  const winPct = (e.winRate * 100).toFixed(1);
  const overallPct = (a.winRate * 100).toFixed(1);
  const stabPct = Math.round(a.stability.stabilityScore * 100);
  const bc = a.stability.breakConditions;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return [
    `<b>👑 EMPIRETRADER · LIVE SIGNAL ${a.entryReady ? "🚨" : ""}</b>`,
    ``,
    `🎯 <b>Trade:</b> ${esc(trade.label)}`,
    `📊 <b>Market:</b> ${esc(a.displayName)}  <code>${esc(a.symbol)}</code>`,
    `🏷️ <b>Group:</b> ${esc(a.group)}`,
    ``,
    `${entryHtml(a)}`,
    `⚡ <b>Window:</b> ${esc(e.windowLabel)}`,
    `<i>💡 ${esc(e.windowRule)}</i>`,
    ``,
    `📈 <b>Entry win:</b> ${esc(winPct)}%  (${esc(e.wins)}W · ${esc(e.losses)}L)`,
    `🧪 <b>Sample:</b> ${esc(e.sampleSize)} trades`,
    `${confidenceBadge(e.confidence)}`,
    `📊 <b>Overall:</b> ${esc(overallPct)}%  (${esc(a.totalTicks)} ticks)`,
    `🏆 <b>Best streak:</b> ${esc(a.bestStreak)} wins`,
    `🔥 <b>Current:</b> ${a.currentStreak > 0 ? `${esc(a.currentStreak)}W streak` : a.currentStreak < 0 ? `${esc(-a.currentStreak)}L streak` : "—"}`,
    ``,
    `${signalBadge(a.signal)}  ⚡ Stability ${esc(stabPct)}%`,
    a.stability.level === "strong" && a.stability.lockedDurationTicks > 0
      ? `⏱️ <b>Locked:</b> ${esc(a.stability.lockedDurationTicks)} ticks`
      : "",
    ``,
    `⚠️ <b>Break if:</b>`,
    `• ${esc(bc.consecutiveLosses)}/${esc(bc.maxConsecutiveLosses)} losses in a row`,
    `• ${(bc.winRateDropFromPeak * 100).toFixed(0)}% / ${(bc.maxAllowedDrop * 100).toFixed(0)}% drop`,
    `• Win rate <b>&lt;${(bc.minWinRate * 100).toFixed(0)}%</b>`,
    ``,
    a.entryReady
      ? `💬 <b>✅ Entry matched — trade on the NEXT tick!</b>`
      : `💬 ⏳ Last trigger ${esc(e.ticksSinceMatch)} ticks ago`,
    ``,
    `🌐 <b>Trade live on</b> <a href="${TRADING_SITE_URL}">the-empiretrader.site</a>`,
    ``,
    `<i>🕐 ${esc(now)} · 👑 EMPIRETRADER · LIVE SIGNALS BOT</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Plain-text version (used for webhooks / WhatsApp that doesn't support HTML).
 */
export function toWebhookText(a: SymbolAnalysis, trade: TradeType): string {
  const e = a.bestEntry;
  if (!e) return "";
  const winPct = (e.winRate * 100).toFixed(1);
  const overallPct = (a.winRate * 100).toFixed(1);
  const stabPct = Math.round(a.stability.stabilityScore * 100);
  const bc = a.stability.breakConditions;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const entryText =
    e.type === "digit" ? `After digit ${e.value}` :
    e.type === "pattern" ? `Pattern [${(e.value as number[]).join("→")}]` :
    e.type === "parity-run" ? `${e.value}+ ${e.label.includes("even") ? "even" : "odd"} in a row` :
    e.type === "direction-run" ? `${e.value}+ ${e.label.includes("up") ? "up" : "down"} ticks` :
    e.label;

  return [
    `*EMPIRETRADER LIVE SIGNAL* ${a.entryReady ? "🚨" : ""}`,
    ``,
    `🎯 Trade: ${trade.label}`,
    `📊 Market: ${a.displayName} (${a.symbol})`,
    `🏷️ Group: ${a.group}`,
    ``,
    `🎯 ${entryText}`,
    `⚡ Window: ${e.windowLabel}`,
    `💡 ${e.windowRule}`,
    ``,
    `📈 Entry win: ${winPct}% (${e.wins}W · ${e.losses}L)`,
    `🧪 Sample: ${e.sampleSize} trades  (${e.confidence.toUpperCase()})`,
    `📊 Overall: ${overallPct}%`,
    `🏆 Best streak: ${a.bestStreak} wins`,
    ``,
    `🔒 ${a.signal.toUpperCase()} · Stability ${stabPct}%`,
    ``,
    `⚠️ Break if: ${bc.consecutiveLosses}/${bc.maxConsecutiveLosses} losses OR >${(bc.maxAllowedDrop * 100).toFixed(0)}% drop`,
    ``,
    a.entryReady ? `✅ ENTRY MATCHED — trade NEXT tick` : `⏳ Last trigger ${e.ticksSinceMatch} ticks ago`,
    ``,
    `🌐 Trade live on: ${TRADING_SITE_URL}`,
    ``,
    `🕐 ${now} · 👑 EMPIRETRADER · LIVE SIGNALS BOT`,
  ].join("\n");
}

// ------------------------------
// Send helpers (call server-side route)
// ------------------------------

export interface BroadcastResult {
  telegram?: { ok: boolean; error?: string };
  webhook?: { ok: boolean; error?: string };
}

export async function broadcastSignal(
  cfg: BroadcastConfig,
  a: SymbolAnalysis,
  trade: TradeType
): Promise<BroadcastResult> {
  const body = {
    telegram: cfg.telegram.enabled
      ? { botToken: cfg.telegram.botToken, chatId: cfg.telegram.chatId, html: toTelegramHtml(a, trade) }
      : null,
    webhook: cfg.webhook.enabled
      ? { url: cfg.webhook.url, secret: cfg.webhook.secret, text: toWebhookText(a, trade) }
      : null,
  };
  const res = await fetch("/api/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Broadcast failed (${res.status})`);
  }
  return res.json();
}

// ------------------------------
// Top-signals summary (40-min auto-scan broadcast)
// ------------------------------

export interface RankedSignal {
  analysis: SymbolAnalysis;
  trade: TradeType;
  rank: number;
}

function medalFor(i: number): string {
  if (i === 0) return "🏆";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `#${i + 1}`;
}

function rankSignalText(e: NonNullable<SymbolAnalysis["bestEntry"]>): string {
  if (e.type === "digit") return `After digit ${e.value}`;
  if (e.type === "pattern") return `Pattern [${(e.value as number[]).join("→")}]`;
  if (e.type === "parity-run") {
    const parity = e.label.includes("even") ? "even" : "odd";
    return `${e.value}+ ${parity}`;
  }
  if (e.type === "direction-run") {
    const up = e.label.includes("up");
    return `${e.value}+ ${up ? "up" : "down"}`;
  }
  return e.label;
}

function signalLevelEmoji(level: string): string {
  return level === "strong" ? "🔒" : level === "good" ? "✅" : "➖";
}

/**
 * Build a Telegram HTML summary for the top N signals across all scanned markets + trade types.
 */
export function toTopSignalsHtml(signals: RankedSignal[], nextScanInMs: number): string {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const mins = Math.max(0, Math.floor(nextScanInMs / 60000));

  const lines: string[] = [];
  lines.push(`<b>👑 EMPIRETRADER · TOP SIGNALS</b>`);
  lines.push(`🕐 <i>Scan complete at ${esc(now)}</i>`);
  lines.push(``);

  if (signals.length === 0) {
    lines.push(`<i>No strong signals right now. Check back soon.</i>`);
  } else {
    signals.forEach((s, i) => {
      const e = s.analysis.bestEntry;
      if (!e) return;
      const winPct = (e.winRate * 100).toFixed(1);
      lines.push(
        `<b>${medalFor(i)} ${esc(s.analysis.displayName)} · ${esc(s.trade.label)}</b>`
      );
      lines.push(
        `   🎯 ${esc(rankSignalText(e))} · <b>${esc(winPct)}%</b> win (${esc(e.sampleSize)} trades)`
      );
      lines.push(
        `   ⚡ ${esc(e.windowLabel)}`
      );
      lines.push(
        `   ${signalLevelEmoji(s.analysis.signal)} ${s.analysis.signal.toUpperCase()} · 💎 ${esc(e.confidence)}`
      );
      lines.push(``);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🌐 <b>Place your trades live on</b>`);
  lines.push(`👉 <a href="${TRADING_SITE_URL}">the-empiretrader.site</a>`);
  lines.push(``);
  lines.push(`⏱️ <b>Next auto-scan in ${mins} minutes</b>`);
  lines.push(`<i>👑 EMPIRETRADER · LIVE SIGNALS BOT</i>`);
  return lines.join("\n");
}

/**
 * Plain-text version for webhooks.
 */
export function toTopSignalsText(signals: RankedSignal[], nextScanInMs: number): string {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const mins = Math.max(0, Math.floor(nextScanInMs / 60000));

  const lines: string[] = [];
  lines.push(`*EMPIRETRADER · TOP SIGNALS*`);
  lines.push(`🕐 Scan complete at ${now}`);
  lines.push(``);

  if (signals.length === 0) {
    lines.push(`No strong signals right now. Check back soon.`);
  } else {
    signals.forEach((s, i) => {
      const e = s.analysis.bestEntry;
      if (!e) return;
      const winPct = (e.winRate * 100).toFixed(1);
      lines.push(`${medalFor(i)} ${s.analysis.displayName} · ${s.trade.label}`);
      lines.push(`   🎯 ${rankSignalText(e)} · ${winPct}% win (${e.sampleSize} trades)`);
      lines.push(`   ⚡ ${e.windowLabel}`);
      lines.push(`   ${signalLevelEmoji(s.analysis.signal)} ${s.analysis.signal.toUpperCase()} · ${e.confidence.toUpperCase()}`);
      lines.push(``);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🌐 Place your trades live on:`);
  lines.push(`👉 ${TRADING_SITE_URL}`);
  lines.push(``);
  lines.push(`⏱️ Next auto-scan in ${mins} minutes`);
  lines.push(`👑 EMPIRETRADER · LIVE SIGNALS BOT`);
  return lines.join("\n");
}

/**
 * Broadcast a top-signals summary (used by the 40-min auto-scan).
 */
export async function broadcastTopSignals(
  cfg: BroadcastConfig,
  signals: RankedSignal[],
  nextScanInMs: number
): Promise<BroadcastResult> {
  const body = {
    telegram: cfg.telegram.enabled
      ? {
          botToken: cfg.telegram.botToken,
          chatId: cfg.telegram.chatId,
          html: toTopSignalsHtml(signals, nextScanInMs),
        }
      : null,
    webhook: cfg.webhook.enabled
      ? {
          url: cfg.webhook.url,
          secret: cfg.webhook.secret,
          text: toTopSignalsText(signals, nextScanInMs),
        }
      : null,
  };
  const res = await fetch("/api/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Broadcast failed (${res.status})`);
  }
  return res.json();
}
