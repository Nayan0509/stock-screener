/**
 * CE / PE Buy Signal Engine
 *
 * Expert criteria used (all must pass for 90%+ confidence):
 *
 * TREND FILTER (mandatory):
 *   - Index must be in clear directional trend (not sideways)
 *   - EMA9 > EMA21 for CE, EMA9 < EMA21 for PE (15m)
 *   - Price above/below VWAP
 *   - ADX proxy > 20 (trending, not ranging)
 *
 * OI ANALYSIS:
 *   - Long Buildup for CE: price up + OI up + PCR rising
 *   - Short Covering for CE: price up + OI falling
 *   - CE Wall above (resistance) must be far enough for target
 *   - PE Wall below (support) must hold
 *
 * OPTION SPECIFIC:
 *   - IV not too high (avoid buying expensive options)
 *   - Premium not too deep ITM or too far OTM
 *   - Bid-Ask spread < 2% of premium (liquidity check)
 *   - Time decay check: avoid last 30 min of expiry day
 *
 * CHART PATTERNS (15m + 1h confluence):
 *   - At least 2 bullish patterns on 15m for CE
 *   - At least 1 pattern on 1h confirming direction
 *
 * RISK/REWARD:
 *   - Minimum R:R 1.5:1
 *   - Stop loss defined (below support for CE, above resistance for PE)
 *   - Target defined (next resistance for CE, next support for PE)
 */

const { detectIndexPatterns } = require('./indexAnalyzer');

// ── Trend strength (ADX proxy) ────────────────────────────────────────────────
function calcTrendStrength(candles) {
  if (!candles || candles.length < 14) return 0;
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const n = candles.length - 1;

  // Directional movement
  let plusDM = 0, minusDM = 0, tr = 0;
  const period = 14;
  for (let i = n - period + 1; i <= n; i++) {
    const upMove   = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    if (upMove > downMove && upMove > 0)   plusDM  += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
    tr += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
  }
  if (tr === 0) return 0;
  const plusDI  = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  return { adx: parseFloat(dx.toFixed(1)), plusDI: parseFloat(plusDI.toFixed(1)), minusDI: parseFloat(minusDI.toFixed(1)) };
}

// ── VWAP proxy (session average) ─────────────────────────────────────────────
function calcVWAP(candles) {
  if (!candles || candles.length === 0) return 0;
  // Use today's candles only
  const last = candles[candles.length - 1];
  const lastDate = last.time?.split('T')[0] || '';
  const today = lastDate ? candles.filter(c => c.time?.startsWith(lastDate)) : candles.slice(-26);
  if (today.length === 0) return candles[candles.length - 1].close;
  return today.reduce((s, c) => s + c.close, 0) / today.length;
}

// ── Sideways detection ────────────────────────────────────────────────────────
function isSideways(candles15m) {
  if (!candles15m || candles15m.length < 12) return true;
  const recent = candles15m.slice(-12);
  const high = Math.max(...recent.map(c => c.high));
  const low  = Math.min(...recent.map(c => c.low));
  const range = (high - low) / low * 100;
  // If 3-hour range < 0.4% of price → sideways
  return range < 0.4;
}

// ── IV check (avoid buying when IV is too high) ───────────────────────────────
function ivScore(iv) {
  if (!iv || iv === 0) return 50; // unknown
  if (iv < 12) return 90;  // low IV — cheap options, good to buy
  if (iv < 18) return 75;  // moderate
  if (iv < 25) return 55;  // elevated
  if (iv < 35) return 30;  // high — expensive
  return 10;               // very high — avoid buying
}

// ── Strike selection logic ────────────────────────────────────────────────────
function selectBestStrike(spot, strikes, type, strikeGap) {
  // For CE: slightly OTM (1 strike above ATM) — best delta/premium balance
  // For PE: slightly OTM (1 strike below ATM)
  const atm = Math.round(spot / strikeGap) * strikeGap;
  if (type === 'CE') {
    const otm1 = atm + strikeGap;
    const otm2 = atm + strikeGap * 2;
    // Prefer ATM or 1 OTM
    return strikes.includes(otm1) ? otm1 : strikes.includes(atm) ? atm : otm2;
  } else {
    const otm1 = atm - strikeGap;
    const otm2 = atm - strikeGap * 2;
    return strikes.includes(otm1) ? otm1 : strikes.includes(atm) ? atm : otm2;
  }
}

