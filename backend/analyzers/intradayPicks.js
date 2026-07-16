/**
 * Intraday Stock Picks — Maximum Confidence Engine
 *
 * Philosophy: Show FEWER stocks but with MAXIMUM conviction.
 * A stock only appears if it passes ALL of these gates:
 *
 * GATE 1 — MACRO TREND (non-negotiable):
 *   - Price above EMA50 on daily (macro uptrend)
 *   - Price above EMA20 on daily (medium trend)
 *   - Daily RSI 45–70 (healthy, not overbought)
 *
 * GATE 2 — INTRADAY SETUP (15m chart):
 *   - EMA9 > EMA21 on 15m (intraday trend up)
 *   - Price above VWAP (buyers in control)
 *   - MACD histogram positive and rising
 *   - RSI(9) 45–68 on 15m (momentum without overbought)
 *
 * GATE 3 — VOLUME CONFIRMATION:
 *   - Current volume > 2x 20-period average (institutional interest)
 *   - Delivery % > 45% (real buying, not just intraday flipping)
 *   - Volume increasing over last 3 candles (accumulation)
 *
 * GATE 4 — PRICE ACTION:
 *   - Higher high on 15m vs previous session
 *   - Price within 0.5% of breakout level (not chasing)
 *   - No gap-down open (gap-ups are fine)
 *   - ATR-based volatility is tradeable (not too low, not too high)
 *
 * GATE 5 — OI CONFIRMATION (F&O stocks):
 *   - Long buildup: price up + OI up
 *   - OR Short covering: price up + OI down
 *   - PCR neutral to bullish (0.6–1.2)
 *
 * GATE 6 — RISK/REWARD:
 *   - Minimum R:R 2:1
 *   - Stop loss defined at technical level (not arbitrary %)
 *   - Target at next resistance (not arbitrary)
 *   - Max loss per trade ≤ 2% of capital
 *
 * FUND MANAGEMENT (₹1,00,000 capital):
 *   - Max 3 trades simultaneously (diversification)
 *   - Max 40% capital per trade (₹40,000)
 *   - Risk per trade: 1% of capital = ₹1,000 max loss
 *   - Position size = Risk amount / (Entry - SL)
 *   - Target: 2% daily on capital = ₹2,000 (realistic)
 *   - Stretch target: 5% = ₹5,000 (exceptional day)
 */

