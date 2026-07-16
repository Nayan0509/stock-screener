# StockRadar — NSE Real-Time Screener

## Start

**Terminal 1 — Backend:**
```bash
cd stock-screener/backend
npm start
```

**Terminal 2 — Frontend:**
```bash
cd stock-screener/frontend
npm run dev
```

Open: http://localhost:5173

## How It Works

- Scrapes NSE live data (F&O stocks, Nifty 500)
- Scores each stock on 4 dimensions:
  - **OI Analysis** (Long Buildup, Short Covering, OI Surge)
  - **Volume** (surge vs 20-day average)
  - **Chart Patterns** (Breakout, Bull Flag, Cup & Handle, EMA crossover, RSI, MACD)
  - **Fundamentals** (PE, ROE, Debt/Equity, Growth)
- Composite score 0-100, ranked and filtered
- WebSocket push every 3 minutes during market hours (9:15–15:30 IST)
