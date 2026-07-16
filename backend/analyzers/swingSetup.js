/**
 * 2-3 Day Swing Trade Setup Screener
 *
 * Exactly 6 criteria (all must pass for high-probability trade):
 *  1. Higher Highs + Higher Lows on 4H / 1D chart
 *  2. Price above EMA20 AND EMA50, both sloping up
 *  3. Bull Flag OR Ascending Triangle forming
 *  4. Breakout candle closes above resistance with above-average volume
 *  5. RSI not in extreme overbought (< 75)
 *  6. ATR-based SL (1-2 ATR) and Target (1.5-2x risk) defined
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

// ── Criterion 1: Higher Highs + Higher Lows ──────────────────────────────────
function checkHHHL(candles) {
  if (!candles || candles.length < 20) return { pass: false, detail: 'Insufficient data' };

  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);

  // Split into 3 segments and check progression
  const seg = Math.floor(candles.length / 3);
  const h1 = Math.max(...highs.slice(0, seg));
  const h2 = Math.max(...highs.slice(seg, seg * 2));
  const h3 = Math.max(...highs.slice(seg * 2));
  const l1 = Math.min(...lows.slice(0, seg));
  const l2 = Math.min(...lows.slice(seg, seg * 2));
  const l3 = Math.min(...lows.slice(seg * 2));

  const hhPass = h3 > h2 && h2 > h1;
  const hlPass = l3 > l2 && l2 > l1;

  // Also check last 2 swing highs/lows
  const recentHH = Math.max(...highs.slice(-10)) > Math.max(...highs.slice(-20, -10));
  const recentHL = Math.min(...lows.slice(-10))  > Math.min(...lows.slice(-20, -10));

  const pass = (hhPass || recentHH) && (hlPass || recentHL);
  return {
    pass,
    detail: pass
      ? `HH: ${h2.toFixed(0)}→${h3.toFixed(0)} | HL: ${l2.toFixed(0)}→${l3.toFixed(0)}`
      : `No clear HH-HL structure`,
    hhPass: hhPass || recentHH,
    hlPass: hlPass || recentHL,
  };
}

// ── Criterion 2: Price above EMA20 & EMA50, both sloping up ──────────────────
function checkEMAs(candles) {
  if (!candles || candles.length < 52) return { pass: false, detail: 'Need 52+ candles' };

  const closes = candles.map(c => c.close);
  const cur    = closes[closes.length - 1];

  const ema20     = calcEMA(closes, 20);
  const ema50     = calcEMA(closes, 50);
  const ema20prev = calcEMA(closes.slice(0, -3), 20); // 3 candles ago
  const ema50prev = calcEMA(closes.slice(0, -3), 50);

  const aboveEMA20  = cur > ema20;
  const aboveEMA50  = cur > ema50;
  const ema20Slope  = ema20 > ema20prev;
  const ema50Slope  = ema50 > ema50prev;
  const ema20AboveEMA50 = ema20 > ema50;

  const pass = aboveEMA20 && aboveEMA50 && ema20Slope && ema50Slope && ema20AboveEMA50;

  return {
    pass,
    detail: pass
      ? `Price ₹${cur.toFixed(0)} > EMA20 ₹${ema20.toFixed(0)} > EMA50 ₹${ema50.toFixed(0)}, both rising`
      : `${!aboveEMA20 ? 'Below EMA20 ' : ''}${!aboveEMA50 ? 'Below EMA50 ' : ''}${!ema20Slope ? 'EMA20 flat ' : ''}${!ema50Slope ? 'EMA50 flat' : ''}`.trim(),
    ema20: parseFloat(ema20.toFixed(2)),
    ema50: parseFloat(ema50.toFixed(2)),
    ema20Slope,
    ema50Slope,
    aboveEMA20,
    aboveEMA50,
    ema20AboveEMA50,
  };
}

// ── Criterion 3: Bull Flag OR Ascending Triangle ──────────────────────────────
function checkPattern(candles) {
  if (!candles || candles.length < 20) return { pass: false, pattern: null, detail: 'Insufficient data' };

  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const n      = candles.length - 1;
  const atrVal = calcATR(candles, 14);

  // Bull Flag: strong pole (5-15 candles), then tight consolidation (3-8 candles)
  let bullFlag = false, flagDetail = '';
  if (n >= 15) {
    const poleHigh = Math.max(...highs.slice(-15, -5));
    const poleLow  = Math.min(...lows.slice(-15, -5));
    const flagHigh = Math.max(...highs.slice(-5));
    const flagLow  = Math.min(...lows.slice(-5));
    const poleMove = poleHigh - poleLow;
    const flagRange= flagHigh - flagLow;
    const poleStrong = poleMove > atrVal * 3;
    const flagTight  = flagRange < poleMove * 0.4;
    const flagHolds  = flagLow > poleLow * 1.01;
    if (poleStrong && flagTight && flagHolds) {
      bullFlag = true;
      flagDetail = `Bull Flag: pole ${poleMove.toFixed(0)} pts, flag range ${flagRange.toFixed(0)} pts`;
    }
  }

  // Ascending Triangle: flat resistance + rising lows
  let ascTriangle = false, triDetail = '';
  if (n >= 20) {
    const recentHighs = highs.slice(-20);
    const recentLows  = lows.slice(-20);
    const maxH = Math.max(...recentHighs);
    const minH = Math.min(...recentHighs);
    const flatResistance = (maxH - minH) / maxH < 0.02;
    const firstLow = recentLows[0];
    const lastLow  = recentLows[recentLows.length - 1];
    const risingLows = lastLow > firstLow * 1.015;
    if (flatResistance && risingLows) {
      ascTriangle = true;
      triDetail = `Ascending Triangle: resistance ₹${maxH.toFixed(0)}, lows rising ${firstLow.toFixed(0)}→${lastLow.toFixed(0)}`;
    }
  }

  const pass = bullFlag || ascTriangle;
  return {
    pass,
    pattern: bullFlag ? 'Bull Flag' : ascTriangle ? 'Ascending Triangle' : null,
    detail: pass ? (bullFlag ? flagDetail : triDetail) : 'No Bull Flag or Ascending Triangle detected',
    bullFlag,
    ascTriangle,
  };
}

// ── Criterion 4: Breakout candle above resistance with above-avg volume ───────
function checkBreakout(candles) {
  if (!candles || candles.length < 25) return { pass: false, detail: 'Insufficient data' };

  const highs   = candles.map(c => c.high);
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n       = candles.length - 1;
  const cur     = closes[n];

  // Resistance = highest high of last 20 candles (excluding last 2)
  const resistance = Math.max(...highs.slice(-22, -2));
  const breakout   = cur >= resistance * 0.998; // within 0.2% of resistance or above

  // Volume check: last candle vs 20-period average
  const avgVol  = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[n];
  const volRatio = avgVol > 0 ? lastVol / avgVol : 1;
  const volAboveAvg = volRatio >= 1.3; // 30% above average

  // Candle closes above (not just touches)
  const closesAbove = cur > resistance;

  const pass = breakout && volAboveAvg;

  return {
    pass,
    detail: pass
      ? `Breakout above ₹${resistance.toFixed(0)} with ${volRatio.toFixed(1)}x volume`
      : `${!breakout ? `Price ₹${cur.toFixed(0)} below resistance ₹${resistance.toFixed(0)}` : `Volume only ${volRatio.toFixed(1)}x avg`}`,
    resistance: parseFloat(resistance.toFixed(2)),
    volRatio:   parseFloat(volRatio.toFixed(2)),
    closesAbove,
    breakout,
    volAboveAvg,
  };
}

// ── Criterion 5: RSI not extreme overbought ───────────────────────────────────
function checkRSI(candles) {
  if (!candles || candles.length < 16) return { pass: false, detail: 'Insufficient data', rsi: 50 };

  const closes = candles.map(c => c.close);
  const rsiVal = calcRSI(closes, 14);

  // Ideal: 45–72 (healthy momentum, not overbought)
  // Acceptable: up to 75
  const pass    = rsiVal < 75;
  const ideal   = rsiVal >= 45 && rsiVal <= 72;

  return {
    pass,
    ideal,
    rsi: rsiVal,
    detail: pass
      ? `RSI ${rsiVal} — ${ideal ? 'ideal entry zone' : 'acceptable (watch for reversal)'}`
      : `RSI ${rsiVal} — extreme overbought, avoid buying`,
  };
}

// ── Criterion 6: ATR-based SL and Target ─────────────────────────────────────
function calcTradeSetup(candles, atrMultSL = 1.5, atrMultTarget = 2.5) {
  if (!candles || candles.length < 15) return null;

  const closes = candles.map(c => c.close);
  const lows   = candles.map(c => c.low);
  const atrVal = calcATR(candles, 14);
  const cur    = closes[closes.length - 1];

  if (atrVal === 0) return null;

  // SL: 1-2 ATR below current price (or below recent swing low)
  const swingLow = Math.min(...lows.slice(-5));
  const atrSL    = cur - atrVal * atrMultSL;
  const sl       = Math.max(atrSL, swingLow - atrVal * 0.3); // whichever is tighter

  // Target: 1.5-2x the risk
  const risk     = cur - sl;
  const target1  = cur + risk * 1.5; // 1.5R
  const target2  = cur + risk * 2.5; // 2.5R (stretch)
  const rr       = risk > 0 ? parseFloat((risk * 2 / risk).toFixed(1)) : 0;

  return {
    pass:    risk > 0 && risk < cur * 0.08, // SL not more than 8% away
    entry:   parseFloat(cur.toFixed(2)),
    sl:      parseFloat(sl.toFixed(2)),
    target1: parseFloat(target1.toFixed(2)),
    target2: parseFloat(target2.toFixed(2)),
    atr:     parseFloat(atrVal.toFixed(2)),
    risk:    parseFloat(risk.toFixed(2)),
    riskPct: parseFloat((risk / cur * 100).toFixed(2)),
    rr:      2.0,
    detail:  `Entry ₹${cur.toFixed(0)} | SL ₹${sl.toFixed(0)} (${(risk/cur*100).toFixed(1)}%) | T1 ₹${target1.toFixed(0)} | T2 ₹${target2.toFixed(0)}`,
  };
}

// ── Master evaluator ──────────────────────────────────────────────────────────
function evaluateSwingSetup(symbol, candles4h, candles1d, stock) {
  // Use 1D as primary, 4H as confirmation (Yahoo gives 1h which we use as proxy for 4H)
  const primary   = candles1d || candles4h;
  const secondary = candles4h || candles1d;

  if (!primary || primary.length < 20) return null;

  const c1 = checkHHHL(primary);
  const c2 = checkEMAs(primary);
  const c3 = checkPattern(primary);
  const c4 = checkBreakout(primary);
  const c5 = checkRSI(primary);
  const c6 = calcTradeSetup(primary);

  const criteria = [
    { id: 1, label: 'Higher Highs & Higher Lows',          pass: c1.pass, detail: c1.detail },
    { id: 2, label: 'Price above EMA20 & EMA50 (sloping)', pass: c2.pass, detail: c2.detail },
    { id: 3, label: 'Bull Flag / Ascending Triangle',       pass: c3.pass, detail: c3.detail },
    { id: 4, label: 'Breakout above resistance + volume',   pass: c4.pass, detail: c4.detail },
    { id: 5, label: 'RSI not extreme overbought (< 75)',    pass: c5.pass, detail: c5.detail },
    { id: 6, label: 'ATR stop loss & 1.5-2x target defined',pass: c6?.pass ?? false, detail: c6?.detail || 'Cannot calculate' },
  ];

  const passed = criteria.filter(c => c.pass).length;
  const allPass = passed === 6;
  const score   = Math.round((passed / 6) * 100);

  // Confidence label
  const confidence = allPass ? 'HIGH PROBABILITY'
    : passed >= 5 ? 'STRONG SETUP'
    : passed >= 4 ? 'WATCH'
    : 'NOT READY';

  const confColor = allPass ? '#00c853'
    : passed >= 5 ? '#69f0ae'
    : passed >= 4 ? '#ffd740'
    : '#90a4ae';

  if (passed < 4) return null; // Only show 4+ criteria met

  return {
    symbol,
    ltp:        stock?.ltp || primary[primary.length - 1]?.close || 0,
    change:     stock?.change || 0,
    passed,
    total:      6,
    score,
    allPass,
    confidence,
    confColor,
    criteria,
    setup:      c6,
    ema:        { ema20: c2.ema20, ema50: c2.ema50, ema20Slope: c2.ema20Slope, ema50Slope: c2.ema50Slope },
    pattern:    c3.pattern,
    rsi:        c5.rsi,
    resistance: c4.resistance,
    volRatio:   c4.volRatio,
    timeframe:  candles1d ? '1D' : '4H',
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = { evaluateSwingSetup, checkHHHL, checkEMAs, checkPattern, checkBreakout, checkRSI, calcTradeSetup };
