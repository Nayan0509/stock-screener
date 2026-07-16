# Skorr78 AI — NSE Stock Screener: Full System Architecture & Trading Logic

> Last updated: 2026-06-18  
> Backend: Node.js/Express | Frontend: React + Vite | Data: NSE live scrape  
> Universe: Nifty 500 (live-resolved)

---

## 1. System Overview

Skorr78 is a real-time NSE equity intelligence platform that combines six expert scoring domains, Smart Money Concepts (SMC), and a complete human-trader decision engine to surface high-quality trade setups across 16 signal sections. Every signal is automatically logged, tracked for accuracy, and scored before entry via the `tradingThought` quality gate.

**Design principles:**
- Zero static data — all prices, OI, and breadth fetched live from NSE
- Non-blocking async I/O — signal logging never stalls the screener
- Accuracy-first — every signal is tracked from entry to exit with real P/L
- Human-trader discipline baked in — psychology, session, and R:R gates block low-quality signals

---

## 2. High-Level Architecture

```
NSE Live Data  ──►  Scrapers  ──►  State Cache  ──►  Scan Engines  ──►  Routes  ──►  Frontend
                                       │
                                       ▼
                               autoLogSignals.js
                                  (quality gate)
                                       │
                               tradingThought.js
                                (6-step evaluator)
                                       │
                                  auditStore.js
                               (disk persistence)
                                       │
                               AuditDashboard.jsx
                              (accuracy dashboard)
```

### Key Layers

| Layer | Files | Role |
|-------|-------|------|
| Scrapers | `nseScraper.js`, `nseBhavcopy.js`, `nseOptionChain.js`, `fiiDiiFlow.js`, `newsScraperNSE.js` | Raw NSE data fetch |
| State | `state.js` | In-memory cache: `cachedResults`, `cachedIntraday`, `cachedRegime`, `cachedParticipantOI`, etc. |
| Scan Engines | `scanEngines.js` | Orchestrates all periodic scans |
| Scoring | `scoringEngine.js`, `indicators.js`, `chartPatterns.js` | 6-domain expert score |
| Intelligence | `marketRegime.js`, `stageAnalysis.js`, `rsRating.js`, `sectorRotation.js` | Market context |
| Signal Quality | `tradingThought.js` | Human-trader 6-step thought process |
| Audit | `auditStore.js`, `autoLogSignals.js` | Signal tracking + outcome resolution |
| Routes (23) | `backend/routes/*.js` | REST API per feature domain |
| Frontend | `frontend/src/` | React SPA, TradingView dark theme |

---

## 3. Backend Core Files

### `server.js`
Entry point. Sets up Express, WebSocket, all routes, scan scheduler, and the audit auto-check interval.

**Auto-check interval (every 5 min):**
```javascript
setInterval(() => {
  const updated = auditStore.autoCheckOutcomes(state);
  if (updated > 0) log.info(`Auto-checked: ${updated} signal outcomes updated`);
}, 5 * 60 * 1000);
```

**`autoLogAll()` call:** Called after every screener run to log new signals to audit.

### `state.js`
Single in-memory state object shared across all modules:
- `cachedResults` — current screener stock list
- `cachedIntraday` — intraday scan results
- `cachedOptionSignals` — CE/PE sniper signals
- `cachedFOSignals` — F&O stock signals
- `cachedParticipantOI` — FII/DII OI breakdown
- `cachedRegime` — current market regime (BULL/BEAR/RANGE)
- `cachedMarketBreadth` — advance/decline ratio, % above DMA
- `cachedIndexData` — Nifty, BankNifty, India VIX live values
- `cachedDominance` — buyer/seller dominance map

### `scanEngines.js`
Orchestrates all background scans:
- `runScreener()` — full Nifty 500 pass, populates `cachedResults`
- `runIntraday15mScan()` — 15-minute momentum scan
- `runOptionSignalScan()` — CE/PE sniper scan
- `runFOStockScan()` — F&O stock signal scan
- `runParticipantOIScan()` — FII/DII OI parse from NSE
- `runBreadthScan()` — advance/decline + % above DMA

---

## 4. Six-Domain Expert Scoring

