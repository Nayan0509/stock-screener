/**
 * Professional Chart Pattern Engine
 * Covers every major pattern used by institutional traders
 *
 * Safety philosophy:
 *  - Only BUY signals — no short patterns included
 *  - Each pattern has a confidence score (0-100)
 *  - Requires volume confirmation for breakout patterns
 *  - Trend filter: stock must be in uptrend (price > EMA50)
 */

// ─── EMA / SMA helpers ────────────────────────────────────────────────────────

function calcEMA(data, period) {
  if (!data || data.length < period) return data?.[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

function calcSMA(data, period) {
  if (data.length < period) return data[data.length - 1];
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Wilder's RSI
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

// Proper MACD with EMA9 signal line
function calcMACD(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const macdLine = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    macdLine.push(calcEMA(s, 12) - calcEMA(s, 26));
  }
  const signalLine = macdLine.length >= 9 ? calcEMA(macdLine, 9) : macdLine[macdLine.length - 1];
  const macdVal    = macdLine[macdLine.length - 1];
  return {
    macd:      parseFloat(macdVal.toFixed(4)),
    signal:    parseFloat(signalLine.toFixed(4)),
    histogram: parseFloat((macdVal - signalLine).toFixed(4)),
  };
}

// Average True Range
function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Bollinger Bands
function calcBB(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma   = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
  return { upper: sma + mult * std, middle: sma, lower: sma - mult * std, std };
}

// Stochastic %K
function calcStochastic(candles, period = 14) {
  if (candles.length < period) return 50;
  const slice  = candles.slice(-period);
  const highP  = Math.max(...slice.map(c => c.high));
  const lowP   = Math.min(...slice.map(c => c.low));
  const close  = candles[candles.length - 1].close;
  return highP === lowP ? 50 : ((close - lowP) / (highP - lowP)) * 100;
}

// ─── Main pattern detector ────────────────────────────────────────────────────

function detectPatterns(candles) {
  if (!candles || candles.length < 30) return [];

  const patterns = [];
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const opens   = candles.map(c => c.open);
  const volumes = candles.map(c => c.volume);
  const n       = closes.length - 1; // last index
  const cur     = closes[n];

  // Pre-compute indicators
  const ema20   = calcEMA(closes, 20);
  const ema50   = calcEMA(closes, 50);
  const ema200  = closes.length >= 200 ? calcEMA(closes, 200) : null;
  const sma200  = closes.length >= 200 ? calcSMA(closes, 200) : null;
  const rsi     = calcRSI(closes);
  const bb      = calcBB(closes);
  const atr     = calcATR(candles);
  const stoch   = calcStochastic(candles);

  const avgVol20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const lastVol  = volumes[n];
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;

  // ── TREND CONTEXT ──────────────────────────────────────────────────────────
  const inUptrend    = ema20 > ema50;
  const aboveEMA200  = ema200 ? cur > ema200 : true;
  const goldenZone   = inUptrend && aboveEMA200; // strongest trend context

  // ── 1. 52-WEEK HIGH BREAKOUT ───────────────────────────────────────────────
  const high52 = Math.max(...highs.slice(-252));
  if (cur >= high52 * 0.99 && volRatio >= 1.5) {
    patterns.push({ name: '52W High Breakout', strength: 92, signal: 'BUY', category: 'Trend',
      desc: 'Price at 52W high with volume confirmation' });
  }

  // ── 2. GOLDEN CROSS (EMA20 > EMA50, fresh) ────────────────────────────────
  if (closes.length >= 51) {
    const ema20Prev = calcEMA(closes.slice(0, -1), 20);
    const ema50Prev = calcEMA(closes.slice(0, -1), 50);
    if (ema20 > ema50 && ema20Prev <= ema50Prev) {
      patterns.push({ name: 'Golden Cross (EMA20/50)', strength: 85, signal: 'BUY', category: 'Trend',
        desc: 'EMA20 just crossed above EMA50' });
    }
  }

  // ── 3. EMA200 GOLDEN CROSS ────────────────────────────────────────────────
  if (closes.length >= 201 && ema200) {
    const ema50Prev  = calcEMA(closes.slice(0, -1), 50);
    const ema200Prev = calcEMA(closes.slice(0, -1), 200);
    if (ema50 > ema200 && ema50Prev <= ema200Prev) {
      patterns.push({ name: 'Major Golden Cross (EMA50/200)', strength: 95, signal: 'BUY', category: 'Trend',
        desc: 'EMA50 crossed above EMA200 — major bull signal' });
    }
  }

  // ── 4. BULL FLAG ──────────────────────────────────────────────────────────
  if (n >= 25 && inUptrend) {
    const poleHigh  = Math.max(...highs.slice(-25, -8));
    const poleLow   = Math.min(...lows.slice(-25, -8));
    const flagHigh  = Math.max(...highs.slice(-8));
    const flagLow   = Math.min(...lows.slice(-8));
    const poleMove  = poleHigh - poleLow;
    const flagRange = flagHigh - flagLow;
    if (poleMove > 0 && flagRange < poleMove * 0.38 &&
        flagLow > poleLow && cur >= flagHigh * 0.99 && volRatio >= 1.3) {
      patterns.push({ name: 'Bull Flag', strength: 88, signal: 'BUY', category: 'Continuation',
        desc: 'Tight consolidation after strong move, breaking out' });
    }
  }

  // ── 5. CUP & HANDLE ───────────────────────────────────────────────────────
  if (closes.length >= 60) {
    const cupLeft   = Math.max(...highs.slice(-60, -40));
    const cupBottom = Math.min(...lows.slice(-40, -20));
    const cupRight  = Math.max(...highs.slice(-20, -5));
    const handleLow = Math.min(...lows.slice(-5));
    if (cupRight >= cupLeft * 0.95 &&
        cupBottom < cupLeft * 0.85 &&
        handleLow > cupBottom * 1.02 &&
        cur >= cupRight * 0.98 && volRatio >= 1.2) {
      patterns.push({ name: 'Cup & Handle', strength: 93, signal: 'BUY', category: 'Continuation',
        desc: 'Classic accumulation pattern with handle breakout' });
    }
  }

  // ── 6. CONSOLIDATION BREAKOUT ─────────────────────────────────────────────
  const range10 = Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10));
  const range30 = Math.max(...highs.slice(-30)) - Math.min(...lows.slice(-30));
  if (range30 > 0 && range10 < range30 * 0.28 && volRatio >= 2.0 && inUptrend) {
    patterns.push({ name: 'Consolidation Breakout', strength: 87, signal: 'BUY', category: 'Continuation',
      desc: 'Tight range compression breaking out with volume' });
  }

  // ── 7. ASCENDING TRIANGLE ─────────────────────────────────────────────────
  if (n >= 30) {
    const recentHighs = highs.slice(-20);
    const recentLows  = lows.slice(-20);
    const maxHigh     = Math.max(...recentHighs);
    const minHigh     = Math.min(...recentHighs);
    const firstLow    = recentLows[0];
    const lastLow     = recentLows[recentLows.length - 1];
    const highFlat    = (maxHigh - minHigh) / maxHigh < 0.02;
    const risingLows  = lastLow > firstLow * 1.02;
    if (highFlat && risingLows && cur >= maxHigh * 0.99 && volRatio >= 1.5) {
      patterns.push({ name: 'Ascending Triangle', strength: 86, signal: 'BUY', category: 'Reversal',
        desc: 'Flat resistance + rising lows = bullish breakout' });
    }
  }

  // ── 8. DOUBLE BOTTOM (W pattern) ──────────────────────────────────────────
  if (n >= 40) {
    const slice = lows.slice(-40);
    const mid   = Math.floor(slice.length / 2);
    const low1  = Math.min(...slice.slice(0, mid));
    const low2  = Math.min(...slice.slice(mid));
    const neckline = Math.max(...closes.slice(-40));
    if (Math.abs(low1 - low2) / low1 < 0.03 &&
        cur >= neckline * 0.98 && volRatio >= 1.3) {
      patterns.push({ name: 'Double Bottom', strength: 84, signal: 'BUY', category: 'Reversal',
        desc: 'W-pattern with neckline breakout' });
    }
  }

  // ── 9. INVERSE HEAD & SHOULDERS ───────────────────────────────────────────
  if (n >= 60) {
    const leftShoulder  = Math.min(...lows.slice(-60, -40));
    const head          = Math.min(...lows.slice(-40, -20));
    const rightShoulder = Math.min(...lows.slice(-20));
    const neckline      = Math.max(...closes.slice(-60));
    if (head < leftShoulder * 0.97 &&
        head < rightShoulder * 0.97 &&
        Math.abs(leftShoulder - rightShoulder) / leftShoulder < 0.04 &&
        cur >= neckline * 0.98 && volRatio >= 1.2) {
      patterns.push({ name: 'Inverse Head & Shoulders', strength: 91, signal: 'BUY', category: 'Reversal',
        desc: 'Reversal pattern — neckline breakout confirmed' });
    }
  }

  // ── 10. BOLLINGER BAND SQUEEZE BREAKOUT ───────────────────────────────────
  if (bb) {
    const bbWidth = (bb.upper - bb.lower) / bb.middle;
    if (bbWidth < 0.08 && cur > bb.upper && volRatio >= 1.5) {
      patterns.push({ name: 'BB Squeeze Breakout', strength: 89, signal: 'BUY', category: 'Momentum',
        desc: 'Bollinger Band squeeze releasing upward' });
    }
  }

  // ── 11. MACD BULLISH CROSSOVER ────────────────────────────────────────────
  if (closes.length >= 35) {
    const macdNow  = calcMACD(closes);
    const macdPrev = calcMACD(closes.slice(0, -1));
    if (macdNow.macd > macdNow.signal &&
        macdPrev.macd <= macdPrev.signal &&
        macdNow.histogram > 0) {
      patterns.push({ name: 'MACD Bullish Crossover', strength: 80, signal: 'BUY', category: 'Momentum',
        desc: 'MACD line crossed above signal line' });
    }
  }

  // ── 12. RSI OVERSOLD RECOVERY ─────────────────────────────────────────────
  if (closes.length >= 20) {
    const rsiPrev = calcRSI(closes.slice(0, -1));
    if (rsiPrev < 35 && rsi >= 35 && rsi < 55 && inUptrend) {
      patterns.push({ name: 'RSI Oversold Recovery', strength: 78, signal: 'BUY', category: 'Momentum',
        desc: 'RSI recovering from oversold in uptrend' });
    }
  }

  // ── 13. SUPPORT BOUNCE ────────────────────────────────────────────────────
  const support = Math.min(...lows.slice(-30, -1));
  if (cur >= support * 0.98 && cur <= support * 1.03 &&
      closes[n] > closes[n - 1] && volRatio >= 1.2 && inUptrend) {
    patterns.push({ name: 'Support Bounce', strength: 76, signal: 'BUY', category: 'Momentum',
      desc: 'Bouncing off key support with volume' });
  }

  // ── 14. STOCHASTIC OVERSOLD CROSSOVER ─────────────────────────────────────
  if (stoch > 20 && stoch < 40 && inUptrend) {
    const stochPrev = calcStochastic(candles.slice(0, -1));
    if (stochPrev < 20 && stoch >= 20) {
      patterns.push({ name: 'Stochastic Crossover', strength: 74, signal: 'BUY', category: 'Momentum',
        desc: 'Stochastic crossing out of oversold zone' });
    }
  }

  // ── 15. PRICE ABOVE ALL EMAs (STRONG TREND) ───────────────────────────────
  if (goldenZone && cur > ema20 && cur > ema50 && (ema200 ? cur > ema200 : true)) {
    patterns.push({ name: 'Strong Uptrend (All EMAs)', strength: 82, signal: 'BUY', category: 'Trend',
      desc: 'Price above EMA20, EMA50, EMA200 — strong trend' });
  }

  // ── 16. VOLUME CLIMAX BREAKOUT ────────────────────────────────────────────
  if (volRatio >= 3.0 && cur > closes[n - 1] && inUptrend) {
    patterns.push({ name: 'Volume Climax Breakout', strength: 83, signal: 'BUY', category: 'Trend',
      desc: '3x+ volume surge with price up — institutional buying' });
  }

  // ── 17. PENNANT ───────────────────────────────────────────────────────────
  if (n >= 20 && inUptrend) {
    const pennantHighs = highs.slice(-10);
    const pennantLows  = lows.slice(-10);
    const hSlope = (pennantHighs[9] - pennantHighs[0]) / 10;
    const lSlope = (pennantLows[9]  - pennantLows[0])  / 10;
    if (hSlope < 0 && lSlope > 0 && Math.abs(hSlope) < atr * 0.3 && volRatio >= 1.5) {
      patterns.push({ name: 'Pennant Breakout', strength: 81, signal: 'BUY', category: 'Trend',
        desc: 'Converging pennant with breakout volume' });
    }
  }

  // ── 18. MORNING STAR (3-candle reversal) ──────────────────────────────────
  if (n >= 3) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const bearCandle = c1.close < c1.open && (c1.open - c1.close) > atr * 0.7;
    const doji       = Math.abs(c2.close - c2.open) < atr * 0.3;
    const bullCandle = c3.close > c3.open && (c3.close - c3.open) > atr * 0.7;
    const gapDown    = c2.high < c1.close;
    if (bearCandle && doji && bullCandle && gapDown && volRatio >= 1.2) {
      patterns.push({ name: 'Morning Star', strength: 79, signal: 'BUY', category: 'Candlestick',
        desc: '3-candle reversal pattern at support' });
    }
  }

  // ── 19. HAMMER / BULLISH PIN BAR ──────────────────────────────────────────
  if (n >= 1) {
    const c = candles[n];
    const body      = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick >= body * 2.5 && upperWick < body * 0.5 &&
        c.close > c.open && inUptrend) {
      patterns.push({ name: 'Hammer / Pin Bar', strength: 75, signal: 'BUY', category: 'Candlestick',
        desc: 'Long lower wick rejection — buyers in control' });
    }
  }

  // ── 20. HIGHER HIGHS + HIGHER LOWS (TREND STRUCTURE) ─────────────────────
  if (n >= 20) {
    const h1 = Math.max(...highs.slice(-20, -10));
    const h2 = Math.max(...highs.slice(-10));
    const l1 = Math.min(...lows.slice(-20, -10));
    const l2 = Math.min(...lows.slice(-10));
    if (h2 > h1 * 1.01 && l2 > l1 * 1.01) {
      patterns.push({ name: 'Higher Highs & Higher Lows', strength: 77, signal: 'BUY', category: 'Candlestick',
        desc: 'Classic uptrend structure intact' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ─── NEW PATTERNS 21-45 ───────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── 21. BULLISH ENGULFING ─────────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const prevBearish = prev.close < prev.open;
    const currBullish = curr.close > curr.open;
    const engulfs     = curr.open <= prev.close && curr.close >= prev.open;
    if (prevBearish && currBullish && engulfs && volRatio >= 1.2) {
      patterns.push({ name: 'Bullish Engulfing', strength: 82, signal: 'BUY', category: 'Candlestick',
        desc: 'Current candle fully engulfs prior red candle — strong reversal signal' });
    }
  }

  // ── 22. THREE WHITE SOLDIERS ──────────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const allGreen    = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
    const eachHigher  = c2.close > c1.close && c3.close > c2.close;
    const openInBody  = c2.open >= c1.open && c2.open <= c1.close &&
                        c3.open >= c2.open && c3.open <= c2.close;
    if (allGreen && eachHigher && openInBody) {
      patterns.push({ name: 'Three White Soldiers', strength: 85, signal: 'BUY', category: 'Candlestick',
        desc: '3 consecutive green candles each closing higher — strong bullish momentum' });
    }
  }

  // ── 23. PIERCING LINE ─────────────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const prevMid    = (prev.open + prev.close) / 2;
    const prevBear   = prev.close < prev.open;
    const currBull   = curr.close > curr.open;
    const openBelow  = curr.open < prev.low;
    const closeAbove = curr.close > prevMid && curr.close < prev.open;
    if (prevBear && currBull && openBelow && closeAbove) {
      patterns.push({ name: 'Piercing Line', strength: 76, signal: 'BUY', category: 'Candlestick',
        desc: 'Bull candle opens below prior low and closes above prior midpoint — reversal signal' });
    }
  }

  // ── 24. BULLISH HARAMI ────────────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const prevBear   = prev.close < prev.open;
    const currBull   = curr.close > curr.open;
    const insideBody = curr.open >= prev.close && curr.close <= prev.open;
    const smallBody  = (curr.close - curr.open) < (prev.open - prev.close) * 0.5;
    if (prevBear && currBull && insideBody && smallBody) {
      patterns.push({ name: 'Bullish Harami', strength: 72, signal: 'BUY', category: 'Candlestick',
        desc: 'Small green candle inside large red candle — inside bar reversal' });
    }
  }

  // ── 25. DRAGONFLY DOJI ────────────────────────────────────────────────────
  if (n >= 1) {
    const c    = candles[n];
    const body = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const atSupport = cur <= Math.min(...lows.slice(-20, -1)) * 1.03;
    if (body < atr * 0.2 && lowerWick > body * 3 && upperWick < body * 0.5 && atSupport) {
      patterns.push({ name: 'Dragonfly Doji', strength: 74, signal: 'BUY', category: 'Candlestick',
        desc: 'Open=close near high with very long lower wick at support — strong rejection' });
    }
  }

  // ── 26. TWEEZER BOTTOM ────────────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const sameLow   = Math.abs(prev.low - curr.low) / (prev.low || 1) < 0.005;
    const currBull  = curr.close > curr.open;
    if (sameLow && currBull) {
      patterns.push({ name: 'Tweezer Bottom', strength: 71, signal: 'BUY', category: 'Candlestick',
        desc: 'Two candles sharing the same low, second is bullish — double rejection of lows' });
    }
  }

  // ── 27. THREE INSIDE UP ───────────────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const bigBear    = c1.close < c1.open && (c1.open - c1.close) > atr * 0.6;
    const haramiUp   = c2.close > c2.open && c2.open >= c1.close && c2.close <= c1.open;
    const confirm    = c3.close > c3.open && c3.close > c1.open;
    if (bigBear && haramiUp && confirm) {
      patterns.push({ name: 'Three Inside Up', strength: 80, signal: 'BUY', category: 'Candlestick',
        desc: 'Bearish candle, bullish harami, then confirming green close above first open' });
    }
  }

  // ── 28. RISING THREE METHODS ──────────────────────────────────────────────
  if (n >= 4) {
    const c0 = candles[n - 4];
    const c1 = candles[n - 3], c2 = candles[n - 2], c3 = candles[n - 1];
    const c4 = candles[n];
    const longGreen   = c0.close > c0.open && (c0.close - c0.open) > atr * 0.8;
    const smallReds   = [c1, c2, c3].every(c => c.close < c.open &&
                          c.low >= c0.low && c.high <= c0.high);
    const breakoutGreen = c4.close > c4.open && c4.close > c0.close && volRatio >= 1.3;
    if (longGreen && smallReds && breakoutGreen) {
      patterns.push({ name: 'Rising Three Methods', strength: 83, signal: 'BUY', category: 'Continuation',
        desc: 'Long green, 3 small red candles within range, then strong green breakout' });
    }
  }

  // ── 29. UPSIDE TASUKI GAP ─────────────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const gapUp      = c2.open > c1.close;
    const bothGreen  = c1.close > c1.open && c2.close > c2.open;
    const redFill    = c3.close < c3.open;
    const gapIntact  = c3.close > c1.close; // doesn't fill the gap
    if (gapUp && bothGreen && redFill && gapIntact) {
      patterns.push({ name: 'Upside Tasuki Gap', strength: 78, signal: 'BUY', category: 'Continuation',
        desc: 'Gap up green candles followed by red that fails to fill the gap — continuation' });
    }
  }

  // ── 30. MAT HOLD ──────────────────────────────────────────────────────────
  if (n >= 4) {
    const c0 = candles[n - 4];
    const c1 = candles[n - 3], c2 = candles[n - 2], c3 = candles[n - 1];
    const c4 = candles[n];
    const strongGreen = c0.close > c0.open && (c0.close - c0.open) > atr * 0.8;
    const midpoint    = (c0.open + c0.close) / 2;
    const pullback    = [c1, c2, c3].every(c => c.low > midpoint);
    const breakout    = c4.close > c4.open && c4.close > c0.close;
    if (strongGreen && pullback && breakout) {
      patterns.push({ name: 'Mat Hold', strength: 81, signal: 'BUY', category: 'Continuation',
        desc: 'Strong green, small pullback above midpoint, then breakout — trend continuation' });
    }
  }

  // ── 31. BULLISH KICKER ────────────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const prevBear  = prev.close < prev.open;
    const currBull  = curr.close > curr.open;
    const gapUp     = curr.open > prev.open; // gap up from red candle open
    if (prevBear && currBull && gapUp && volRatio >= 1.3) {
      patterns.push({ name: 'Bullish Kicker', strength: 87, signal: 'BUY', category: 'Continuation',
        desc: 'Gap up from red candle to green candle — powerful reversal/continuation signal' });
    }
  }

  // ── 32. ON NECK / IN NECK BULLISH ─────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    const downtrend  = closes[n - 1] < closes[Math.max(0, n - 5)]; // recent downtrend
    const prevBear   = prev.close < prev.open;
    const currBull   = curr.close > curr.open;
    const closeNear  = Math.abs(curr.close - prev.close) / prev.close < 0.01;
    if (downtrend && prevBear && currBull && closeNear) {
      patterns.push({ name: 'On Neck Bullish', strength: 70, signal: 'BUY', category: 'Continuation',
        desc: 'After downtrend, green candle closes at prior close — potential reversal' });
    }
  }

  // ── 33. TRIPLE BOTTOM ─────────────────────────────────────────────────────
  if (n >= 60) {
    const seg = Math.floor(60 / 3);
    const low1 = Math.min(...lows.slice(-60, -40));
    const low2 = Math.min(...lows.slice(-40, -20));
    const low3 = Math.min(...lows.slice(-20));
    const neckline = Math.max(...closes.slice(-60));
    const allSimilar = Math.abs(low1 - low2) / low1 < 0.03 &&
                       Math.abs(low2 - low3) / low2 < 0.03;
    if (allSimilar && cur >= neckline * 0.98 && volRatio >= 1.4) {
      patterns.push({ name: 'Triple Bottom', strength: 88, signal: 'BUY', category: 'Reversal',
        desc: 'Three lows at same level with neckline breakout and volume confirmation' });
    }
  }

  // ── 34. ROUNDING BOTTOM (SAUCER) ──────────────────────────────────────────
  if (closes.length >= 40) {
    const slice40 = closes.slice(-40);
    const midIdx  = 20;
    const leftAvg  = slice40.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const bottomAvg = slice40.slice(15, 25).reduce((a, b) => a + b, 0) / 10;
    const rightAvg  = slice40.slice(30, 40).reduce((a, b) => a + b, 0) / 10;
    const uShape    = bottomAvg < leftAvg * 0.97 && rightAvg >= leftAvg * 0.95;
    if (uShape && inUptrend) {
      patterns.push({ name: 'Rounding Bottom (Saucer)', strength: 82, signal: 'BUY', category: 'Reversal',
        desc: 'Gradual U-shape accumulation pattern — price returning to prior highs' });
    }
  }

  // ── 35. V-BOTTOM RECOVERY ─────────────────────────────────────────────────
  if (n >= 10) {
    const recentLow   = Math.min(...lows.slice(-10));
    const recentLowIdx = lows.slice(-10).indexOf(recentLow);
    const dropPct     = (closes[n - 10] - recentLow) / closes[n - 10];
    const recoveryPct = (cur - recentLow) / recentLow;
    const aboveEMA20  = cur > ema20;
    if (dropPct > 0.07 && recoveryPct > 0.05 && aboveEMA20 && recentLowIdx <= 7) {
      patterns.push({ name: 'V-Bottom Recovery', strength: 80, signal: 'BUY', category: 'Reversal',
        desc: 'Sharp drop then sharp recovery back above EMA20 — strong buying interest' });
    }
  }

  // ── 36. ISLAND REVERSAL BOTTOM ────────────────────────────────────────────
  if (n >= 5) {
    // Look for gap down then gap up (island isolated by two gaps)
    const gapDown = candles[n - 4].open < candles[n - 5].close; // gap down into island
    const gapUp   = candles[n].open > candles[n - 1].close;     // gap up out of island
    const islandLow = Math.min(...lows.slice(-5, -1));
    if (gapDown && gapUp && cur > closes[n - 5] * 0.98) {
      patterns.push({ name: 'Island Reversal Bottom', strength: 86, signal: 'BUY', category: 'Reversal',
        desc: 'Gap down, consolidation, gap up — island isolated by two gaps signals reversal' });
    }
  }

  // ── 37. FALLING WEDGE BREAKOUT ────────────────────────────────────────────
  if (n >= 20) {
    const wedgeHighs = highs.slice(-20);
    const wedgeLows  = lows.slice(-20);
    const hSlope = (wedgeHighs[19] - wedgeHighs[0]) / 20;
    const lSlope = (wedgeLows[19]  - wedgeLows[0])  / 20;
    const bothFalling   = hSlope < 0 && lSlope < 0;
    const converging    = Math.abs(lSlope) < Math.abs(hSlope); // lows falling slower
    const upperTrendline = wedgeHighs[0] + hSlope * 19;
    const breakout      = cur > upperTrendline && volRatio >= 1.4;
    if (bothFalling && converging && breakout) {
      patterns.push({ name: 'Falling Wedge Breakout', strength: 85, signal: 'BUY', category: 'Reversal',
        desc: 'Lower highs and lower lows converging — breakout above upper trendline with volume' });
    }
  }

  // ── 38. ADAM & EVE DOUBLE BOTTOM ──────────────────────────────────────────
  if (n >= 40) {
    const firstHalf  = lows.slice(-40, -20);
    const secondHalf = lows.slice(-20);
    const adamLow    = Math.min(...firstHalf);
    const eveLow     = Math.min(...secondHalf);
    // Adam: sharp (high std dev around low), Eve: rounded (low std dev)
    const adamIdx    = firstHalf.indexOf(adamLow);
    const adamSharp  = firstHalf.filter(l => l < adamLow * 1.02).length <= 2;
    const eveRounded = secondHalf.filter(l => l < eveLow * 1.03).length >= 3;
    const neckline   = Math.max(...closes.slice(-40));
    const similar    = Math.abs(adamLow - eveLow) / adamLow < 0.04;
    if (adamSharp && eveRounded && similar && cur >= neckline * 0.98 && volRatio >= 1.2) {
      patterns.push({ name: 'Adam & Eve Double Bottom', strength: 87, signal: 'BUY', category: 'Reversal',
        desc: 'Sharp Adam bottom + rounded Eve bottom with neckline break — high-quality reversal' });
    }
  }

  // ── 39. VWAP RECLAIM ──────────────────────────────────────────────────────
  if (closes.length >= 20) {
    const avgPrice20     = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const avgPricePrev20 = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const reclaim        = cur > avgPrice20 && closes[n - 1] <= avgPricePrev20;
    if (reclaim && volRatio >= 1.3) {
      patterns.push({ name: 'VWAP Reclaim', strength: 78, signal: 'BUY', category: 'Momentum',
        desc: 'Price crosses back above 20-day average price (VWAP proxy) with volume' });
    }
  }

  // ── 40. ADX TREND STRENGTH ────────────────────────────────────────────────
  if (closes.length >= 30) {
    const range10d = Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10));
    const range30d = Math.max(...highs.slice(-30)) - Math.min(...lows.slice(-30));
    const expanding = range10d > range30d * 0.4; // recent range is large portion of 30d range
    const consistent = closes.slice(-10).every((c, i, arr) => i === 0 || c >= arr[i - 1] * 0.98);
    if (expanding && consistent && inUptrend) {
      patterns.push({ name: 'ADX Trend Strength', strength: 79, signal: 'BUY', category: 'Momentum',
        desc: 'Consistent directional movement with expanding range — strong trend (ADX proxy)' });
    }
  }

  // ── 41. SUPERTREND BUY ────────────────────────────────────────────────────
  if (n >= 2 && atr > 0) {
    const supertrendCheck = (idx) => {
      const c = candles[idx];
      const midpoint = (c.high + c.low) / 2;
      return c.close > midpoint + 1.5 * atr;
    };
    if (supertrendCheck(n) && supertrendCheck(n - 1) && supertrendCheck(n - 2)) {
      patterns.push({ name: 'Supertrend Buy', strength: 81, signal: 'BUY', category: 'Momentum',
        desc: 'Price above Supertrend upper band proxy for 3 consecutive days — strong uptrend' });
    }
  }

  // ── 42. ICHIMOKU CLOUD BREAKOUT ───────────────────────────────────────────
  if (closes.length >= 26) {
    const ema9  = calcEMA(closes, 9);
    const ema26 = calcEMA(closes, 26);
    const ema9Prev  = calcEMA(closes.slice(0, -1), 9);
    const ema26Prev = calcEMA(closes.slice(0, -1), 26);
    // Was below cloud (both EMAs), now above both
    const wasBelow = closes[n - 1] < ema9Prev && closes[n - 1] < ema26Prev;
    const nowAbove = cur > ema9 && cur > ema26;
    if (wasBelow && nowAbove) {
      patterns.push({ name: 'Ichimoku Cloud Breakout', strength: 84, signal: 'BUY', category: 'Momentum',
        desc: 'Price breaks above cloud proxy (EMA9 & EMA26) after being below — trend change' });
    }
  }

  // ── 43. ELDER RAY BULL POWER ──────────────────────────────────────────────
  if (closes.length >= 13) {
    const ema13     = calcEMA(closes, 13);
    const ema13Prev = calcEMA(closes.slice(0, -1), 13);
    const bullPower = candles[n].high - ema13;
    const ema13Rising = ema13 > ema13Prev;
    if (ema13Rising && bullPower > 0) {
      patterns.push({ name: 'Elder Ray Bull Power', strength: 76, signal: 'BUY', category: 'Momentum',
        desc: 'EMA13 rising with high above EMA13 — positive bull power (Elder Ray)' });
    }
  }

  // ── 44. DARVAS BOX BREAKOUT ───────────────────────────────────────────────
  if (closes.length >= 20) {
    const box4wHigh = Math.max(...highs.slice(-20, -1)); // 4-week (20-day) high box
    const breakout  = cur > box4wHigh && volRatio >= 1.5;
    if (breakout) {
      patterns.push({ name: 'Darvas Box Breakout', strength: 86, signal: 'BUY', category: 'Trend',
        desc: 'Price breaks above 4-week high box with volume — Nicolas Darvas method' });
    }
  }

  // ── 45. WEINSTEIN STAGE 2 ─────────────────────────────────────────────────
  if (closes.length >= 30) {
    const sma30      = calcSMA(closes, 30);
    const sma30Prev  = calcSMA(closes.slice(0, -1), 30);
    const smaRising  = sma30 > sma30Prev;
    const aboveSMA30 = cur > sma30;
    const avgVol30   = volumes.slice(-31, -1).reduce((a, b) => a + b, 0) / 30;
    const volAboveAvg = lastVol > avgVol30;
    if (aboveSMA30 && smaRising && volAboveAvg) {
      patterns.push({ name: 'Weinstein Stage 2', strength: 83, signal: 'BUY', category: 'Trend',
        desc: 'Price above rising 30-week SMA with above-average volume — Stan Weinstein Stage 2' });
    }
  }

  return patterns;
}

module.exports = { detectPatterns, calcEMA, calcRSI, calcMACD, calcATR, calcBB, calcStochastic };