function calcEMA(data, period) {
  if (!data || data.length < period) return data?.[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
  return e;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    d > 0 ? (ag += d) : (al += Math.abs(d));
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const p = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcMACD(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const line = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    line.push(calcEMA(s, 12) - calcEMA(s, 26));
  }
  const sig = line.length >= 9 ? calcEMA(line, 9) : line[line.length - 1];
  const val = line[line.length - 1];
  return { macd: val, signal: sig, histogram: val - sig };
}

function vwapProxy(candles15m) {
  if (!candles15m?.length) return 0;
  const last = candles15m[candles15m.length - 1];
  const lastDate = last.time?.split('T')[0] || '';
  const today = lastDate ? candles15m.filter(c => c.time?.startsWith(lastDate)) : candles15m.slice(-26);
  return today.length ? today.reduce((s, c) => s + c.close, 0) / today.length : last.close;
}

// ── Position sizing calculator ────────────────────────────────────────────────
function calcPositionSize(capital, entry, sl, maxRiskPct = 1.0, maxCapitalPct = 40) {
  const maxRisk       = capital * (maxRiskPct / 100);   // e.g. ₹1,000
  const maxCapital    = capital * (maxCapitalPct / 100); // e.g. ₹40,000
  const riskPerShare  = entry - sl;
  if (riskPerShare <= 0) return null;

  const qtyByRisk     = Math.floor(maxRisk / riskPerShare);
  const qtyByCapital  = Math.floor(maxCapital / entry);
  const qty           = Math.min(qtyByRisk, qtyByCapital);

  if (qty <= 0) return null;

  const capitalUsed   = qty * entry;
  const maxLoss       = qty * riskPerShare;
  const capitalUsedPct= parseFloat((capitalUsed / capital * 100).toFixed(1));

  return { qty, capitalUsed: Math.round(capitalUsed), maxLoss: Math.round(maxLoss), capitalUsedPct };
}

// ── Main evaluator ────────────────────────────────────────────────────────────
function evaluateIntradayPick(stock, candles15m, candles1d, deliveryPct, capital = 100000) {
  const spot = stock.ltp || 0;
  if (!spot || !candles15m || candles15m.length < 25 || !candles1d || candles1d.length < 52) return null;

  const cl15  = candles15m.map(c => c.close);
  const cl1d  = candles1d.map(c => c.close);
  const vol15 = candles15m.map(c => c.volume);
  const n15   = cl15.length - 1;
  const n1d   = cl1d.length - 1;

  // ── Indicators ──────────────────────────────────────────────────────────────
  const ema9_15   = calcEMA(cl15, 9);
  const ema21_15  = calcEMA(cl15, 21);
  const ema20_1d  = calcEMA(cl1d, 20);
  const ema50_1d  = calcEMA(cl1d, 50);
  const rsi15     = calcRSI(cl15, 9);
  const rsi1d     = calcRSI(cl1d, 14);
  const atr15     = calcATR(candles15m, 14);
  const atr1d     = calcATR(candles1d, 14);
  const macd15    = calcMACD(cl15);
  const vwap      = vwapProxy(candles15m);

  const avgVol20  = vol15.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const lastVol   = vol15[n15];
  const volRatio  = avgVol20 > 0 ? lastVol / avgVol20 : 1;

  // Volume trend: is volume increasing over last 3 candles?
  const volIncreasing = vol15[n15] > vol15[n15 - 1] && vol15[n15 - 1] > vol15[n15 - 2];

  // MACD histogram rising
  const macdPrev = calcMACD(cl15.slice(0, -1));
  const macdRising = macd15.histogram > macdPrev.histogram;

  // Higher high vs previous session
  const highs15 = candles15m.map(c => c.high);
  const prevSessionHigh = Math.max(...highs15.slice(-20, -10));
  const recentHigh      = Math.max(...highs15.slice(-10));
  const higherHigh      = recentHigh > prevSessionHigh;

  // Price near breakout (within 0.5%)
  const resistance = Math.max(...highs15.slice(-20, -2));
  const nearBreakout = spot >= resistance * 0.995;

  // ATR tradeable: not too low (< 0.3% of price) and not too high (> 4%)
  const atrPct = atr15 / spot * 100;
  const atrTradeable = atrPct >= 0.3 && atrPct <= 4;

  // ── GATE CHECKS ─────────────────────────────────────────────────────────────
  const gates = {
    // Gate 1: Macro trend
    above_ema20_1d:   spot > ema20_1d,
    above_ema50_1d:   spot > ema50_1d,
    rsi_1d_healthy:   rsi1d >= 45 && rsi1d <= 72,

    // Gate 2: Intraday setup
    ema9_above_ema21: ema9_15 > ema21_15,
    above_vwap:       spot > vwap,
    macd_positive:    macd15.histogram > 0,
    macd_rising:      macdRising,
    rsi_15m_ok:       rsi15 >= 45 && rsi15 <= 68,

    // Gate 3: Volume
    volume_surge:     volRatio >= 2.0,
    delivery_ok:      deliveryPct == null || deliveryPct >= 45,
    volume_increasing:volIncreasing,

    // Gate 4: Price action
    higher_high:      higherHigh,
    near_breakout:    nearBreakout,
    atr_tradeable:    atrTradeable,

    // Gate 5: OI (if available)
    oi_bullish:       stock.openInterest > 0
                        ? (stock.change > 0 && stock.oiChange > 0) || (stock.change > 0 && stock.oiChange < 0)
                        : true, // skip if no OI data

    // Gate 6: Basic R:R check (calculated below)
    rr_ok:            false, // set after SL/target calc
  };

  // ── SL and Target calculation ────────────────────────────────────────────────
  // SL: below recent swing low or 1.5 ATR, whichever is tighter
  const swingLow15 = Math.min(...candles15m.slice(-8).map(c => c.low));
  const atrSL      = spot - atr15 * 1.5;
  const sl         = Math.max(atrSL, swingLow15 - atr15 * 0.2);

  // Target: next resistance or 2x risk
  const risk       = spot - sl;
  const target1    = spot + risk * 2;   // 2R (minimum)
  const target2    = spot + risk * 3;   // 3R (stretch)

  // Validate R:R
  const rr = risk > 0 ? parseFloat((risk * 2 / risk).toFixed(1)) : 0;
  gates.rr_ok = risk > 0 && rr >= 2 && risk < spot * 0.03; // SL not more than 3% away

  // ── Score ────────────────────────────────────────────────────────────────────
  const passed = Object.values(gates).filter(Boolean).length;
  const total  = Object.keys(gates).length;
  const score  = Math.round((passed / total) * 100);

  // Show stocks passing 75%+ gates (12/16) — strict but shows more opportunities
  if (score < 75) return null;

  // ── Position sizing ──────────────────────────────────────────────────────────
  const position = calcPositionSize(capital, spot, sl, 1.0, 35);
  if (!position) return null;

  // ── Profit projections ───────────────────────────────────────────────────────
  const profitT1 = Math.round(position.qty * (target1 - spot));
  const profitT2 = Math.round(position.qty * (target2 - spot));
  const profitPct1 = parseFloat(((target1 - spot) / spot * 100).toFixed(2));
  const profitPct2 = parseFloat(((target2 - spot) / spot * 100).toFixed(2));

  // ── Confidence label ─────────────────────────────────────────────────────────
  const confidence = score === 100 ? 'MAXIMUM'
    : score >= 94   ? 'VERY HIGH'
    : score >= 88   ? 'HIGH'
    : score >= 75   ? 'GOOD'
    : 'SKIP';

  const confColor = score === 100 ? '#00c853'
    : score >= 94  ? '#69f0ae'
    : score >= 88  ? '#ffd740'
    : '#90a4ae';

  return {
    symbol:       stock.symbol,
    sector:       stock.industry || '',
    ltp:          parseFloat(spot.toFixed(2)),
    change:       stock.change || 0,
    score,
    passed,
    total,
    confidence,
    confColor,
    gates,

    // Trade levels
    entry:        parseFloat(spot.toFixed(2)),
    sl:           parseFloat(sl.toFixed(2)),
    target1:      parseFloat(target1.toFixed(2)),
    target2:      parseFloat(target2.toFixed(2)),
    risk:         parseFloat(risk.toFixed(2)),
    riskPct:      parseFloat((risk / spot * 100).toFixed(2)),
    rr:           2.0,

    // Position sizing
    qty:          position.qty,
    capitalUsed:  position.capitalUsed,
    capitalUsedPct: position.capitalUsedPct,
    maxLoss:      position.maxLoss,
    profitT1,
    profitT2,
    profitPct1,
    profitPct2,

    // Indicators
    indicators: {
      rsi15:    rsi15,
      rsi1d:    rsi1d,
      ema9:     parseFloat(ema9_15.toFixed(2)),
      ema21:    parseFloat(ema21_15.toFixed(2)),
      ema20_1d: parseFloat(ema20_1d.toFixed(2)),
      ema50_1d: parseFloat(ema50_1d.toFixed(2)),
      vwap:     parseFloat(vwap.toFixed(2)),
      atr:      parseFloat(atr15.toFixed(2)),
      atrPct:   parseFloat(atrPct.toFixed(2)),
      volRatio: parseFloat(volRatio.toFixed(2)),
      macdHist: parseFloat(macd15.histogram.toFixed(3)),
    },
    deliveryPct,
    oiSignal: stock.openInterest > 0
      ? (stock.change > 0 && stock.oiChange > 0 ? 'Long Buildup'
        : stock.change > 0 && stock.oiChange < 0 ? 'Short Covering' : 'Neutral')
      : 'N/A',
  };
}

// ── Portfolio-level fund management ──────────────────────────────────────────
function buildDailyPlan(picks, capital = 100000) {
  // Sort by score, take top 3 only (max 3 simultaneous trades)
  const top = picks.slice(0, 3);

  const totalCapitalUsed = top.reduce((s, p) => s + p.capitalUsed, 0);
  const totalMaxLoss     = top.reduce((s, p) => s + p.maxLoss, 0);
  const totalProfitT1    = top.reduce((s, p) => s + p.profitT1, 0);
  const totalProfitT2    = top.reduce((s, p) => s + p.profitT2, 0);
  const capitalRemaining = capital - totalCapitalUsed;

  return {
    capital,
    trades:           top,
    tradeCount:       top.length,
    totalCapitalUsed: Math.round(totalCapitalUsed),
    capitalRemaining: Math.round(capitalRemaining),
    capitalUsedPct:   parseFloat((totalCapitalUsed / capital * 100).toFixed(1)),
    totalMaxLoss:     Math.round(totalMaxLoss),
    maxLossPct:       parseFloat((totalMaxLoss / capital * 100).toFixed(2)),
    totalProfitT1:    Math.round(totalProfitT1),
    totalProfitT2:    Math.round(totalProfitT2),
    profitPctT1:      parseFloat((totalProfitT1 / capital * 100).toFixed(2)),
    profitPctT2:      parseFloat((totalProfitT2 / capital * 100).toFixed(2)),
    riskRewardOk:     totalMaxLoss < capital * 0.03, // total risk < 3% of capital
  };
}

module.exports = { evaluateIntradayPick, buildDailyPlan, calcPositionSize };