Every stock receives a **composite score (0–100)** across six independent domains with Information Coefficient (IC) based weighting:

| Domain | IC Weight | What it measures |
|--------|-----------|-----------------|
| Technical Momentum | 0.28 | EMA trend, RSI, MACD, ATR, volume vs MA |
| Options OI Flow | 0.22 | PCR, OI buildup type, IV rank |
| FII-DII Institutional | 0.18 | FII net, participant OI bias |
| Fundamental Quality | 0.15 | Revenue growth, debt/equity, ROE, margin |
| News Sentiment | 0.10 | Recency × polarity score |
| Macro Regime | 0.07 | VIX, AD ratio, sector rotation phase |

**Grade thresholds:**
- S (≥ 88): Exceptional setup — rare, act immediately
- A (80–87): High conviction — primary trade candidates  
- B (70–79): Good setup — manageable risk
- C (60–69): Speculative — reduced size only
- D (< 60): Below threshold — not logged

---

## 5. Smart Money Concepts (SMC)

Implemented in `setupEngine.js` and `chartPatterns.js`. These are the structural concepts used by institutional traders:

### Break of Structure (BOS)
A **BOS** occurs when price breaks and closes beyond the most recent swing high (bullish BOS) or swing low (bearish BOS), confirming a trend continuation.
- Bullish BOS: Close > last confirmed higher high → trend continues up
- Bearish BOS: Close < last confirmed lower low → trend continues down

### Change of Character (CHoCH)
A **CHoCH** signals a potential trend reversal, not continuation. It is the first break of the opposing structure:
- Bullish CHoCH: In a downtrend, price breaks above the last lower high
- Bearish CHoCH: In an uptrend, price breaks below the last higher low

### Order Blocks (OB)
The **last opposite candle before a strong impulsive move**. Represents the zone where smart money placed large orders.
- Bullish OB: Last bearish candle before a strong bullish impulse
- Bearish OB: Last bullish candle before a strong bearish impulse
- OBs are used as high-probability entry zones on pullbacks

### Fair Value Gaps (FVG)
A **three-candle pattern** where candle 1's wick and candle 3's wick do not overlap, leaving a "gap" where price traded too quickly:
- Bullish FVG: Body of candle 3 does not fill into candle 1's high
- Bearish FVG: Body of candle 3 does not fill into candle 1's low
- Price often returns to fill FVGs before continuing the trend

