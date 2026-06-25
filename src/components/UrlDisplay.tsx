"use client";

import { useEffect, useState } from "react";

export default function UrlDisplay({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setUrl(window.location.origin);
  }, []);

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  if (!url) return null;

  if (compact) {
    return (
      <button
        onClick={copyUrl}
        title="Click to copy URL"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-500/10 text-xs font-mono text-emerald-200 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span className="truncate max-w-[240px]">{copied ? "✅ Copied!" : url.replace(/^https?:\/\//, "")}</span>
      </button>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
      <div className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#072015] to-[#04130b] p-6 md:p-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 grid place-items-center text-emerald-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-emerald-400 font-bold">Your EMPIRETRADER link</div>
              <div className="text-white/60 text-xs">Bookmark it · Share it · Tap to copy</div>
            </div>
          </div>

          <button
            onClick={copyUrl}
            className="group w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-black/40 border-2 border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/5 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex items-center gap-1.5 shrink-0">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Live</span>
              </div>
              <span className="font-mono font-bold text-base sm:text-lg text-emerald-200 truncate">{url}</span>
            </div>
            <div className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs transition ${
              copied
                ? "bg-emerald-500 text-[#04130b]"
                : "bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] group-hover:scale-[1.03]"
            }`}>
              {copied ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3.5 h-3.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy link
                </>
              )}
            </div>
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1"><span>📱</span> Open on mobile</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><span>💬</span> Paste in WhatsApp / Telegram</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><span>🔖</span> Add to bookmarks</span>
          </div>
        </div>
      </div>
    </section>
  );
}
