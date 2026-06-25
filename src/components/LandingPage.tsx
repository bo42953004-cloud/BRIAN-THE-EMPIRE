import Link from "next/link";
import Navbar from "@/components/Navbar";
import UrlDisplay from "@/components/UrlDisplay";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#03120a] text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -left-40 w-[400px] h-[400px] bg-lime-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/3 w-[300px] h-[300px] bg-green-600/20 rounded-full blur-[120px]" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#10b981" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <Navbar />

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-6">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Deriv WebSocket feed
              </div>
              <h1 className="text-5xl sm:text-6xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
                Read the{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-lime-300 via-emerald-400 to-green-500 bg-clip-text text-transparent">empire</span>
                  <svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full h-3" preserveAspectRatio="none">
                    <path d="M0 6 Q 75 0, 150 6 T 300 6" stroke="url(#g1)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <defs>
                      <linearGradient id="g1">
                        <stop offset="0%" stopColor="#a3e635" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>{" "}
                before the tick.
              </h1>
                <p className="text-lg text-white/70 mb-8 max-w-xl leading-relaxed">
                EMPIRETRADER streams live tick data from Deriv and crunches every digit, parity, and momentum across Volatility, 1HZ, and Jump indices — so you spot the strongest <span className="text-emerald-300 font-semibold">Over/Under</span>, <span className="text-lime-300 font-semibold">Even/Odd</span>, and <span className="text-green-300 font-semibold">Rise/Fall</span> setups in seconds.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/analyze"
                  className="group inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 text-[#04130b] font-bold text-base shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-400/60 hover:scale-[1.03] transition-all"
                >
                  Start Analyzing
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 group-hover:translate-x-1 transition-transform" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-emerald-500/30 bg-white/5 text-white font-semibold hover:bg-emerald-500/10 transition"
                >
                  How it works
                </a>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-6 max-w-lg">
                {[
                  { v: "15", l: "Markets scanned" },
                  { v: "12", l: "Trade types" },
                  { v: "1s", l: "Tick latency" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-3xl font-black bg-gradient-to-br from-lime-300 to-emerald-500 bg-clip-text text-transparent">{s.v}</div>
                    <div className="text-xs text-white/50 uppercase tracking-wider mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero card */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/30 via-green-500/20 to-lime-400/30 rounded-3xl blur-2xl" />
              <div className="relative rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#072015] to-[#04130b] p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-300">Live analysis</span>
                  </div>
                  <span className="text-xs text-white/40 font-mono">ws.derivws.com</span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: "Vol 75", digit: 7, win: 68.4, label: "OVER 6", tone: "strong" },
                    { name: "Vol 25 (1s)", digit: 2, win: 56.1, label: "EVEN", tone: "good" },
                    { name: "Jump 50", digit: 4, win: 42.3, label: "RISE", tone: "weak" },
                    { name: "Vol 100", digit: 9, win: 72.8, label: "ODD", tone: "strong" },
                  ].map((r) => (
                    <div key={r.name} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 transition">
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{r.name}</div>
                        <div className="text-xs text-white/40 font-mono">last digit · {r.digit}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-mono font-bold ${r.tone === "strong" ? "text-emerald-300" : r.tone === "good" ? "text-lime-300" : "text-white/40"}`}>
                          {r.win}%
                        </div>
                        <div className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${
                          r.tone === "strong" ? "bg-emerald-500/20 text-emerald-300" :
                          r.tone === "good" ? "bg-lime-500/20 text-lime-300" :
                          "bg-white/5 text-white/40"
                        }`}>
                          {r.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-8 rounded-sm ${
                        Math.random() > 0.35
                          ? "bg-gradient-to-t from-emerald-500/80 to-lime-400/60"
                          : "bg-white/10"
                      }`}
                      style={{ height: `${20 + Math.random() * 40}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trade types */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20 border-t border-emerald-500/10">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em] mb-3">Analyze every edge</div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">
              One tool. <span className="bg-gradient-to-r from-lime-300 to-emerald-500 bg-clip-text text-transparent">Every trade type.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Over / Under",
                desc: "Last-digit probability analysis for Over 3, 4, 5, 6 and Under 3, 4, 5, 6 contracts.",
                items: ["O6 · O5 · O4 · O3", "U3 · U4 · U5 · U6"],
                gradient: "from-emerald-500/20 to-green-600/5",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
                  </svg>
                ),
              },
              {
                title: "Even / Odd",
                desc: "Parity probability scanner tracking the distribution of even and odd last digits in real time.",
                items: ["EVEN (0,2,4,6,8)", "ODD (1,3,5,7,9)"],
                gradient: "from-lime-500/20 to-emerald-600/5",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <circle cx="9" cy="12" r="5" />
                    <circle cx="17" cy="12" r="3" />
                  </svg>
                ),
              },
              {
                title: "Rise / Fall",
                desc: "Momentum scanner measuring consecutive up/down tick momentum across all markets.",
                items: ["RISE momentum", "FALL momentum"],
                gradient: "from-green-500/20 to-lime-600/5",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                ),
              },
            ].map((card) => (
              <div key={card.title} className={`relative group rounded-3xl p-6 bg-gradient-to-br ${card.gradient} border border-emerald-500/20 hover:border-emerald-400/50 transition-all`}>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 grid place-items-center text-emerald-300 mb-4 group-hover:scale-110 transition">
                  {card.icon}
                </div>
                <h3 className="text-2xl font-black mb-2">{card.title}</h3>
                <p className="text-white/60 text-sm mb-4 leading-relaxed">{card.desc}</p>
                <div className="space-y-1">
                  {card.items.map((i) => (
                    <div key={i} className="text-xs font-mono text-emerald-300/80 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-emerald-400" />
                      {i}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-7xl px-4 sm:px-6 py-20 border-t border-emerald-500/10">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em] mb-3">How it works</div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Three taps. Full market view.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "Pick your trade", d: "Select Over/Under, Even/Odd, or Rise/Fall — including specific thresholds like Over 6 or Under 3." },
              { n: "02", t: "Hit analyze", d: "DigitPulse opens a single WebSocket to Deriv and subscribes to every R, 1HZ and JD symbol simultaneously." },
              { n: "03", t: "Follow the signal", d: "Live win rates, digit heat maps, and streak detectors highlight the markets with the strongest edge right now." },
            ].map((s) => (
              <div key={s.n} className="relative rounded-3xl p-6 bg-white/[0.02] border border-emerald-500/10 hover:border-emerald-400/30 transition">
                <div className="text-6xl font-black bg-gradient-to-br from-emerald-400/40 to-transparent bg-clip-text text-transparent mb-2">{s.n}</div>
                <h3 className="text-xl font-bold mb-2">{s.t}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Access URL */}
        <UrlDisplay />

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <div className="relative rounded-[2rem] overflow-hidden bg-gradient-to-br from-emerald-600 via-green-600 to-lime-500 p-10 md:p-16 text-center">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-black text-[#04130b] tracking-tight mb-4">Ready to build your empire?</h2>
              <p className="text-[#051a0c]/80 text-lg mb-8 max-w-xl mx-auto">
                Start streaming live data across all 15 Deriv synthetic markets in one click — no API key required.
              </p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#04130b] text-emerald-300 font-bold text-base shadow-2xl hover:scale-[1.03] transition-all"
              >
                Open the Analyzer
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-emerald-500/10 py-8 text-center text-white/40 text-xs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="font-bold text-emerald-400 mb-2">
              EMPIRE<span className="text-lime-300">TRADER</span>
            </div>
            <div>EMPIRETRADER is an independent analytical tool. Trading synthetic indices involves risk — this tool provides data, not financial advice.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