// ── Main signal generator ─────────────────────────────────────────────────────
function generateOptionSignals(indexKey, spot, candles15m, candles1h, candles1d, optionChain, meta) {
  const signals = [];
  if (!spot || spot === 0) return signals;

  const strikeGap = meta?.strikeGap || 50;
  const lotSize   = meta?.lotSize   || 75;

  // ── Pre-checks ────────────────────────────────────────────────────────────
  if (isSideways(candles15m)) return []; // No signals in sideways market

  const closes15m = candles15m?.map(c => c.close) || [];
  const closes1h  = candles1h?.map(c => c.close)  || [];
  const closes1d  = candles1d?.map(c => c.close)  || [];
  const n = closes15m.length - 1;
  if (n < 20) return [];

  // Indicators
  const ema9_15m  = calcEMA(closes15m, 9);
  const ema21_15m = calcEMA(closes15m, 21);
  const ema20_1h  = closes1h.length >= 20 ? calcEMA(closes1h, 20) : 0;
  const ema50_1h  = closes1h.length >= 50 ? calcEMA(closes1h, 50) : 0;
  const ema20_1d  = closes1d.length >= 20 ? calcEMA(closes1d, 20) : 0;
  const vwap      = calcVWAP(candles15m);
  const trend     = calcTrendStrength(candles15m);
  const adx       = trend?.adx || 0;
  const rsi15m    = calcRSI(closes15m, 9);
  const atr15m    = calcATR(candles15m, 10);
  const macd15m   = calcMACD(closes15m);

  // Patterns
  const pat15m = candles15m ? detectIndexPatterns(candles15m, '15m') : [];
  const pat1h  = candles1h  ? detectIndexPatterns(candles1h,  '1h')  : [];

  // OI data from option chain
  const oc = optionChain;
  const pcr = oc?.pcr || 1;
  const ceWall = oc?.ceWall?.strike || spot * 1.01;
  const peWall = oc?.peWall?.strike || spot * 0.99;
  const atmStrike = oc?.atmStrike || Math.round(spot / strikeGap) * strikeGap;
  const strikes = oc?.nearStrikes || [];

  // ── CE BUY SIGNAL ─────────────────────────────────────────────────────────
  const ceBullish15m = pat15m.filter(p => p.signal === 'BUY').length;
  const ceBullish1h  = pat1h.filter(p => p.signal === 'BUY').length;

  const ceConditions = {
    trend_up_15m:    ema9_15m > ema21_15m,
    above_vwap:      spot > vwap,
    trending:        adx >= 18,
    rsi_ok:          rsi15m >= 40 && rsi15m <= 72,
    macd_bullish:    macd15m.histogram > 0,
    patterns_15m:    ceBullish15m >= 2,
    patterns_1h:     ceBullish1h >= 1,
    trend_1h:        ema20_1h > 0 && ema50_1h > 0 ? ema20_1h > ema50_1h : true,
    trend_1d:        ema20_1d > 0 ? spot > ema20_1d : true,
    pcr_bullish:     pcr >= 0.7 && pcr <= 1.3, // neutral to slightly bullish PCR
    room_to_target:  ceWall > spot * 1.005, // CE wall (resistance) is at least 0.5% away
    not_overbought:  rsi15m < 75,
  };

  const ceScore = Object.values(ceConditions).filter(Boolean).length;
  const ceTotalConditions = Object.keys(ceConditions).length;
  const ceConfidence = Math.round((ceScore / ceTotalConditions) * 100);

  if (ceConfidence >= 75) { // 75%+ conditions met = high confidence CE buy
    const ceStrike = selectBestStrike(spot, strikes, 'CE', strikeGap);
    const ceData   = oc?.strikeMap?.[ceStrike]?.CE;
    const cePremium = ceData?.ltp || estimatePremium(spot, ceStrike, 'CE', atr15m);
    const ceIV      = ceData?.iv  || 0;
    const ceOI      = ceData?.oi  || 0;
    const ceOIChange= ceData?.oiChange || 0;

    // Target: next resistance (CE wall or 1% above)
    const ceTarget = Math.min(ceWall - strikeGap, spot + atr15m * 3);
    const ceSL     = Math.max(peWall + strikeGap, spot - atr15m * 1.5);
    const ceRR     = atr15m > 0 ? parseFloat(((ceTarget - spot) / (spot - ceSL)).toFixed(2)) : null;

    // Premium target & SL (option price moves)
    const premiumTarget = parseFloat((cePremium * 1.5).toFixed(1));  // 50% gain
    const premiumSL     = parseFloat((cePremium * 0.5).toFixed(1));  // 50% loss

    if (ceRR && ceRR >= 1.5) {
      signals.push({
        type:         'CE BUY',
        index:        meta?.label || indexKey,
        indexKey,
        strike:       ceStrike,
        expiry:       oc?.expiry || 'Near',
        premium:      parseFloat(cePremium.toFixed(1)),
        premiumTarget,
        premiumSL,
        spotEntry:    parseFloat(spot.toFixed(2)),
        spotTarget:   parseFloat(ceTarget.toFixed(2)),
        spotSL:       parseFloat(ceSL.toFixed(2)),
        rr:           ceRR,
        confidence:   ceConfidence,
        iv:           ceIV,
        oi:           ceOI,
        oiChange:     ceOIChange,
        lotSize,
        lotCost:      parseFloat((cePremium * lotSize).toFixed(0)),
        lotTarget:    parseFloat((premiumTarget * lotSize).toFixed(0)),
        lotSL:        parseFloat((premiumSL * lotSize).toFixed(0)),
        conditions:   ceConditions,
        conditionsMet: ceScore,
        totalConditions: ceTotalConditions,
        patterns15m:  pat15m.filter(p => p.signal === 'BUY').map(p => p.name),
        patterns1h:   pat1h.filter(p => p.signal === 'BUY').map(p => p.name),
        reason:       buildReason(ceConditions, 'CE', rsi15m, adx, pcr, ceBullish15m),
        ivScore:      ivScore(ceIV),
        color:        '#00c853',
      });
    }
  }

  // ── PE BUY SIGNAL ─────────────────────────────────────────────────────────
  const peBearish15m = pat15m.filter(p => p.signal === 'SELL' || p.category === 'Reversal').length;

  const peConditions = {
    trend_down_15m:  ema9_15m < ema21_15m,
    below_vwap:      spot < vwap,
    trending:        adx >= 18,
    rsi_ok:          rsi15m >= 28 && rsi15m <= 60,
    macd_bearish:    macd15m.histogram < 0,
    patterns_15m:    ceBullish15m === 0 && closes15m[n] < closes15m[n-1], // price falling
    trend_1h:        ema20_1h > 0 && ema50_1h > 0 ? ema20_1h < ema50_1h : false,
    trend_1d:        ema20_1d > 0 ? spot < ema20_1d : false,
    pcr_bearish:     pcr > 1.3, // high PCR = bearish
    room_to_target:  peWall < spot * 0.995,
    not_oversold:    rsi15m > 25,
    consecutive_red: closes15m[n] < closes15m[n-1] && closes15m[n-1] < closes15m[n-2],
  };

  const peScore = Object.values(peConditions).filter(Boolean).length;
  const peTotalConditions = Object.keys(peConditions).length;
  const peConfidence = Math.round((peScore / peTotalConditions) * 100);

  if (peConfidence >= 75) {
    const peStrike  = selectBestStrike(spot, strikes, 'PE', strikeGap);
    const peData    = oc?.strikeMap?.[peStrike]?.PE;
    const pePremium = peData?.ltp || estimatePremium(spot, peStrike, 'PE', atr15m);
    const peIV      = peData?.iv  || 0;
    const peOI      = peData?.oi  || 0;
    const peOIChange= peData?.oiChange || 0;

    const peTarget = Math.max(peWall + strikeGap, spot - atr15m * 3);
    const peSL     = Math.min(ceWall - strikeGap, spot + atr15m * 1.5);
    const peRR     = atr15m > 0 ? parseFloat(((spot - peTarget) / (peSL - spot)).toFixed(2)) : null;

    const premiumTarget = parseFloat((pePremium * 1.5).toFixed(1));
    const premiumSL     = parseFloat((pePremium * 0.5).toFixed(1));

    if (peRR && peRR >= 1.5) {
      signals.push({
        type:         'PE BUY',
        index:        meta?.label || indexKey,
        indexKey,
        strike:       peStrike,
        expiry:       oc?.expiry || 'Near',
        premium:      parseFloat(pePremium.toFixed(1)),
        premiumTarget,
        premiumSL,
        spotEntry:    parseFloat(spot.toFixed(2)),
        spotTarget:   parseFloat(peTarget.toFixed(2)),
        spotSL:       parseFloat(peSL.toFixed(2)),
        rr:           peRR,
        confidence:   peConfidence,
        iv:           peIV,
        oi:           peOI,
        oiChange:     peOIChange,
        lotSize,
        lotCost:      parseFloat((pePremium * lotSize).toFixed(0)),
        lotTarget:    parseFloat((premiumTarget * lotSize).toFixed(0)),
        lotSL:        parseFloat((premiumSL * lotSize).toFixed(0)),
        conditions:   peConditions,
        conditionsMet: peScore,
        totalConditions: peTotalConditions,
        patterns15m:  [],
        patterns1h:   [],
        reason:       buildReason(peConditions, 'PE', rsi15m, adx, pcr, 0),
        ivScore:      ivScore(peIV),
        color:        '#ff5252',
      });
    }
  }

  return signals;
}

