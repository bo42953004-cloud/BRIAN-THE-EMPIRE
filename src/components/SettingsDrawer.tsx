"use client";

import { useEffect, useState } from "react";
import {
  type BroadcastConfig,
  DEFAULT_BROADCAST_CONFIG,
  loadBroadcastConfig,
  saveBroadcastConfig,
} from "@/lib/broadcast";

export default function SettingsDrawer({
  open,
  onClose,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  onChange: (cfg: BroadcastConfig) => void;
}) {
  const [cfg, setCfg] = useState<BroadcastConfig>(DEFAULT_BROADCAST_CONFIG);
  const [saved, setSaved] = useState(false);
  const [telegramTest, setTelegramTest] = useState<null | { ok: boolean; error?: string }>(null);
  const [webhookTest, setWebhookTest] = useState<null | { ok: boolean; error?: string }>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    if (open) {
      setCfg(loadBroadcastConfig());
      setSaved(false);
      setTelegramTest(null);
      setWebhookTest(null);
    }
  }, [open]);

  const update = <K extends keyof BroadcastConfig>(key: K, value: BroadcastConfig[K]) => {
    setCfg((c) => ({ ...c, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveBroadcastConfig(cfg);
    onChange(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const testTelegram = async () => {
    setTestingTelegram(true);
    setTelegramTest(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram: {
            botToken: cfg.telegram.botToken,
            chatId: cfg.telegram.chatId,
            html: `<b>👑 EMPIRETRADER · Test message</b>\n\n✅ Your Telegram bot is connected.\n\nSignals will appear here when triggered.\n\n<i>🌐 EMPIRETRADER</i>`,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      setTelegramTest(data.telegram ?? { ok: false, error: "no result" });
    } catch (e: any) {
      setTelegramTest({ ok: false, error: e?.message || "request failed" });
    } finally {
      setTestingTelegram(false);
    }
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTest(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: {
            url: cfg.webhook.url,
            secret: cfg.webhook.secret,
            text: `*EMPIRETRADER · Test message*\n\n✅ Webhook connected.\nSignals will arrive here when triggered.\n\n🌐 EMPIRETRADER`,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      setWebhookTest(data.webhook ?? { ok: false, error: "no result" });
    } catch (e: any) {
      setWebhookTest({ ok: false, error: e?.message || "request failed" });
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-gradient-to-b from-[#04130b] to-[#021008] border-l border-emerald-500/20 shadow-2xl shadow-emerald-500/10 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-emerald-500/10">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 font-bold">Broadcast settings</div>
            <div className="text-xl font-black">Send signals live</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center hover:bg-white/10 transition"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto h-[calc(100%-180px)] space-y-6">
          {/* Telegram */}
          <section className="rounded-2xl border border-emerald-500/20 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#229ED9]/20 border border-[#229ED9]/40 grid place-items-center text-[#229ED9] text-lg">
                  ✈️
                </div>
                <div>
                  <div className="font-bold">Telegram</div>
                  <div className="text-[11px] text-white/50">Groups & channels supported</div>
                </div>
              </div>
              <Toggle
                checked={cfg.telegram.enabled}
                onChange={(v) => update("telegram", { ...cfg.telegram, enabled: v })}
              />
            </div>

            <label className="block mb-3">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-1">Bot token</div>
              <input
                type="password"
                value={cfg.telegram.botToken}
                onChange={(e) => update("telegram", { ...cfg.telegram, botToken: e.target.value.trim() })}
                placeholder="1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono focus:border-emerald-400/50 focus:outline-none"
              />
              {cfg.telegram.botToken && !/^\d+:[A-Za-z0-9_-]+$/.test(cfg.telegram.botToken) && (
                <div className="mt-1 text-[11px] text-amber-300">⚠️ Token format looks off — should be <code className="text-amber-200">numbers:letters</code></div>
              )}
            </label>

            <label className="block mb-3">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-1">Chat ID</div>
              <input
                type="text"
                value={cfg.telegram.chatId}
                onChange={(e) => update("telegram", { ...cfg.telegram, chatId: e.target.value.trim() })}
                placeholder="-1001234567890 or @channelname"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono focus:border-emerald-400/50 focus:outline-none"
              />
              {cfg.telegram.chatId && (
                <div className="mt-1 text-[11px] text-white/40">
                  {/^@\w+$/.test(cfg.telegram.chatId)
                    ? "✓ Public channel username — OK"
                    : /^-?\d+$/.test(cfg.telegram.chatId)
                    ? /^-100/.test(cfg.telegram.chatId)
                      ? "✓ Channel/supergroup ID — OK"
                      : /^-\d+/.test(cfg.telegram.chatId)
                      ? "✓ Group ID — OK"
                      : "✓ User ID — OK"
                    : "⚠️ Chat ID should be @username or a number like -1001234567890"}
                </div>
              )}
            </label>

            <button
              onClick={testTelegram}
              disabled={!cfg.telegram.botToken || !cfg.telegram.chatId || testingTelegram}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#229ED9]/20 border border-[#229ED9]/40 text-[#7EC6EE] text-xs font-semibold hover:bg-[#229ED9]/30 disabled:opacity-40 transition"
            >
              {testingTelegram ? "Sending…" : "🧪 Send test message"}
            </button>

            {telegramTest && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                telegramTest.ok
                  ? "bg-emerald-500/15 border border-emerald-400/30 text-emerald-200"
                  : "bg-red-500/15 border border-red-400/30 text-red-200"
              }`}>
                {telegramTest.ok ? "✅ Test sent! Check your Telegram chat." : `❌ ${telegramTest.error}`}
              </div>
            )}

            <details className="mt-3 text-[11px] text-white/60">
              <summary className="cursor-pointer text-emerald-300 font-semibold hover:text-emerald-200">
                📘 How to get these (30 seconds)
              </summary>
              <ol className="mt-2 space-y-1 pl-4 list-decimal">
                <li>Open Telegram, search for <span className="text-emerald-300 font-mono">@BotFather</span>.</li>
                <li>Send <span className="text-emerald-300 font-mono">/newbot</span>, follow prompts. Copy the <b>bot token</b> above.</li>
                <li>Start a chat with your new bot, send it any message (e.g. <span className="text-emerald-300 font-mono">/start</span>).</li>
                <li>Visit <span className="text-emerald-300 font-mono break-all">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> in a browser. Find your <b>chat_id</b>.</li>
                <li>
                  For a <b>group</b>: add your bot to the group, mention it, then check the same URL. Use the negative chat ID (e.g. <span className="font-mono">-1001234567890</span>).
                </li>
                <li>For a <b>channel</b>: add the bot as admin, use <span className="font-mono">@channel_username</span> or the <span className="font-mono">-100...</span> ID.</li>
              </ol>
            </details>
          </section>

          {/* WhatsApp / Webhook */}
          <section className="rounded-2xl border border-emerald-500/20 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#25D366]/20 border border-[#25D366]/40 grid place-items-center text-[#25D366] text-lg">
                  💬
                </div>
                <div>
                  <div className="font-bold">WhatsApp / Webhook</div>
                  <div className="text-[11px] text-white/50">Any service that accepts POST</div>
                </div>
              </div>
              <Toggle
                checked={cfg.webhook.enabled}
                onChange={(v) => update("webhook", { ...cfg.webhook, enabled: v })}
              />
            </div>

            <label className="block mb-3">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-1">Service label</div>
              <input
                type="text"
                value={cfg.webhook.label}
                onChange={(e) => update("webhook", { ...cfg.webhook, label: e.target.value })}
                placeholder="WhatsApp (CallMeBot)"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-emerald-400/50 focus:outline-none"
              />
            </label>

            <label className="block mb-3">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-1">Webhook URL</div>
              <input
                type="url"
                value={cfg.webhook.url}
                onChange={(e) => update("webhook", { ...cfg.webhook, url: e.target.value.trim() })}
                placeholder="https://api.callmebot.com/whatsapp.php?phone=..."
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono focus:border-emerald-400/50 focus:outline-none"
              />
            </label>

            <label className="block mb-3">
              <div className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-1">Secret (optional)</div>
              <input
                type="password"
                value={cfg.webhook.secret}
                onChange={(e) => update("webhook", { ...cfg.webhook, secret: e.target.value })}
                placeholder="Sent as X-Webhook-Secret header"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono focus:border-emerald-400/50 focus:outline-none"
              />
            </label>

            <button
              onClick={testWebhook}
              disabled={!cfg.webhook.url || testingWebhook}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#25D366]/20 border border-[#25D366]/40 text-[#86EFA2] text-xs font-semibold hover:bg-[#25D366]/30 disabled:opacity-40 transition"
            >
              {testingWebhook ? "Sending…" : "🧪 Send test message"}
            </button>

            {webhookTest && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                webhookTest.ok
                  ? "bg-emerald-500/15 border border-emerald-400/30 text-emerald-200"
                  : "bg-red-500/15 border border-red-400/30 text-red-200"
              }`}>
                {webhookTest.ok ? "✅ Webhook accepted the test!" : `❌ ${webhookTest.error}`}
              </div>
            )}

            <details className="mt-3 text-[11px] text-white/60">
              <summary className="cursor-pointer text-emerald-300 font-semibold hover:text-emerald-200">
                📘 Which WhatsApp service to use?
              </summary>
              <ul className="mt-2 space-y-1.5 pl-4 list-disc">
                <li>
                  <b className="text-white">CallMeBot</b> (free, personal). Get your webhook URL at <span className="text-emerald-300">callmebot.com</span> — it sends WhatsApp messages to your own number.
                </li>
                <li>
                  <b className="text-white">Twilio WhatsApp</b> (paid). Sign up, verify a number, copy the webhook URL.
                </li>
                <li>
                  <b className="text-white">WhatsApp Cloud API</b> (Meta). Best for 1:1 messages; groups require business approval.
                </li>
                <li>
                  <b className="text-white">Your own relay</b>. Any endpoint that accepts <code className="text-emerald-300">POST</code> with <code className="text-emerald-300">{"{ text, message, source, timestamp }"}</code>.
                </li>
              </ul>
              <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-400/30 p-2 text-amber-200">
                ⚠️ Avoid unofficial libraries (Baileys, whatsapp-web.js) — they can get your number banned.
              </div>
            </details>
          </section>

          {/* Filters */}
          <section className="rounded-2xl border border-emerald-500/20 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 grid place-items-center text-emerald-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </div>
              <div>
                <div className="font-bold">Broadcast filters</div>
                <div className="text-[11px] text-white/50">Avoid spam, keep signals clean</div>
              </div>
            </div>

            <label className="block mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">Minimum confidence</span>
                <span className="text-xs text-emerald-300 font-semibold">{cfg.filters.minConfidence}</span>
              </div>
              <select
                value={cfg.filters.minConfidence}
                onChange={(e) =>
                  update("filters", { ...cfg.filters, minConfidence: e.target.value as any })
                }
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:border-emerald-400/50 focus:outline-none"
              >
                <option value="high">💎 High only</option>
                <option value="medium">🟢 Medium and above</option>
                <option value="low">🟡 All</option>
              </select>
            </label>

            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.filters.strongOnly}
                onChange={(e) => update("filters", { ...cfg.filters, strongOnly: e.target.checked })}
                className="w-4 h-4 accent-emerald-500"
              />
              <div>
                <div className="text-sm font-semibold">🔒 Strong signals only</div>
                <div className="text-[11px] text-white/50">Skip "good" signals; only broadcast locked/strong ones.</div>
              </div>
            </label>

            <label className="block">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">Cooldown per signal</span>
                <span className="text-xs text-emerald-300 font-semibold font-mono">{cfg.filters.cooldownSeconds}s</span>
              </div>
              <input
                type="range"
                min={10}
                max={600}
                step={10}
                value={cfg.filters.cooldownSeconds}
                onChange={(e) =>
                  update("filters", { ...cfg.filters, cooldownSeconds: Number(e.target.value) })
                }
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                <span>10s</span>
                <span>Same market + trade type won't rebroadcast within this window</span>
                <span>600s</span>
              </div>
            </label>
          </section>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-emerald-500/10 bg-gradient-to-t from-[#021008] to-[#04130b]">
          <button
            onClick={handleSave}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50 transition-all"
          >
            {saved ? "✅ Saved!" : "💾 Save settings"}
          </button>
        </div>
      </aside>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition ${checked ? "bg-emerald-500" : "bg-white/15"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
