# 👑 EMPIRETRADER — Live Deriv Trade Analyzer

A production-ready trading analysis tool that streams live tick data from **Deriv** and surfaces stable, bot-actionable signals across 15 synthetic markets and 12 trade types. Built for traders who run **DBot / DTrader** and want signals delivered to their Telegram channel automatically.

![EMPIRETRADER](https://img.shields.io/badge/EMPIRETRADER-Live_Signals_Bot-10b981?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=for-the-badge&logo=typescript)
![Telegram](https://img.shields.io/badge/Telegram-Bot_Ready-229ED9?style=for-the-badge&logo=telegram)

---

## ✨ Features

- 🎯 **12 trade types**: Over/Under (3/4/5/6), Even/Odd, Rise/Fall
- 📊 **15 markets** scanned simultaneously: Volatility (R), Volatility 1s (1HZ), Jump (JD)
- 🔒 **Hysteresis-locked signals** — strong signals stay stable until explicit break conditions (no flickering)
- 🤖 **Bot-actionable entry points** — concrete digits, patterns, or runs with clear TTL windows
- 📡 **Auto-broadcast to Telegram** — groups & channels supported, HTML-formatted messages
- 💬 **WhatsApp / webhook support** — works with CallMeBot, Twilio, or your own relay
- ⏰ **40-minute auto-scan** — scans all 180 combinations (15 markets × 12 trades) and sends top signals
- 🌐 **Trading site link** embedded in every signal (configurable)
- 🎚️ **Manual send** — fire a top-signals broadcast anytime without disrupting the schedule
- 🧪 **Test messages** — verify Telegram & webhook connections before going live

---

## 🚀 Deploy to Vercel (Recommended)

The fastest way to get EMPIRETRADER running on a public URL.

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/empiretrader)

*(Replace the URL above with your actual GitHub repo URL)*

### Manual Deploy

```bash
# 1. Clone your repo
git clone https://github.com/YOUR_USERNAME/empiretrader.git
cd empiretrader

# 2. Install dependencies
npm install

# 3. (Optional) Test locally
npm run dev
# Open http://localhost:3000

# 4. Deploy with Vercel CLI
npm i -g vercel
vercel
```

### Step-by-Step GitHub + Vercel

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "🚀 EMPIRETRADER initial deployment"
   git remote add origin https://github.com/YOUR_USERNAME/empiretrader.git
   git push -u origin main
   ```

2. **Go to [vercel.com](https://vercel.com)** → Sign in with GitHub

3. Click **"Add New → Project"** → Import your repo

4. Vercel auto-detects Next.js. Click **Deploy** (no env vars needed!)

5. Your site is live at `your-project.vercel.app` 🎉

6. **(Optional)** Connect your custom domain (`the-empiretrader.site`):
   - Project Settings → Domains → Add domain
   - Follow DNS instructions at your registrar

---

## 🛠️ Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📡 Set Up Telegram Broadcasts

### 1. Create a bot
- Open Telegram, search for **@BotFather**
- Send `/newbot`, follow prompts
- Copy the **bot token** (looks like `123456:ABC-DEF...`)

### 2. Get your chat ID

**For a public channel**: Use `@your_channel_username` directly.

**For a private channel/group**:
1. Add your bot to the channel as **admin** (with "Post Messages" permission)
2. Post any message in the channel
3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find the `"chat": { "id": -1001234567890, ... }` field — that negative number is your chat ID

**Shortcut**: Add `@getidsbot` to your channel, it will post the channel ID, then remove it.

### 3. Configure EMPIRETRADER
- Open your deployed site → click **Launch Analyzer** → click **⚙️ Settings**
- Paste the bot token + chat ID
- Toggle **Telegram ON**
- Click **🧪 Send test message** → if ✅, you're live!
- Click **💾 Save settings**

---

## ⏰ 40-Minute Auto-Scan

On the Analyzer page, click **▶️ Start auto-scan**:

- The scanner subscribes to **all 15 markets × all 12 trade types** (180 trackers)
- Every 40 minutes, the top signals are automatically broadcast to Telegram
- A countdown shows when the next scan fires
- Manual **🎯 Send top signals now** button doesn't reset the timer

> **Note**: The auto-scan runs in your browser tab. Keep the tab open on your computer, a VPS, or a Raspberry Pi for continuous signals. If you close the tab, scanning pauses until you reopen it.

---

## 📂 Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── analyze/page.tsx         # Analyzer page
│   ├── api/broadcast/route.ts   # Telegram + webhook endpoint
│   └── api/health/route.ts      # Health check
├── components/
│   ├── Analyzer.tsx             # Main analyzer UI
│   ├── LandingPage.tsx          # Landing page UI
│   ├── Navbar.tsx               # Top nav with EMPIRETRADER logo
│   ├── UrlDisplay.tsx           # Copyable URL widget
│   ├── SettingsDrawer.tsx       # Broadcast settings drawer
│   └── SchedulePanel.tsx        # 40-min auto-scan panel
└── lib/
    ├── constants.ts             # Trade types, markets, trading site URL
    ├── deriv.ts                 # Deriv WebSocket client
    ├── analysis.ts              # SymbolTracker, entry points, stability
    ├── broadcast.ts             # Telegram/webhook formatters
    └── fullScanner.ts           # All-markets × all-trades scanner
```

---

## 🎨 Customization

**Change the trading site link** (shown in every signal):

Edit `src/lib/constants.ts`:
```ts
export const TRADING_SITE_URL = "https://the-empiretrader.site";
```

**Change the auto-scan interval** (default 40 minutes):

Edit `src/lib/constants.ts`:
```ts
export const AUTO_SCAN_INTERVAL_MS = 40 * 60 * 1000; // 40 minutes
```

**Adjust signal thresholds**:

Edit `src/lib/analysis.ts` — look for:
```ts
const STRONG_ENTER = 0.66;    // win rate to enter "strong" state
const STRONG_HOLD = 0.58;     // minimum to stay strong
const MAX_CONSECUTIVE_LOSSES = 3;
const MAX_PEAK_DROP = 0.12;
```

---

## 🔒 Security Notes

- **Bot tokens are stored in your browser's localStorage** (never sent to any server except Telegram)
- **No API keys required** for Deriv (uses the public app_id)
- **No database required** for core features
- The `.env` file (if created) is in `.gitignore` — never push secrets

---

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |

---

## 🐛 Troubleshooting

**Telegram: "Bot token is invalid or revoked"**
- Double-check your token from @BotFather
- If you regenerated the token, update it in Settings

**Telegram: "Chat not found"**
- Make sure the bot is added to your channel/group
- For channels, the bot must be **admin** with "Post Messages" permission
- Verify the chat ID format (negative number for channels, or `@username`)

**Telegram: "Not enough rights"**
- Promote the bot to admin with "Post Messages" permission

**Auto-scan stops when I close the tab**
- This is by design — the scanner runs in your browser
- Keep the tab open on a dedicated device (VPS, Raspberry Pi, old laptop)

---

## 📄 License

MIT — use this freely for your trading community.

---

## 🤝 Credits

Built for the **EMPIRETRADER** community. Live signals powered by Deriv WebSocket API.

---

**👑 EMPIRETRADER · LIVE SIGNALS BOT**