### Liquidity Concepts
- **Buy-side Liquidity (BSL):** Cluster of stops above swing highs — smart money raids these to fill large sell orders
- **Sell-side Liquidity (SSL):** Cluster of stops below swing lows — smart money raids these to fill large buy orders
- **Equal Highs/Lows:** Strong liquidity pools (retail traders' stop clusters)
- **Inducement:** False break engineered by smart money to trigger retail stops before the real move

### Market Structure
- **Higher High / Higher Low (HH/HL):** Bullish market structure
- **Lower High / Lower Low (LH/LL):** Bearish market structure
- **Premium Zone:** Above equilibrium (50% of the range) — sell zone
- **Discount Zone:** Below equilibrium — buy zone

---

## 6. Signal Flow

```
1. Scan Engine runs (every 5-15 min)
        │
        ▼
2. Scoring Engine assigns composite score + grade
        │
        ▼
3. autoLogAll(state) called
        │
        ▼
4. Per-section logger (logStockAsync, logOptionAsync, etc.)
        │
        ├── Quality gate: isQualitySignal() or isQualityDirection()
        │        (score ≥ 60 OR trade levels present)
        │
        ├── Synthetic levels applied if sl/target missing
        │        (section-specific ±% defaults, 2:1 R:R)
        │
        ├── alreadyPendingForSymbol() check
        │        (blocks re-log while ANY PENDING exists)
        │
        ├── tradingThought.evaluate(signal, _currentState, [])
        │        6-step human-trader evaluation → thoughtScore 0–100
        │        Hard block if: R:R < 0.5, revenge trading
        │        Skip if: thoughtScore < 25
        │
        └── auditStore.logSignal(section, payload)
                 Writes to: data/audit/<section>/<SYMBOL>.json

5. Auto-check interval (every 5 min): autoCheckOutcomes(state)
        │
        ├── Immediately expire: sl≤0 AND target≤0 signals (bad data)
        ├── Check expiry: signal age > MAX_AGE_DAYS[section]
        ├── Price check: if price hits target → TARGET_HIT
        └── Price check: if price hits sl → SL_HIT
```

---

## 7. The 16 Audit Sections

### Core Scans
| Section | Label | Max Hold | Description |
|---------|-------|----------|-------------|
| `picks` | Intraday 15m | 0.5 days | 15-minute momentum intraday setups |
| `swing` | Swing Setups | 21 days | Multi-day swing trades with structure |
| `high-alpha` | High Alpha | 30 days | High conviction multi-bagger setups |
| `breakout` | Breakout Scanner | 15 days | Stage 2 breakout above base patterns |
| `options` | CE/PE Options | 1 day | Option sniper CE/PE intraday picks |
| `screener` | Stock Screener | 5 days | General screener alerts |

### Strategy Scans
| Section | Label | Max Hold | Description |
|---------|-------|----------|-------------|
| `intraday-picks` | Intraday Picks | 0.5 days | Enhanced intraday with F&O overlay |
| `bulletproof-swing` | Bulletproof Swing | 15 days | Top 15 high-confidence swing setups |
| `life-changing` | Life Changing | 45 days | Rare, exceptional conviction trades |
| `zero-to-hero` | Zero to Hero | 30 days | Single best NSE/MCX trade of session |

### Market Intelligence
| Section | Label | Max Hold | Description |
|---------|-------|----------|-------------|
| `liquidity` | Liquidity Setups | 3 days | Institutional accumulation/distribution |
| `fo-scorer` | F&O Scorer | 5 days | OI + delivery + volume quality signals |
| `fo-signals` | F&O Signals | 1 day | CE/PE on individual F&O stocks |
| `dominance` | Market Dominance | 3 days | Buyer/seller dominance direction |
| `alerts` | Trade Alerts | 1 day | FIRE/STRONG BUY real-time alerts |
| `order-flow-dom` | Order Flow Dom. | 1 day | Confirmed stock + option direction |

---

## 8. Audit Statistics — All Metrics Explained

For each section, `computeStats()` in `auditStore.js` calculates:

### Core Accuracy
```
accuracy = TARGET_HIT / (TARGET_HIT + SL_HIT) × 100
```
Only counts DECIDED trades. EXPIRED signals are excluded (they represent missed setups, not wrong calls).

### Expectancy
```
expectancy = (accuracy/100 × avgGain) + ((1 - accuracy/100) × avgLoss)
```
Represents expected P/L per trade in %. Positive expectancy = edge exists.

### Risk/Reward
```
avgRR = avgGain / |avgLoss|
```
Average reward-to-risk ratio across all closed trades.

### Profit Factor
```
profitFactor = grossProfit / |grossLoss|
```
Where `grossProfit` = sum of all positive pnlPct, `grossLoss` = sum of all negative pnlPct.
- > 2.0: Excellent
- 1.5–2.0: Good  
- 1.0–1.5: Marginal
- < 1.0: Losing system

### P/L Ratio
```
plRatio = avgGain / |avgLoss|
```
Average win size vs average loss size. Target: > 1.5 (wins should be larger than losses).

### Max Drawdown
Calculated from equity curve (running sum of all closed pnlPct values):
```
equity[i] = equity[i-1] + pnlPct[i]
peak = max(equity[0..i])
drawdown[i] = peak - equity[i]
maxDrawdown = max(drawdown[])
```

### Max Consecutive Losses
Longest streak of SL_HIT signals in sequence. Used for psychological risk assessment.

### Expired Rate
```
expiredRate = EXPIRED / total × 100
```
High expired rate indicates setups are being generated but not executing (timing or liquidity issues).

---

## 9. tradingThought.js — Human Trader Decision Engine

Before any signal is logged, it passes through a 6-step evaluation mirroring how a trained human trader thinks:

### Step 1: Market Context (25% weight)
Evaluates whether the macro environment supports the trade direction:
- Regime alignment (BULL/BEAR/RANGE) — 25 pts
- Market breadth (A/D ratio) — 15 pts
- FII/DII flow alignment — 10 pts
- India VIX acceptability — 10 pts
- NSE session quality — 15 pts
- HTF trend alignment — 15 pts

### Step 2: Setup Quality (25% weight)
Evaluates the technical setup completeness:
- Structure clear (pattern/OI signal present) — 20 pts
- Level defined (entry/sl/target > 0) — 20 pts
- Pattern confirmed — 20 pts
- Confidence score (proxy for confluence) — 20 pts
- Grade-based conviction (A/S = full, B = 60%) — 20 pts

### Step 3: Entry Plan (15% weight)
Validates the execution plan is actionable:
- Entry price defined — 25 pts
- Timeframe specified — 25 pts
- Trade type/direction — 25 pts
- Hold information/exit plan — 25 pts

### Step 4: Risk & Target (20% weight)
Validates the risk management structure:
- R:R ≥ 2.0 → 40 pts; ≥ 1.5 → 30 pts; ≥ 1.0 → 15 pts; < 1.0 → 0 pts + hard block
- SL defined → 20 pts
- Target defined → 20 pts
- SL% ≤ 3% → 20 pts; ≤ 5% → 10 pts; > 5% → hard block

### Step 5: Psychology Check (15% weight)
Detects emotional trading patterns in recent history:
- **Revenge trading:** ≥ 2 SL_HITs today → -40 pts + HARD BLOCK
- **Overconfidence:** Win streak ≥ 5 → -20 pts
- **Fear:** India VIX > 25 → -25 pts
- **Greed:** India VIX < 12 → -10 pts
- **Overtrading:** ≥ 8 signals today → -25 pts; ≥ 5 → -10 pts

### Step 6: Session Quality
NSE trading session filter:

| Phase | Time (IST) | Quality | Intraday |
|-------|-----------|---------|----------|
| Opening Chaos | 09:15–09:44 | 20% | Blocked |
| Best Window | 09:45–11:59 | 95% | Allowed |
| Midday Slow | 12:00–13:14 | 60% | Allowed |
| Afternoon Move | 13:15–14:59 | 80% | Allowed |
| Closing Action | 15:00–15:14 | 70% | Blocked |
| Closing Chaos | 15:15–15:30 | 10% | Blocked |
| After Hours | 15:31–09:14 | 0% | Blocked |

### thoughtScore Formula
```
thoughtScore = contextScore × 0.25
             + setupScore × 0.25
             + entryScore × 0.15
             + riskScore  × 0.20
             + psychScore × 0.15
```

**Thresholds:**
- `shouldLog = !hardBlocked && thoughtScore >= 25`
- Minimum quality bar: 25/100 (weak but valid signal)
- Hard blocks: R:R < 0.5 (absurd risk), revenge trading flag

---

## 10. Risk Management Formulas

### Position Sizing
```
riskAmount   = accountBalance × (riskPct / 100)
units        = floor(riskAmount / |entry − sl|)
positionSize = units × entry
```
Standard 1–2% risk per trade rule from the trading plan.

### Risk/Reward Ratio
```
risk   = |entry − sl|
reward = |target − entry|
R:R    = reward / risk
```
Minimum acceptable: 1.5:1 (target 2:1 or better)

### Compounding Projection
```
balance(n) = startBalance × (1 + monthlyReturn%)^n
```
Consistent monthly returns compound dramatically. Example: ₹1L at 5%/month = ₹1.79L in 12 months.

### Synthetic Level Defaults (when live levels unavailable)

| Section | Gain % | SL % | R:R |
|---------|--------|------|-----|
| picks (intraday) | 1.5% | 0.75% | 2:1 |
| swing | 3.0% | 1.5% | 2:1 |
| breakout | 2.5% | 1.25% | 2:1 |
| screener | 2.0% | 1.0% | 2:1 |
| high-alpha | 4.0% | 2.0% | 2:1 |

---

## 11. Chart Patterns Tracked

Detected in `chartPatterns.js` and scored as part of the setup quality:

**Continuation Patterns:** Bull Flag, Bear Flag, Cup & Handle, Ascending/Descending Triangle, Rectangle, Pennant, Wedge

**Reversal Patterns:** Head & Shoulders, Inverse Head & Shoulders, Double Top/Bottom, Triple Top/Bottom

**Candlestick Patterns:** Engulfing (Bull/Bear), Doji, Hammer, Shooting Star, Morning Star, Evening Star, Harami, Marubozu, Pin Bar, Inside Bar

**SMC Patterns:** BOS (Break of Structure), CHoCH (Change of Character), Order Block, FVG (Fair Value Gap), Premium/Discount entry, Liquidity Sweep

---

## 12. Key Indicators

Calculated in `indicators.js`:

| Indicator | Parameters | Signal |
|-----------|-----------|--------|
| EMA | 9, 21, 50, 200 | Trend direction + dynamic support |
| RSI | 14 | >60 bullish, <40 bearish; avoid >80 or <20 |
| MACD | 12,26,9 | Crossover + histogram expansion |
| ATR | 14 | Volatility sizing, SL placement |
| Volume | 20 SMA | > 1.5× average = institutional confirmation |
| Bollinger Bands | 20, 2σ | Squeeze = impending breakout |
| Supertrend | 10, 3 | Trend following filter |
| VWAP | Daily | Institutional reference; above = bullish intraday |
| OBV | — | Volume flow confirmation |

**Minervini Stage 2 Pre-Filter (required for breakout signals):**
1. Price > 50-day MA
2. 50-day MA > 150-day MA
3. 150-day MA > 200-day MA
4. 200-day MA trending up (last month)
5. Price > 52-week low × 1.25 (25%+ off low)
6. Price within 25% of 52-week high
7. RS Rating ≥ 70 (relative strength vs Nifty 500)

---

## 13. News Impact Classification

`tradingThought.classifyNewsImpact(headline)` returns:

| Level | Keywords | Action |
|-------|---------|--------|
| HIGH | NFP, CPI, Interest Rate, GDP, RBI Policy, FOMC | Avoid new entries ±15min |
| MEDIUM | Retail Sales, PPI, PMI, Unemployment | Reduce size |
| LOW | Trade Balance, Housing Data | Monitor only |
| GEOPOLITICAL | War, Sanctions, Election | Special caution |

---

## 14. Full Trading Plan Checklist (10-point)

`tradingThought.fullTradingPlanChecklist(signal)` grades each signal:

1. Entry price defined
2. Stop loss defined
3. Target / take profit defined
4. R:R ≥ 1:2 (computed)
5. Trade type / direction defined
6. Timeframe specified
7. Sector / context available
8. Confidence / score present
9. Pattern / OI signal noted
10. Grade / conviction set

Grades: A (9–10/10), B (7–8/10), C (5–6/10), D (<5/10)

---

## 15. API Reference

### Audit Endpoints
```
GET  /api/audit/summary              — All 16 sections stats
GET  /api/audit/summary/:section     — Single section stats
GET  /api/audit/signals/:section     — ?status=&since=&symbol=&limit=
GET  /api/audit/stock/:section/:sym  — Full symbol audit file
POST /api/audit/log                  — Log signal manually
POST /api/audit/log/batch            — Log up to 500 signals
PUT  /api/audit/signal/:id/outcome   — Update signal outcome
POST /api/audit/refresh              — Trigger auto-outcome check (cleans bad data)
POST /api/audit/prune                — Remove signals older than N days
GET  /api/audit/sections             — Section list + labels
```

### Key Signal Fields
```json
{
  "section":    "swing",
  "symbol":     "RELIANCE",
  "type":       "BUY",
  "entry":      2950.00,
  "sl":         2880.00,
  "target":     3100.00,
  "slPct":      2.37,
  "gainPct":    5.08,
  "confidence": 82,
  "grade":      "A",
  "sector":     "Energy",
  "pattern":    "Cup & Handle",
  "oiSignal":   "Long Buildup",
  "holdInfo":   "3-5 days",
  "timeframe":  "1D",
  "thoughtScore": 74,
  "sessionPhase": "BEST_WINDOW"
}
```

### Signal Status Lifecycle
```
PENDING → TARGET_HIT  (price reaches target)
        → SL_HIT      (price hits stop loss)
        → EXPIRED     (signal age > MAX_AGE_DAYS or bad data)
        → PARTIAL     (partial profit taken — manual update)
```

### Other Core Endpoints
```
GET  /api/screener/results           — Current Nifty 500 screener
GET  /api/screener/intraday          — Intraday 15m signals
GET  /api/options/signals            — CE/PE sniper signals
GET  /api/regime/current             — Market regime + VIX
GET  /api/dominance/current          — Buyer/seller dominance
GET  /api/breadth/current            — Market breadth
GET  /api/alerts/current             — FIRE/STRONG BUY alerts
GET  /api/fo-scorer/results          — F&O quality scores
GET  /api/liquidity/setups           — Liquidity sweep setups
GET  /api/zero-to-hero               — Best single trade of session
GET  /api/life-changing              — High conviction multi-baggers
GET  /api/bulletproof-swing          — Top 15 swing setups
```

---

## 16. Data Storage Layout

```
backend/
├── data/
│   ├── audit/
│   │   ├── picks/           # SYMBOL.json per tracked stock
│   │   ├── swing/
│   │   ├── high-alpha/
│   │   ├── breakout/
│   │   ├── options/
│   │   ├── screener/
│   │   ├── intraday-picks/
│   │   ├── bulletproof-swing/
│   │   ├── life-changing/
│   │   ├── zero-to-hero/
│   │   ├── liquidity/
│   │   ├── fo-scorer/
│   │   ├── fo-signals/
│   │   ├── dominance/
│   │   ├── alerts/
│   │   └── order-flow-dom/
│   └── nifty500.json        # Cached Nifty 500 symbol list
```

Each `SYMBOL.json` structure:
```json
{
  "symbol": "RELIANCE",
  "section": "swing",
  "signals": [
    {
      "id": "abc123",
      "symbol": "RELIANCE",
      "type": "BUY",
      "entry": 2950,
      "sl": 2880,
      "target": 3100,
      "status": "TARGET_HIT",
      "signalDate": "2026-06-01",
      "timestamp": "2026-06-01T10:30:00.000Z",
      "exitPrice": 3098,
      "pnlPct": 5.02,
      "holdDays": 4,
      "thoughtScore": 78,
      "sessionPhase": "BEST_WINDOW"
    }
  ],
  "stats": {
    "total": 5,
    "closed": 4,
    "targetHit": 3,
    "slHit": 1,
    "pending": 1,
    "accuracy": 75,
    "profitFactor": 2.1,
    "plRatio": 2.3,
    "maxDrawdown": 3.2,
    "maxConsecLoss": 1,
    "expectancy": 2.8,
    "avgRR": 2.1
  }
}
```

---

## 17. Frontend Architecture

```
frontend/src/
├── App.jsx              — Router + tabs
├── index.css            — TradingView dark theme
├── components/
│   ├── AdvisoryDashboard.jsx    — Main screener view
│   ├── StockCard.jsx            — Per-stock signal card
│   ├── AuditDashboard.jsx       — Signal accuracy audit (all 16 sections)
│   ├── MarketPulse.jsx          — Market breadth + regime
│   ├── FOScorer.jsx             — F&O OI quality dashboard
│   ├── AlertCenter.jsx          — Real-time FIRE alerts
│   ├── OrderDominance.jsx       — Buyer/seller dominance
│   ├── NSEIntelligence.jsx      — Market intelligence panel
│   ├── CePeSniper.jsx           — CE/PE option picker
│   └── IntradayOptionPicker.jsx — Intraday option CE/PE scanner
```

**TradingView Color Palette:**
- Background: `#131722`
- Cards: `#1E222D`
- Bull Green: `#0ECB81`
- Bear Red: `#F23645`
- Orange: `#FF9800`
- Blue: `#2196F3`
- Text Primary: `#D1D4DC`
- Text Muted: `#787B86`
- Border: `rgba(255,255,255,0.06)`

---

## 18. Setup & Running

### Prerequisites
- Node.js 18+
- NSE cookie (auto-refreshed by `refreshCookies()` on startup)

### Backend
```bash
cd backend
npm install
node server.js        # Production
npm run dev           # Development (nodemon)
```

Default port: 5000 (configurable via `PORT` env var)

### Frontend
```bash
cd frontend
npm install
npm run dev           # Dev server :5173
npm run build         # Production build → dist/
```

### Environment Variables
```
PORT=5000
ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=info
```

### First Run After Major Changes
1. Start backend: `node server.js`
2. Wait for first scan cycle (~2 min)
3. Call cleanup: `POST /api/audit/refresh`
   - Expires all signals with sl=0/target=0 (bad data from pre-synthetic-level era)
   - Marks outcomes for any signals with prices already past target/SL
4. Open AuditDashboard to verify accuracy is tracking

---

## 19. Recent Changes (June 2026)

### Bug Fixes — Audit Accuracy System

**1. Deduplication: date-based → pending-based**
- Old: blocked re-logging on same calendar date
- New: blocks re-logging while ANY PENDING signal exists for that symbol+section
- Effect: no more redundant daily re-logging; trade tracked until resolution

**2. Synthetic Levels — fixes sl=0/target=0 bug**
- Root cause: intraday screener stocks have no trade levels
- Fix: section-specific ±% fallbacks applied at log time (all 2:1 R:R)
- Effect: all signals now have valid levels for autoCheckOutcomes to price-check

**3. Accuracy Formula Corrected**
- Old: `accuracy = decided / total` (denominator included EXPIRED)
- New: `accuracy = TARGET_HIT / (TARGET_HIT + SL_HIT)` — pure win rate
- Effect: accuracy now measures real signal quality, not miss rate

**4. autoCheckOutcomes — accepts full state**
- Old: only checked `state.cachedResults` for prices
- New: accepts full state object, merges `cachedResults` + `cachedIntraday`
- Effect: intraday signals now get proper price-based resolution

**5. Bad Data Expiry**
- Signals with `sl <= 0 AND target <= 0` are immediately expired on next refresh
- Note: "Auto-expired: no trade levels" added to signal
- Effect: cleans legacy bad data stuck in PENDING forever

### New Features

**tradingThought.js — Human Trader Decision Engine (313 lines)**
- 6-step evaluation: Market Context → Setup → Entry → Risk → Psychology → Session
- thoughtScore (0–100) attached to every logged signal
- Hard blocks: revenge trading (≥ 2 SL today), absurd R:R (< 0.5)
- Quality gate: signals with thoughtScore < 25 are not logged
- Session filter: blocks intraday entries during Opening/Closing Chaos
- Psychology: revenge, overconfidence, fear, greed, overtrading detection

**Enhanced Audit Statistics**
- `profitFactor` = gross profit ÷ gross loss
- `plRatio` = avg win ÷ avg loss
- `maxDrawdown` = max equity curve drawdown %
- `maxConsecLoss` = max consecutive SL_HIT streak
- `expiredRate` = % of signals that expired

**AuditDashboard Improvements**
- Each section card now shows Profit Factor, Max Drawdown, P/L Ratio
- Overall stats bar includes aggregated Profit Factor and worst Max Drawdown
- Section quick-stats sidebar includes all 9 metrics
- Color coding: green ≥ threshold, orange near threshold, red below

---

## 20. Trading Philosophy Summary

> "Discipline + Patience + Emotional Control = Consistent Profit"

The system encodes these human trading principles:

1. **Trade with the trend** — HTF structure must be aligned (BOS confirmed)
2. **Wait for pullback to key level** — OB, FVG, or support (discount zone)
3. **Confirm before entry** — Pattern + OI + volume must agree
4. **Define risk first** — SL at structure, target at 2:1 minimum
5. **Session awareness** — Best window 9:45–11:59, avoid opening/closing chaos
6. **Psychology discipline** — No revenge trades; win streak = reduce size
7. **News awareness** — Stay flat ±15 min around high-impact events
8. **Position sizing** — Fixed % risk (1–2%) per trade, never more
9. **Compounding** — Small consistent wins compound to life-changing returns
10. **Quality over quantity** — 3 A-grade setups beat 10 C-grade setups

The `thoughtScore` quantifies all of the above into a single number. A score ≥ 60 means the system agrees with the trade idea. A score ≥ 80 means it's a high-conviction setup worth full position size.
