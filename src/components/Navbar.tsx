"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navbar({ showAnalyze = true }: { showAnalyze?: boolean }) {
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
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#04130b]/80 border-b border-emerald-500/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-green-500 to-lime-400 grid place-items-center shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-400/50 transition-shadow">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#051a0c]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18 L8 12 L12 16 L16 10 L20 6" />
              <circle cx="20" cy="6" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-black text-white tracking-tight text-lg">
              EMPIRE<span className="bg-gradient-to-r from-lime-300 to-emerald-400 bg-clip-text text-transparent">TRADER</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/60">Deriv analyzer</div>
          </div>
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          {url && (
            <button
              onClick={copyUrl}
              title="Click to copy URL"
              className="hidden sm:inline-flex items-center gap-1.5 max-w-[240px] px-3 py-1.5 rounded-lg bg-white/5 border border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-500/10 text-xs font-mono text-emerald-200 transition truncate"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span className="truncate">{copied ? "✅ URL copied!" : url.replace(/^https?:\/\//, "")}</span>
            </button>
          )}
          {showAnalyze && (
            <Link
              href="/analyze"
              className="relative inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 text-[#04130b] font-bold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50 hover:scale-[1.02] transition-all shrink-0"
            >
              <span className="hidden sm:inline">Launch</span> Analyzer
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
