/**
 * 15-Minute Intraday Swing Pattern Analyzer
 * Designed for same-day / next-day intraday trades
 *
 * Patterns tuned for 15m timeframe:
 *  - Uses last 2 days of 15m candles (recent session focus)
 *  - Volume confirmation required for all breakout patterns
 *  - Trend context from EMA9 and EMA21 (fast EMAs for intraday)
 *  - RSI period 9 (faster response on 15m)
 *  - ATR period 10 (intraday volatility)
 */

// ─── Indicators ───────────────────────────────────────────────────────────────

function ema(data, period) {
  if (!data || data.length < period) return data?.[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
  return e;
}

function sma(data, period) {
  if (data.length < period) return data[data.length - 1];
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi(closes, period = 9) {
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

function atr(candles, period = 10) {
  if (candles.length < period + 1) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const p = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function macd(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const macdLine = [];
  for (let i = 12; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    macdLine.push(ema(s, 12) - ema(s, 26));
  }
  const sig = macdLine.length >= 9 ? ema(macdLine, 9) : macdLine[macdLine.length - 1];
  const val = macdLine[macdLine.length - 1];
  return { macd: val, signal: sig, histogram: val - sig };
}

function bb(closes, period = 20) {
  if (closes.length < period) return null;
  const sl  = closes.slice(-period);
  const mid = sl.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(sl.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  return { upper: mid + 2 * std, middle: mid, lower: mid - 2 * std, std };
}

function stoch(candles, period = 9) {
  if (candles.length < period) return 50;
  const sl = candles.slice(-period);
  const hi = Math.max(...sl.map(c => c.high));
  const lo = Math.min(...sl.map(c => c.low));
  const cl = candles[candles.length - 1].close;
  return hi === lo ? 50 : ((cl - lo) / (hi - lo)) * 100;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

// Get only today's candles (IST: 09:15 to 15:30)
function todayCandles(candles) {
  if (!candles || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const lastDate = last.time.split('T')[0];
  return candles.filter(c => c.time.startsWith(lastDate));
}

// Get previous session candles
function prevSessionCandles(candles) {
  if (!candles || candles.length === 0) return [];
  const last = candles[candles.length - 1];
  const lastDate = last.time.split('T')[0];
  const prev = candles.filter(c => !c.time.startsWith(lastDate));
  if (prev.length === 0) return [];
  const prevDate = prev[prev.length - 1].time.split('T')[0];
  return prev.filter(c => c.time.startsWith(prevDate));
}

// Previous day high/low (key intraday levels)
function prevDayHL(candles) {
  const prev = prevSessionCandles(candles);
  if (prev.length === 0) return null;
  return {
    high: Math.max(...prev.map(c => c.high)),
    low:  Math.min(...prev.map(c => c.low)),
    close: prev[prev.length - 1].close,
    open:  prev[0].open,
  };
}

// ─── Main 15m pattern detector ───────────────────────────────────────────────

function detect15mPatterns(candles) {
  if (!candles || candles.length < 20) return { patterns: [], indicators: {}, setup: null };

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n       = candles.length - 1;
  const cur     = closes[n];

  // Fast EMAs for intraday
  const ema9  = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema9p = ema(closes.slice(0, -1), 9);
  const ema21p= ema(closes.slice(0, -1), 21);

  const rsiVal  = rsi(closes, 9);
  const atrVal  = atr(candles, 10);
  const macdVal = macd(closes);
  const bbVal   = bb(closes, 20);
  const stochVal= stoch(candles, 9);

  const avgVol  = volumes.slice(-13, -1).reduce((a, b) => a + b, 0) / 12; // ~3hr avg
  const lastVol = volumes[n];
  const volRatio= avgVol > 0 ? lastVol / avgVol : 1;

  const inUptrend = ema9 > ema21;
  const pdhl      = prevDayHL(candles);
  const todayCndl = todayCandles(candles);
  const dayOpen   = todayCndl.length > 0 ? todayCndl[0].open : cur;

  const patterns = [];

  // ── 1. EMA9 CROSS ABOVE EMA21 (15m Golden Cross) ─────────────────────────
  if (ema9 > ema21 && ema9p <= ema21p) {
    patterns.push({
      name: 'EMA9 × EMA21 Bullish Cross',
      strength: 88,
      signal: 'BUY',
      category: 'Trend',
      desc: 'EMA9 crossed above EMA21 on 15m — intraday trend turning bullish',
      entry: cur,
      target: parseFloat((cur + atrVal * 2).toFixed(2)),
      stopLoss: parseFloat((cur - atrVal * 1).toFixed(2)),
    });
  }

  // ── 2. PREVIOUS DAY HIGH BREAKOUT ────────────────────────────────────────
  if (pdhl && cur >= pdhl.high * 0.999 && volRatio >= 1.5) {
    patterns.push({
      name: 'PDH Breakout',
      strength: 92,
      signal: 'BUY',
      category: 'Breakout',
      desc: `Breaking above previous day high ₹${pdhl.high.toFixed(2)} with volume`,
      entry: cur,
      target: parseFloat((cur + (pdhl.high - pdhl.low) * 0.618).toFixed(2)),
      stopLoss: parseFloat((pdhl.high * 0.995).toFixed(2)),
    });
  }

  // ── 3. OPENING RANGE BREAKOUT (ORB) ──────────────────────────────────────
  if (todayCndl.length >= 4) {
    const orHigh = Math.max(...todayCndl.slice(0, 4).map(c => c.high)); // first 1hr
    const orLow  = Math.min(...todayCndl.slice(0, 4).map(c => c.low));
    if (cur >= orHigh * 0.999 && volRatio >= 1.8 && todayCndl.length > 4) {
      patterns.push({
        name: 'Opening Range Breakout (ORB)',
        strength: 91,
        signal: 'BUY',
        category: 'Breakout',
        desc: `Price breaking above 1-hour opening range high ₹${orHigh.toFixed(2)}`,
        entry: cur,
        target: parseFloat((orHigh + (orHigh - orLow)).toFixed(2)),
        stopLoss: parseFloat((orLow).toFixed(2)),
      });
    }
  }

  // ── 4. BULL FLAG (15m) ────────────────────────────────────────────────────
  if (n >= 12 && inUptrend) {
    const poleHigh = Math.max(...highs.slice(-12, -4));
    const poleLow  = Math.min(...lows.slice(-12, -4));
    const flagHigh = Math.max(...highs.slice(-4));
    const flagLow  = Math.min(...lows.slice(-4));
    const poleMove = poleHigh - poleLow;
    const flagRange= flagHigh - flagLow;
    if (poleMove > 0 && flagRange < poleMove * 0.4 && flagLow > poleLow && cur >= flagHigh * 0.999 && volRatio >= 1.3) {
      patterns.push({
        name: 'Bull Flag (15m)',
        strength: 87,
        signal: 'BUY',
        category: 'Continuation',
        desc: 'Tight 4-candle flag after strong move — breakout with volume',
        entry: cur,
        target: parseFloat((cur + poleMove * 0.8).toFixed(2)),
        stopLoss: parseFloat((flagLow - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 5. VWAP RECLAIM ───────────────────────────────────────────────────────
  if (todayCndl.length >= 4) {
    const vwapProxy = todayCndl.map(c => c.close).reduce((a, b) => a + b, 0) / todayCndl.length;
    const prevClose = closes[n - 1];
    if (prevClose < vwapProxy && cur >= vwapProxy && volRatio >= 1.4) {
      patterns.push({
        name: 'VWAP Reclaim',
        strength: 85,
        signal: 'BUY',
        category: 'Momentum',
        desc: `Price reclaimed intraday VWAP ₹${vwapProxy.toFixed(2)} — buyers back in control`,
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((vwapProxy - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 6. MACD BULLISH CROSSOVER (15m) ──────────────────────────────────────
  if (closes.length >= 30) {
    const macdPrev = macd(closes.slice(0, -1));
    if (macdVal.macd > macdVal.signal && macdPrev.macd <= macdPrev.signal && macdVal.histogram > 0) {
      patterns.push({
        name: 'MACD Cross (15m)',
        strength: 82,
        signal: 'BUY',
        category: 'Momentum',
        desc: 'MACD crossed above signal on 15m — momentum turning bullish',
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((cur - atrVal * 1).toFixed(2)),
      });
    }
  }

  // ── 7. RSI OVERSOLD BOUNCE (15m) ─────────────────────────────────────────
  if (closes.length >= 12) {
    const rsiPrev = rsi(closes.slice(0, -1), 9);
    if (rsiPrev < 30 && rsiVal >= 30 && rsiVal < 50 && inUptrend) {
      patterns.push({
        name: 'RSI Oversold Bounce (15m)',
        strength: 80,
        signal: 'BUY',
        category: 'Momentum',
        desc: `RSI(9) bouncing from oversold (${rsiPrev.toFixed(0)} → ${rsiVal.toFixed(0)}) on 15m`,
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((cur - atrVal * 0.8).toFixed(2)),
      });
    }
  }

  // ── 8. BOLLINGER BAND SQUEEZE BREAKOUT (15m) ─────────────────────────────
  if (bbVal) {
    const bbWidth = (bbVal.upper - bbVal.lower) / bbVal.middle;
    if (bbWidth < 0.03 && cur > bbVal.upper && volRatio >= 1.5) {
      patterns.push({
        name: 'BB Squeeze Breakout (15m)',
        strength: 89,
        signal: 'BUY',
        category: 'Breakout',
        desc: 'Bollinger Band squeeze on 15m releasing upward — explosive move likely',
        entry: cur,
        target: parseFloat((cur + bbVal.std * 3).toFixed(2)),
        stopLoss: parseFloat((bbVal.middle).toFixed(2)),
      });
    }
  }

  // ── 9. BULLISH ENGULFING (15m) ────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1];
    const curr = candles[n];
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open <= prev.close && curr.close >= prev.open && volRatio >= 1.3) {
      patterns.push({
        name: 'Bullish Engulfing (15m)',
        strength: 83,
        signal: 'BUY',
        category: 'Candlestick',
        desc: 'Current 15m candle fully engulfs prior red candle — strong reversal',
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((prev.low - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 10. HAMMER / PIN BAR (15m) ────────────────────────────────────────────
  if (n >= 1) {
    const c = candles[n];
    const body      = Math.abs(c.close - c.open);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick >= body * 2.5 && upperWick < body * 0.5 && c.close > c.open && inUptrend) {
      patterns.push({
        name: 'Hammer / Pin Bar (15m)',
        strength: 78,
        signal: 'BUY',
        category: 'Candlestick',
        desc: 'Long lower wick rejection on 15m — buyers absorbed all selling',
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((c.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 11. MORNING STAR (15m) ────────────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const bear = c1.close < c1.open && (c1.open - c1.close) > atrVal * 0.6;
    const doji = Math.abs(c2.close - c2.open) < atrVal * 0.25;
    const bull = c3.close > c3.open && (c3.close - c3.open) > atrVal * 0.6;
    if (bear && doji && bull && volRatio >= 1.2) {
      patterns.push({
        name: 'Morning Star (15m)',
        strength: 81,
        signal: 'BUY',
        category: 'Candlestick',
        desc: '3-candle reversal on 15m — strong bottom signal',
        entry: cur,
        target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((c1.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 12. SUPPORT LEVEL BOUNCE (15m) ───────────────────────────────────────
  const support15m = Math.min(...lows.slice(-20, -1));
  if (cur >= support15m * 0.998 && cur <= support15m * 1.005 &&
      closes[n] > closes[n - 1] && volRatio >= 1.2 && inUptrend) {
    patterns.push({
      name: 'Support Bounce (15m)',
      strength: 77,
      signal: 'BUY',
      category: 'Support/Resistance',
      desc: `Bouncing off 15m support ₹${support15m.toFixed(2)} with volume`,
      entry: cur,
      target: parseFloat((cur + atrVal * 2).toFixed(2)),
      stopLoss: parseFloat((support15m - atrVal * 0.5).toFixed(2)),
    });
  }

  // ── 13. STOCHASTIC OVERSOLD CROSS (15m) ──────────────────────────────────
  if (stochVal > 20 && stochVal < 45 && inUptrend) {
    const stochPrev = stoch(candles.slice(0, -1), 9);
    if (stochPrev < 20 && stochVal >= 20) {
      patterns.push({
        name: 'Stochastic Cross (15m)',
        strength: 76,
        signal: 'BUY',
        category: 'Momentum',
        desc: `Stochastic(9) crossing out of oversold (${stochPrev.toFixed(0)} → ${stochVal.toFixed(0)}) on 15m`,
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((cur - atrVal * 0.8).toFixed(2)),
      });
    }
  }

  // ── 14. THREE WHITE SOLDIERS (15m) ───────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const allGreen   = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
    const eachHigher = c2.close > c1.close && c3.close > c2.close;
    const openInBody = c2.open >= c1.open && c2.open <= c1.close &&
                       c3.open >= c2.open && c3.open <= c2.close;
    if (allGreen && eachHigher && openInBody) {
      patterns.push({
        name: 'Three White Soldiers (15m)',
        strength: 84,
        signal: 'BUY',
        category: 'Candlestick',
        desc: '3 consecutive green 15m candles each closing higher — strong momentum',
        entry: cur,
        target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((c1.open - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 15. VOLUME CLIMAX ON GREEN CANDLE (15m) ───────────────────────────────
  if (volRatio >= 3.0 && cur > closes[n - 1] && inUptrend) {
    patterns.push({
      name: 'Volume Climax (15m)',
      strength: 86,
      signal: 'BUY',
      category: 'Breakout',
      desc: `${volRatio.toFixed(1)}x avg volume on green 15m candle — institutional buying`,
      entry: cur,
      target: parseFloat((cur + atrVal * 2).toFixed(2)),
      stopLoss: parseFloat((cur - atrVal * 1).toFixed(2)),
    });
  }

  // ── 16. CONSOLIDATION BREAKOUT (15m) ─────────────────────────────────────
  const range6  = Math.max(...highs.slice(-6))  - Math.min(...lows.slice(-6));
  const range20 = Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20));
  if (range20 > 0 && range6 < range20 * 0.25 && volRatio >= 2.0 && inUptrend) {
    patterns.push({
      name: 'Consolidation Breakout (15m)',
      strength: 88,
      signal: 'BUY',
      category: 'Breakout',
      desc: 'Tight 6-candle range (1.5hr) breaking out with 2x+ volume',
      entry: cur,
      target: parseFloat((cur + range20 * 0.5).toFixed(2)),
      stopLoss: parseFloat((Math.min(...lows.slice(-6)) - atrVal * 0.3).toFixed(2)),
    });
  }

  // ── 17. HIGHER HIGH HIGHER LOW STRUCTURE (15m) ───────────────────────────
  if (n >= 8) {
    const h1 = Math.max(...highs.slice(-8, -4));
    const h2 = Math.max(...highs.slice(-4));
    const l1 = Math.min(...lows.slice(-8, -4));
    const l2 = Math.min(...lows.slice(-4));
    if (h2 > h1 * 1.002 && l2 > l1 * 1.002) {
      patterns.push({
        name: 'HH-HL Structure (15m)',
        strength: 79,
        signal: 'BUY',
        category: 'Trend',
        desc: 'Higher highs and higher lows on 15m — intraday uptrend intact',
        entry: cur,
        target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((l2 - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 18. INSIDE BAR BREAKOUT (15m) ────────────────────────────────────────
  if (n >= 1) {
    const mother = candles[n - 1];
    const inside = candles[n];
    const isInside = inside.high <= mother.high && inside.low >= mother.low;
    if (!isInside && n >= 2) {
      const prev2 = candles[n - 2];
      const wasInside = mother.high <= prev2.high && mother.low >= prev2.low;
      if (wasInside && cur > prev2.high && volRatio >= 1.5) {
        patterns.push({
          name: 'Inside Bar Breakout (15m)',
          strength: 83,
          signal: 'BUY',
          category: 'Breakout',
          desc: 'Inside bar on 15m breaking out above mother candle high',
          entry: cur,
          target: parseFloat((cur + (prev2.high - prev2.low)).toFixed(2)),
          stopLoss: parseFloat((prev2.low).toFixed(2)),
        });
      }
    }
  }

  // ── 19. GAP UP AND HOLD (15m) ────────────────────────────────────────────
  if (pdhl && todayCndl.length >= 2) {
    const gapUp = dayOpen > pdhl.high;
    const holding = cur >= dayOpen * 0.998;
    if (gapUp && holding && volRatio >= 1.2) {
      patterns.push({
        name: 'Gap Up & Hold (15m)',
        strength: 85,
        signal: 'BUY',
        category: 'Breakout',
        desc: `Gapped up above PDH ₹${pdhl.high.toFixed(2)} and holding — strong bullish sentiment`,
        entry: cur,
        target: parseFloat((cur + (dayOpen - pdhl.high) * 2).toFixed(2)),
        stopLoss: parseFloat((pdhl.high * 0.998).toFixed(2)),
      });
    }
  }

  // ── 20. SUPERTREND BUY (15m) ──────────────────────────────────────────────
  if (n >= 2 && atrVal > 0) {
    const check = idx => {
      const c = candles[idx];
      return c.close > (c.high + c.low) / 2 + 1.5 * atrVal;
    };
    if (check(n) && check(n - 1) && check(n - 2)) {
      patterns.push({
        name: 'Supertrend Buy (15m)',
        strength: 82,
        signal: 'BUY',
        category: 'Trend',
        desc: 'Price above Supertrend on 15m for 3 consecutive candles (45 min)',
        entry: cur,
        target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((cur - atrVal * 1.5).toFixed(2)),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ─── PATTERNS 21-45 (15m adapted) ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── 21. PIERCING LINE (15m) ───────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1], curr = candles[n];
    const prevMid = (prev.open + prev.close) / 2;
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open < prev.low && curr.close > prevMid && curr.close < prev.open) {
      patterns.push({
        name: 'Piercing Line (15m)', strength: 76, signal: 'BUY', category: 'Candlestick',
        desc: 'Bull 15m candle opens below prior low, closes above prior midpoint — reversal',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((prev.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 22. BULLISH HARAMI (15m) ──────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1], curr = candles[n];
    const prevBear = prev.close < prev.open;
    const currBull = curr.close > curr.open;
    const inside   = curr.open >= prev.close && curr.close <= prev.open;
    const small    = (curr.close - curr.open) < (prev.open - prev.close) * 0.5;
    if (prevBear && currBull && inside && small) {
      patterns.push({
        name: 'Bullish Harami (15m)', strength: 72, signal: 'BUY', category: 'Candlestick',
        desc: 'Small green 15m candle inside large red — inside bar reversal signal',
        entry: cur, target: parseFloat((cur + atrVal * 1.2).toFixed(2)),
        stopLoss: parseFloat((prev.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 23. DRAGONFLY DOJI (15m) ──────────────────────────────────────────────
  if (n >= 1) {
    const c = candles[n];
    const body = Math.abs(c.close - c.open);
    const lw   = Math.min(c.open, c.close) - c.low;
    const uw   = c.high - Math.max(c.open, c.close);
    const atSup = cur <= Math.min(...lows.slice(-12, -1)) * 1.02;
    if (body < atrVal * 0.2 && lw > body * 3 && uw < body * 0.5 && atSup) {
      patterns.push({
        name: 'Dragonfly Doji (15m)', strength: 74, signal: 'BUY', category: 'Candlestick',
        desc: 'Long lower wick doji at 15m support — strong rejection of lows',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((c.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 24. TWEEZER BOTTOM (15m) ──────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1], curr = candles[n];
    if (Math.abs(prev.low - curr.low) / (prev.low || 1) < 0.003 && curr.close > curr.open) {
      patterns.push({
        name: 'Tweezer Bottom (15m)', strength: 71, signal: 'BUY', category: 'Candlestick',
        desc: 'Two 15m candles sharing same low, second bullish — double rejection',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((curr.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 25. THREE INSIDE UP (15m) ─────────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    const bigBear  = c1.close < c1.open && (c1.open - c1.close) > atrVal * 0.6;
    const haramiUp = c2.close > c2.open && c2.open >= c1.close && c2.close <= c1.open;
    const confirm  = c3.close > c3.open && c3.close > c1.open;
    if (bigBear && haramiUp && confirm) {
      patterns.push({
        name: 'Three Inside Up (15m)', strength: 80, signal: 'BUY', category: 'Candlestick',
        desc: 'Bearish 15m candle → bullish harami → confirming green above first open',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((c1.low - atrVal * 0.2).toFixed(2)),
      });
    }
  }

  // ── 26. RISING THREE METHODS (15m) ───────────────────────────────────────
  if (n >= 4) {
    const c0 = candles[n - 4], c1 = candles[n - 3], c2 = candles[n - 2], c3 = candles[n - 1], c4 = candles[n];
    const longGreen = c0.close > c0.open && (c0.close - c0.open) > atrVal * 0.8;
    const smallReds = [c1, c2, c3].every(c => c.close < c.open && c.low >= c0.low && c.high <= c0.high);
    const breakout  = c4.close > c4.open && c4.close > c0.close && volRatio >= 1.3;
    if (longGreen && smallReds && breakout) {
      patterns.push({
        name: 'Rising Three Methods (15m)', strength: 83, signal: 'BUY', category: 'Continuation',
        desc: 'Long green 15m candle, 3 small reds within range, then strong green breakout',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((c0.open - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 27. UPSIDE TASUKI GAP (15m) ───────────────────────────────────────────
  if (n >= 2) {
    const c1 = candles[n - 2], c2 = candles[n - 1], c3 = candles[n];
    if (c2.open > c1.close && c1.close > c1.open && c2.close > c2.open &&
        c3.close < c3.open && c3.close > c1.close) {
      patterns.push({
        name: 'Upside Tasuki Gap (15m)', strength: 78, signal: 'BUY', category: 'Continuation',
        desc: 'Gap up green 15m candles, red fails to fill gap — continuation signal',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((c1.close - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 28. BULLISH KICKER (15m) ──────────────────────────────────────────────
  if (n >= 1) {
    const prev = candles[n - 1], curr = candles[n];
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open > prev.open && volRatio >= 1.3) {
      patterns.push({
        name: 'Bullish Kicker (15m)', strength: 87, signal: 'BUY', category: 'Continuation',
        desc: 'Gap up from red 15m candle to green — powerful momentum signal',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((prev.open - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 29. MAT HOLD (15m) ────────────────────────────────────────────────────
  if (n >= 4) {
    const c0 = candles[n - 4], c1 = candles[n - 3], c2 = candles[n - 2], c3 = candles[n - 1], c4 = candles[n];
    const strongGreen = c0.close > c0.open && (c0.close - c0.open) > atrVal * 0.8;
    const midpoint    = (c0.open + c0.close) / 2;
    const pullback    = [c1, c2, c3].every(c => c.low > midpoint);
    const breakout    = c4.close > c4.open && c4.close > c0.close;
    if (strongGreen && pullback && breakout) {
      patterns.push({
        name: 'Mat Hold (15m)', strength: 81, signal: 'BUY', category: 'Continuation',
        desc: 'Strong 15m green, pullback stays above midpoint, then breakout',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((midpoint - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 30. DOUBLE BOTTOM (15m) ───────────────────────────────────────────────
  if (n >= 20) {
    const half1  = lows.slice(-20, -10);
    const half2  = lows.slice(-10);
    const low1   = Math.min(...half1);
    const low2   = Math.min(...half2);
    const neck   = Math.max(...closes.slice(-20));
    if (Math.abs(low1 - low2) / low1 < 0.025 && cur >= neck * 0.998 && volRatio >= 1.3) {
      patterns.push({
        name: 'Double Bottom (15m)', strength: 84, signal: 'BUY', category: 'Reversal',
        desc: 'W-pattern on 15m with neckline breakout — intraday reversal',
        entry: cur, target: parseFloat((cur + (neck - low1)).toFixed(2)),
        stopLoss: parseFloat((low2 - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 31. ASCENDING TRIANGLE (15m) ─────────────────────────────────────────
  if (n >= 16) {
    const rHigh  = highs.slice(-16);
    const rLow   = lows.slice(-16);
    const maxH   = Math.max(...rHigh), minH = Math.min(...rHigh);
    const flat   = (maxH - minH) / maxH < 0.015;
    const rising = rLow[rLow.length - 1] > rLow[0] * 1.01;
    if (flat && rising && cur >= maxH * 0.999 && volRatio >= 1.5) {
      patterns.push({
        name: 'Ascending Triangle (15m)', strength: 86, signal: 'BUY', category: 'Reversal',
        desc: 'Flat 15m resistance + rising lows — breakout imminent',
        entry: cur, target: parseFloat((maxH + (maxH - Math.min(...rLow))).toFixed(2)),
        stopLoss: parseFloat((rLow[rLow.length - 1] - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 32. V-BOTTOM RECOVERY (15m) ───────────────────────────────────────────
  if (n >= 8) {
    const recentLow = Math.min(...lows.slice(-8));
    const drop      = (closes[n - 8] - recentLow) / closes[n - 8];
    const recovery  = (cur - recentLow) / recentLow;
    if (drop > 0.015 && recovery > 0.01 && cur > ema9) {
      patterns.push({
        name: 'V-Bottom Recovery (15m)', strength: 80, signal: 'BUY', category: 'Reversal',
        desc: 'Sharp 15m drop then sharp recovery above EMA9 — strong buying',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((recentLow - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 33. FALLING WEDGE BREAKOUT (15m) ─────────────────────────────────────
  if (n >= 12) {
    const wH = highs.slice(-12), wL = lows.slice(-12);
    const hSlope = (wH[11] - wH[0]) / 12;
    const lSlope = (wL[11] - wL[0]) / 12;
    const bothFall   = hSlope < 0 && lSlope < 0;
    const converging = Math.abs(lSlope) < Math.abs(hSlope);
    const upper      = wH[0] + hSlope * 11;
    if (bothFall && converging && cur > upper && volRatio >= 1.4) {
      patterns.push({
        name: 'Falling Wedge Breakout (15m)', strength: 85, signal: 'BUY', category: 'Reversal',
        desc: 'Converging falling wedge on 15m breaking out with volume',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((upper - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 34. TRIPLE BOTTOM (15m) ───────────────────────────────────────────────
  if (n >= 30) {
    const l1 = Math.min(...lows.slice(-30, -20));
    const l2 = Math.min(...lows.slice(-20, -10));
    const l3 = Math.min(...lows.slice(-10));
    const neck = Math.max(...closes.slice(-30));
    const similar = Math.abs(l1 - l2) / l1 < 0.025 && Math.abs(l2 - l3) / l2 < 0.025;
    if (similar && cur >= neck * 0.998 && volRatio >= 1.4) {
      patterns.push({
        name: 'Triple Bottom (15m)', strength: 88, signal: 'BUY', category: 'Reversal',
        desc: 'Three 15m lows at same level with neckline breakout',
        entry: cur, target: parseFloat((cur + (neck - l1)).toFixed(2)),
        stopLoss: parseFloat((l3 - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 35. ISLAND REVERSAL BOTTOM (15m) ─────────────────────────────────────
  if (n >= 5) {
    const gapDown = candles[n - 4].open < candles[n - 5].close;
    const gapUp   = candles[n].open > candles[n - 1].close;
    if (gapDown && gapUp && cur > closes[n - 5] * 0.99) {
      patterns.push({
        name: 'Island Reversal (15m)', strength: 86, signal: 'BUY', category: 'Reversal',
        desc: 'Gap down then gap up on 15m — island isolated by two gaps',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((candles[n - 1].low - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 36. ROUNDING BOTTOM (15m) ─────────────────────────────────────────────
  if (closes.length >= 24) {
    const sl = closes.slice(-24);
    const leftAvg   = sl.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
    const bottomAvg = sl.slice(9, 15).reduce((a, b) => a + b, 0) / 6;
    const rightAvg  = sl.slice(18, 24).reduce((a, b) => a + b, 0) / 6;
    if (bottomAvg < leftAvg * 0.98 && rightAvg >= leftAvg * 0.96 && inUptrend) {
      patterns.push({
        name: 'Rounding Bottom (15m)', strength: 79, signal: 'BUY', category: 'Reversal',
        desc: 'Gradual U-shape on 15m — accumulation pattern completing',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((bottomAvg - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 37. MACD HISTOGRAM EXPANSION (15m) ───────────────────────────────────
  if (closes.length >= 30) {
    const macdPrev2 = macd(closes.slice(0, -2));
    const macdPrev1 = macd(closes.slice(0, -1));
    const expanding = macdVal.histogram > 0 &&
                      macdVal.histogram > macdPrev1.histogram &&
                      macdPrev1.histogram > macdPrev2.histogram;
    if (expanding) {
      patterns.push({
        name: 'MACD Histogram Expansion (15m)', strength: 81, signal: 'BUY', category: 'Momentum',
        desc: 'MACD histogram growing for 3 consecutive 15m candles — accelerating momentum',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((cur - atrVal * 1).toFixed(2)),
      });
    }
  }

  // ── 38. ELDER RAY BULL POWER (15m) ───────────────────────────────────────
  if (closes.length >= 13) {
    const e13     = ema(closes, 13);
    const e13Prev = ema(closes.slice(0, -1), 13);
    const bullPow = candles[n].high - e13;
    if (e13 > e13Prev && bullPow > 0) {
      patterns.push({
        name: 'Elder Ray Bull Power (15m)', strength: 76, signal: 'BUY', category: 'Momentum',
        desc: 'EMA13 rising + high above EMA13 on 15m — positive bull power',
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((e13 - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 39. ICHIMOKU CLOUD BREAKOUT (15m) ────────────────────────────────────
  if (closes.length >= 26) {
    const e9  = ema(closes, 9),  e26 = ema(closes, 26);
    const e9p = ema(closes.slice(0, -1), 9), e26p = ema(closes.slice(0, -1), 26);
    const wasBelow = closes[n - 1] < e9p && closes[n - 1] < e26p;
    const nowAbove = cur > e9 && cur > e26;
    if (wasBelow && nowAbove) {
      patterns.push({
        name: 'Ichimoku Cloud Breakout (15m)', strength: 84, signal: 'BUY', category: 'Momentum',
        desc: 'Price breaks above EMA9 & EMA26 cloud on 15m — trend change signal',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((Math.min(e9, e26) - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 40. DARVAS BOX BREAKOUT (15m) ────────────────────────────────────────
  if (closes.length >= 16) {
    const boxHigh = Math.max(...highs.slice(-16, -1));
    if (cur > boxHigh && volRatio >= 1.5) {
      patterns.push({
        name: 'Darvas Box Breakout (15m)', strength: 86, signal: 'BUY', category: 'Breakout',
        desc: 'Price breaks above 4-hour Darvas box high with volume — Nicolas Darvas method',
        entry: cur, target: parseFloat((cur + (boxHigh - Math.min(...lows.slice(-16, -1)))).toFixed(2)),
        stopLoss: parseFloat((boxHigh * 0.997).toFixed(2)),
      });
    }
  }

  // ── 41. VWAP BOUNCE (15m) ────────────────────────────────────────────────
  if (todayCndl.length >= 6) {
    const vwap = todayCndl.map(c => c.close).reduce((a, b) => a + b, 0) / todayCndl.length;
    const prevC = closes[n - 1];
    const bouncing = prevC >= vwap * 0.998 && prevC <= vwap * 1.005 && cur > prevC;
    if (bouncing && volRatio >= 1.2 && inUptrend) {
      patterns.push({
        name: 'VWAP Bounce (15m)', strength: 82, signal: 'BUY', category: 'Support/Resistance',
        desc: `Price bouncing off intraday VWAP ₹${vwap.toFixed(2)} — key support holding`,
        entry: cur, target: parseFloat((cur + atrVal * 1.5).toFixed(2)),
        stopLoss: parseFloat((vwap - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── 42. PREVIOUS DAY LOW BOUNCE (15m) ────────────────────────────────────
  if (pdhl) {
    const nearPDL = cur >= pdhl.low * 0.998 && cur <= pdhl.low * 1.005;
    if (nearPDL && closes[n] > closes[n - 1] && volRatio >= 1.2) {
      patterns.push({
        name: 'PDL Bounce (15m)', strength: 78, signal: 'BUY', category: 'Support/Resistance',
        desc: `Bouncing off previous day low ₹${pdhl.low.toFixed(2)} — key support level`,
        entry: cur, target: parseFloat((cur + (pdhl.high - pdhl.low) * 0.5).toFixed(2)),
        stopLoss: parseFloat((pdhl.low * 0.996).toFixed(2)),
      });
    }
  }

  // ── 43. HALF-DAY HIGH BREAKOUT (15m) ─────────────────────────────────────
  if (todayCndl.length >= 8) {
    const halfHigh = Math.max(...todayCndl.slice(0, Math.floor(todayCndl.length / 2)).map(c => c.high));
    if (cur >= halfHigh * 0.999 && volRatio >= 1.5 && todayCndl.length > Math.floor(todayCndl.length / 2)) {
      patterns.push({
        name: 'Half-Day High Breakout (15m)', strength: 83, signal: 'BUY', category: 'Breakout',
        desc: 'Breaking above first-half session high — afternoon momentum surge',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((halfHigh * 0.997).toFixed(2)),
      });
    }
  }

  // ── 44. ADAM & EVE DOUBLE BOTTOM (15m) ───────────────────────────────────
  if (n >= 20) {
    const first  = lows.slice(-20, -10);
    const second = lows.slice(-10);
    const adamLow = Math.min(...first);
    const eveLow  = Math.min(...second);
    const adamSharp   = first.filter(l => l < adamLow * 1.015).length <= 2;
    const eveRounded  = second.filter(l => l < eveLow * 1.02).length >= 3;
    const neck        = Math.max(...closes.slice(-20));
    if (adamSharp && eveRounded && Math.abs(adamLow - eveLow) / adamLow < 0.03 &&
        cur >= neck * 0.998 && volRatio >= 1.2) {
      patterns.push({
        name: 'Adam & Eve Double Bottom (15m)', strength: 87, signal: 'BUY', category: 'Reversal',
        desc: 'Sharp Adam + rounded Eve bottom on 15m with neckline break',
        entry: cur, target: parseFloat((cur + (neck - adamLow)).toFixed(2)),
        stopLoss: parseFloat((eveLow - atrVal * 0.3).toFixed(2)),
      });
    }
  }

  // ── 45. WEINSTEIN STAGE 2 ENTRY (15m) ────────────────────────────────────
  if (closes.length >= 20) {
    const s20     = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const s20Prev = closes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const aboveSMA = cur > s20;
    const rising   = s20 > s20Prev;
    const volOk    = volRatio >= 1.2;
    if (aboveSMA && rising && volOk && inUptrend) {
      patterns.push({
        name: 'Weinstein Stage 2 (15m)', strength: 80, signal: 'BUY', category: 'Trend',
        desc: 'Price above rising 20-period SMA with volume on 15m — Stage 2 uptrend',
        entry: cur, target: parseFloat((cur + atrVal * 2).toFixed(2)),
        stopLoss: parseFloat((s20 - atrVal * 0.5).toFixed(2)),
      });
    }
  }

  // ── Compute intraday score ────────────────────────────────────────────────
  const score = patterns.length === 0 ? 0
    : Math.min(
        patterns.reduce((s, p) => s + p.strength, 0) / patterns.length
        + Math.min((patterns.length - 1) * 4, 16),
        100
      );

  // ── Best setup (highest strength pattern) ────────────────────────────────
  const bestPattern = patterns.sort((a, b) => b.strength - a.strength)[0] || null;

  return {
    patterns,
    patternCount: patterns.length,
    score: Math.round(score),
    indicators: {
      ema9:       parseFloat(ema9.toFixed(2)),
      ema21:      parseFloat(ema21.toFixed(2)),
      rsi:        rsiVal,
      atr:        parseFloat(atrVal.toFixed(2)),
      macd:       macdVal,
      stoch:      parseFloat(stochVal.toFixed(1)),
      volRatio:   parseFloat(volRatio.toFixed(2)),
      inUptrend,
    },
    setup: bestPattern ? {
      entry:    bestPattern.entry,
      target:   bestPattern.target,
      stopLoss: bestPattern.stopLoss,
      rr:       bestPattern.target && bestPattern.stopLoss && bestPattern.entry
                  ? parseFloat(((bestPattern.target - bestPattern.entry) / (bestPattern.entry - bestPattern.stopLoss)).toFixed(2))
                  : null,
      pattern:  bestPattern.name,
    } : null,
    pdhl,
  };
}

module.exports = { detect15mPatterns, todayCandles, prevDayHL };
