const { calcEMA, calcRSI, calcATR } = require('./chartPatterns');

/**
 * Safety Filter — eliminates stocks that are risky to buy
 *
 * A stock FAILS safety if ANY of these are true:
 *  - Price below EMA50 (downtrend)
 *  - RSI > 78 (overbought — late entry risk)
 *  - RSI < 25 (severe weakness)
 *  - Price more than 20% below 52W high AND in downtrend
 *  - Volume drying up (< 30% of avg) — no interest
 *  - Price < ₹10 (penny stock — manipulation risk)
 *  - 52W high/low spread < 5% (dead stock, no movement)
 *  - Consecutive 5 red candles with increasing volume (distribution)
 *  - Price below EMA200 AND EMA50 below EMA200 (bear market structure)
 */
function applySafetyFilter(stock, candles) {
  const reasons = [];

  // Basic price filter
  if (stock.ltp < 10) {
    return { safe: false, reasons: ['Penny stock (< ₹10)'] };
  }

  // Dead stock
  if (stock.high52 > 0 && stock.low52 > 0) {
    const spread = (stock.high52 - stock.low52) / stock.low52;
    if (spread < 0.05) {
      return { safe: false, reasons: ['Dead stock — less than 5% annual range'] };
    }
  }

  if (!candles || candles.length < 30) {
    // Not enough data — allow but mark as unverified
    return { safe: true, reasons: ['Insufficient history — unverified'] };
  }

  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n       = closes.length - 1;

  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const rsi    = calcRSI(closes);
  const atr    = calcATR(candles);
  const cur    = closes[n];

  const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;

  // ── Hard disqualifiers ────────────────────────────────────────────────────

  // Bear market structure: price below EMA200 AND EMA50 < EMA200
  if (ema200 && cur < ema200 && ema50 < ema200) {
    reasons.push('Bear market structure (below EMA200)');
  }

  // Price below EMA50 — downtrend
  if (cur < ema50 * 0.97) {
    reasons.push('Price below EMA50 — downtrend');
  }

  // RSI overbought
  if (rsi > 78) {
    reasons.push(`RSI overbought (${rsi.toFixed(0)}) — late entry risk`);
  }

  // RSI extreme weakness
  if (rsi < 22) {
    reasons.push(`RSI extremely weak (${rsi.toFixed(0)})`);
  }

  // Volume drying up
  if (avgVol > 0 && volumes[n] < avgVol * 0.25) {
    reasons.push('Volume dried up — no institutional interest');
  }

  // Distribution: 5 consecutive red candles with rising volume
  if (n >= 5) {
    const last5 = candles.slice(-5);
    const allRed = last5.every(c => c.close < c.open);
    const volRising = last5[4].volume > last5[0].volume;
    if (allRed && volRising) {
      reasons.push('Distribution pattern — 5 red candles with rising volume');
    }
  }

  // Extreme gap from 52W high in downtrend
  if (stock.high52 > 0) {
    const fromHigh = (stock.high52 - cur) / stock.high52;
    if (fromHigh > 0.45 && cur < ema50) {
      reasons.push(`${(fromHigh * 100).toFixed(0)}% below 52W high in downtrend`);
    }
  }

  if (reasons.length > 0) return { safe: false, reasons };
  return { safe: true, reasons: [] };
}

/**
 * Safety score 0-100 (higher = safer to buy)
 */
function calcSafetyScore(stock, candles) {
  if (!candles || candles.length < 30) return 50;

  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n       = closes.length - 1;
  const cur     = closes[n];

  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const rsi    = calcRSI(closes);
  const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const volRatio = avgVol > 0 ? volumes[n] / avgVol : 1;

  let score = 0;

  // Trend alignment (40 pts)
  if (cur > ema20)  score += 10;
  if (cur > ema50)  score += 15;
  if (ema200 && cur > ema200) score += 15;

  // RSI in ideal zone (20 pts)
  if (rsi >= 45 && rsi <= 65) score += 20;
  else if (rsi >= 35 && rsi < 45) score += 12;
  else if (rsi > 65 && rsi <= 72) score += 8;

  // Volume health (20 pts)
  if (volRatio >= 1.5) score += 20;
  else if (volRatio >= 1.0) score += 12;
  else if (volRatio >= 0.5) score += 6;

  // Near 52W high (20 pts)
  if (stock.high52 > 0) {
    const pctFromHigh = (stock.high52 - cur) / stock.high52;
    if (pctFromHigh <= 0.05) score += 20;
    else if (pctFromHigh <= 0.15) score += 12;
    else if (pctFromHigh <= 0.25) score += 6;
  }

  return Math.min(score, 100);
}

module.exports = { applySafetyFilter, calcSafetyScore };