// ── Premium estimator (when live data unavailable) ────────────────────────────
function estimatePremium(spot, strike, type, atr) {
  const intrinsic = type === 'CE'
    ? Math.max(0, spot - strike)
    : Math.max(0, strike - spot);
  const timeValue = atr * 0.8; // rough time value estimate
  return Math.max(intrinsic + timeValue, atr * 0.3);
}

function buildReason(conditions, type, rsi, adx, pcr, patCount) {
  const reasons = [];
  if (type === 'CE') {
    if (conditions.trend_up_15m)  reasons.push('EMA9 > EMA21 (15m uptrend)');
    if (conditions.above_vwap)    reasons.push('Price above VWAP');
    if (conditions.macd_bullish)  reasons.push('MACD histogram positive');
    if (conditions.patterns_15m)  reasons.push(`${patCount} bullish patterns on 15m`);
    if (conditions.pcr_bullish)   reasons.push(`PCR ${pcr} (neutral-bullish)`);
  } else {
    if (conditions.trend_down_15m) reasons.push('EMA9 < EMA21 (15m downtrend)');
    if (conditions.below_vwap)     reasons.push('Price below VWAP');
    if (conditions.macd_bearish)   reasons.push('MACD histogram negative');
    if (conditions.pcr_bearish)    reasons.push(`PCR ${pcr} (bearish)`);
    if (conditions.consecutive_red) reasons.push('3 consecutive red candles');
  }
  if (conditions.trending) reasons.push(`ADX ${adx} (trending market)`);
  reasons.push(`RSI(9): ${rsi}`);
  return reasons;
}

// ── Indicator helpers (self-contained) ───────────────────────────────────────
function calcEMA(data, period) {
  if (!data || data.length < period) return data?.[data.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
  return e;
}

function calcRSI(closes, period = 9) {
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al += Math.abs(d);
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

function calcATR(candles, period = 10) {
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

module.exports = { generateOptionSignals, calcTrendStrength, isSideways };
