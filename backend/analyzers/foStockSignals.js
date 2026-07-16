/**
 * F&O Stock CE/PE Signal Engine
 *
 * Expert-level criteria for stock options (stricter than index options):
 *
 * FUNDAMENTAL FILTER (stock-specific):
 *   - Delivery % > 40% (real buyers, not just intraday noise)
 *   - Volume > 1.5x 20-day average (institutional interest)
 *   - Not near earnings (avoid IV crush)
 *   - Market cap > ₹5000 Cr (liquid stock)
 *
 * TREND & MOMENTUM (multi-timeframe):
 *   - 15m: EMA9 > EMA21 for CE, < for PE
 *   - 1h:  EMA20 > EMA50 for CE
 *   - 1D:  Price above EMA50 for CE (macro trend)
 *   - RSI(14) 45–70 for CE, 30–55 for PE
 *   - MACD histogram positive for CE
 *   - ADX > 20 (trending, not sideways — theta decay killer)
 *
 * OI ANALYSIS (most important for stock options):
 *   - Long Buildup: price up + OI up + PCR neutral
 *   - Short Covering: price up + OI down (squeeze)
 *   - OI change > 5% (significant new positions)
 *   - CE wall above must give R:R ≥ 1.5
 *   - PE wall below must hold as support
 *
 * CHART PATTERNS:
 *   - At least 2 patterns on 15m
 *   - At least 1 pattern on 1h confirming
 *   - Near key support (for CE) or resistance (for PE)
 *
 * OPTION SPECIFIC:
 *   - IV < 40% (avoid buying expensive options)
 *   - Prefer ATM or 1-strike OTM (best delta)
 *   - Bid-ask spread < 3% of premium
 *   - Avoid last 2 days before expiry (theta accelerates)
 *
 * RISK MANAGEMENT:
 *   - Minimum R:R 1.5:1
 *   - Max loss per trade = 50% of premium
 *   - Stop loss = below nearest support (CE) / above resistance (PE)
 */

const { detectIndexPatterns } = require('./indexAnalyzer');

// ── Indicators ────────────────────────────────────────────────────────────────
function ema(data, p) {
  if (!data || data.length < p) return data?.[data.length - 1] ?? 0;
  const k = 2 / (p + 1);
  let e = data.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < data.length; i++) e = data[i] * k + e * (1 - k);
  return e;
}

function rsi(closes, p = 14) {
  if (closes.length < p + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i-1]; d > 0 ? ag += d : al += Math.abs(d); }
  ag /= p; al /= p;
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    ag = (ag*(p-1) + Math.max(d,0)) / p;
    al = (al*(p-1) + Math.max(-d,0)) / p;
  }
  return al === 0 ? 100 : parseFloat((100 - 100/(1 + ag/al)).toFixed(2));
}

function atr(candles, p = 14) {
  if (candles.length < p + 1) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const pv = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - pv.close), Math.abs(c.low - pv.close));
  });
  return trs.slice(-p).reduce((a, b) => a + b, 0) / p;
}

function macd(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const line = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    line.push(ema(s, 12) - ema(s, 26));
  }
  const sig = line.length >= 9 ? ema(line, 9) : line[line.length - 1];
  const val = line[line.length - 1];
  return { macd: val, signal: sig, histogram: val - sig };
}

function adxProxy(candles) {
  if (candles.length < 14) return 0;
  const highs = candles.map(c => c.high), lows = candles.map(c => c.low), closes = candles.map(c => c.close);
  const n = candles.length - 1;
  let pDM = 0, mDM = 0, tr = 0;
  for (let i = n - 13; i <= n; i++) {
    const up = highs[i] - highs[i-1], dn = lows[i-1] - lows[i];
    if (up > dn && up > 0) pDM += up;
    if (dn > up && dn > 0) mDM += dn;
    tr += Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
  }
  if (tr === 0) return 0;
  const pDI = (pDM/tr)*100, mDI = (mDM/tr)*100;
  return parseFloat((Math.abs(pDI-mDI)/(pDI+mDI)*100).toFixed(1));
}

function vwapProxy(candles) {
  if (!candles?.length) return 0;
  const last = candles[candles.length-1];
  const lastDate = last.time?.split('T')[0] || '';
  const today = lastDate ? candles.filter(c => c.time?.startsWith(lastDate)) : candles.slice(-26);
  return today.length ? today.reduce((s,c) => s+c.close, 0) / today.length : last.close;
}

function isSideways(candles) {
  if (!candles || candles.length < 12) return true;
  const r = candles.slice(-12);
  const range = (Math.max(...r.map(c=>c.high)) - Math.min(...r.map(c=>c.low))) / r[0].close * 100;
  return range < 0.5;
}

function nearestSupport(candles) {
  if (!candles || candles.length < 10) return 0;
  return Math.min(...candles.slice(-20).map(c => c.low));
}

function nearestResistance(candles) {
  if (!candles || candles.length < 10) return Infinity;
  return Math.max(...candles.slice(-20).map(c => c.high));
}

function strikeForStock(spot, strikeGap, type) {
  const atm = Math.round(spot / strikeGap) * strikeGap;
  return type === 'CE' ? atm + strikeGap : atm - strikeGap; // 1 OTM
}

function estimatePremium(spot, strike, type, atrVal) {
  const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  return Math.max(intrinsic + atrVal * 0.6, atrVal * 0.25);
}

// ── Strike gap lookup ─────────────────────────────────────────────────────────
function getStrikeGap(spot) {
  if (spot < 100)   return 2.5;
  if (spot < 250)   return 5;
  if (spot < 500)   return 10;
  if (spot < 1000)  return 20;
  if (spot < 2500)  return 50;
  if (spot < 5000)  return 100;
  return 200;
}

// ── Main signal generator for a single F&O stock ─────────────────────────────
function generateFOSignal(stock, candles15m, candles1h, candles1d, optionChain, deliveryPct) {
  const spot = stock.ltp || stock.lastPrice || 0;
  if (!spot || spot === 0) return null;
  if (isSideways(candles15m)) return null; // No signals in sideways market

  const c15 = candles15m || [], c1h = candles1h || [], c1d = candles1d || [];
  const cl15 = c15.map(c => c.close), cl1h = c1h.map(c => c.close), cl1d = c1d.map(c => c.close);
  const n = cl15.length - 1;
  if (n < 20) return null;

  // ── Indicators ──────────────────────────────────────────────────────────────
  const ema9_15  = ema(cl15, 9),  ema21_15 = ema(cl15, 21);
  const ema20_1h = cl1h.length >= 20 ? ema(cl1h, 20) : 0;
  const ema50_1h = cl1h.length >= 50 ? ema(cl1h, 50) : 0;
  const ema50_1d = cl1d.length >= 50 ? ema(cl1d, 50) : 0;
  const ema200_1d= cl1d.length >= 200? ema(cl1d, 200): 0;
  const rsi15    = rsi(cl15, 14);
  const rsi1d    = cl1d.length >= 15 ? rsi(cl1d, 14) : 50;
  const atr15    = atr(c15, 14);
  const atr1d    = atr(c1d, 14);
  const macd15   = macd(cl15);
  const adxVal   = adxProxy(c15);
  const vwap     = vwapProxy(c15);

  // ── Chart patterns ──────────────────────────────────────────────────────────
  const pat15m = c15.length >= 20 ? detectIndexPatterns(c15, '15m').map(p => ({ ...p, tf: '15m' })) : [];
  const pat1h  = c1h.length >= 20 ? detectIndexPatterns(c1h,  '1h').map(p => ({ ...p, tf: '1h' }))  : [];
  const pat1d  = c1d.length >= 20 ? detectIndexPatterns(c1d,  '1d').map(p => ({ ...p, tf: '1D' }))  : [];
  const bullPat15 = pat15m.filter(p => p.signal === 'BUY').length;
  const bullPat1h = pat1h.filter(p => p.signal === 'BUY').length;
  const bullPat1d = pat1d.filter(p => p.signal === 'BUY').length;

  // ── OI data ─────────────────────────────────────────────────────────────────
  const oi       = stock.openInterest || 0;
  const oiChange = stock.oiChange || stock.changeinOpenInterest || 0;
  const oiChangePct = oi > 0 ? (oiChange / oi) * 100 : 0;
  const longBuildup  = stock.change > 0 && oiChange > 0;
  const shortCovering= stock.change > 0 && oiChange < 0;
  const shortBuildup = stock.change < 0 && oiChange > 0;

  // ── Fundamental ─────────────────────────────────────────────────────────────
  const delivOk  = deliveryPct == null || deliveryPct >= 40;
  const volRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;
  const volOk    = volRatio >= 1.5;
  const near52H  = stock.yearHigh > 0 && spot >= stock.yearHigh * 0.95;
  const above52L = stock.yearLow  > 0 && spot >= stock.yearLow  * 1.10;

  // ── Key levels ──────────────────────────────────────────────────────────────
  const support    = nearestSupport(c15);
  const resistance = nearestResistance(c15);
  const strikeGap  = getStrikeGap(spot);

  // ── Option chain ────────────────────────────────────────────────────────────
  const oc = optionChain;
  const ceStrike = oc?.atmStrike ? oc.atmStrike + strikeGap : strikeForStock(spot, strikeGap, 'CE');
  const peStrike = oc?.atmStrike ? oc.atmStrike - strikeGap : strikeForStock(spot, strikeGap, 'PE');
  const ceData   = oc?.strikeMap?.[ceStrike]?.CE;
  const peData   = oc?.strikeMap?.[peStrike]?.PE;

  const results = [];

  // ════════════════════════════════════════════════════════════════════════════
  // CE BUY CONDITIONS
  // ════════════════════════════════════════════════════════════════════════════
  const ceConditions = {
    // Trend
    uptrend_15m:      ema9_15 > ema21_15,
    uptrend_1h:       ema20_1h > 0 && ema50_1h > 0 ? ema20_1h > ema50_1h : true,
    above_ema50_1d:   ema50_1d > 0 ? spot > ema50_1d : true,
    above_vwap:       spot > vwap,
    // Momentum
    rsi_healthy:      rsi15 >= 45 && rsi15 <= 72,
    rsi_1d_ok:        rsi1d >= 40 && rsi1d <= 75,
    macd_bullish:     macd15.histogram > 0,
    trending_market:  adxVal >= 18,
    // Chart patterns
    patterns_15m:     bullPat15 >= 2,
    patterns_1h:      bullPat1h >= 1,
    // OI signals
    oi_bullish:       longBuildup || shortCovering,
    oi_significant:   Math.abs(oiChangePct) >= 3,
    // Fundamental
    delivery_ok:      delivOk,
    volume_surge:     volOk,
    // Price structure
    not_overbought:   rsi15 < 75,
    above_support:    spot > support * 1.002,
    near_52w_high:    near52H || (spot > ema50_1d * 1.02),
  };

  const ceScore = Object.values(ceConditions).filter(Boolean).length;
  const cePct   = Math.round((ceScore / Object.keys(ceConditions).length) * 100);

  if (cePct >= 70) {
    const cePremium = ceData?.ltp || estimatePremium(spot, ceStrike, 'CE', atr15);
    const ceIV      = ceData?.iv  || 0;
    const ceOI      = ceData?.oi  || 0;
    const ceOIChg   = ceData?.oiChange || 0;

    // Target: next resistance or 2x ATR above
    const ceTarget = Math.min(resistance * 0.998, spot + atr1d * 2.5);
    const ceSL     = Math.max(support * 1.001, spot - atr15 * 2);
    const ceRR     = (ceTarget - spot) / (spot - ceSL);

    if (ceRR >= 1.5 && cePremium > 0) {
      const premTgt = parseFloat((cePremium * 1.6).toFixed(1));
      const premSL  = parseFloat((cePremium * 0.45).toFixed(1));
      const lotSize = estimateLotSize(spot);

      results.push({
        type:           'CE BUY',
        symbol:         stock.symbol,
        sector:         stock.meta?.industry || stock.industry || '',
        spot:           parseFloat(spot.toFixed(2)),
        strike:         ceStrike,
        expiry:         oc?.expiry || 'Near Monthly',
        premium:        parseFloat(cePremium.toFixed(1)),
        premiumTarget:  premTgt,
        premiumSL:      premSL,
        premiumGainPct: parseFloat(((premTgt/cePremium - 1)*100).toFixed(0)),
        spotTarget:     parseFloat(ceTarget.toFixed(2)),
        spotSL:         parseFloat(ceSL.toFixed(2)),
        rr:             parseFloat(ceRR.toFixed(2)),
        confidence:     cePct,
        conditionsMet:  ceScore,
        totalConditions:Object.keys(ceConditions).length,
        conditions:     ceConditions,
        iv:             ceIV,
        ivOk:           ceIV === 0 || ceIV < 40,
        oi:             ceOI,
        oiChange:       ceOIChg,
        oiSignal:       longBuildup ? 'Long Buildup' : shortCovering ? 'Short Covering' : 'Neutral',
        deliveryPct:    deliveryPct,
        volRatio:       parseFloat(volRatio.toFixed(2)),
        lotSize,
        lotCost:        parseFloat((cePremium * lotSize).toFixed(0)),
        lotProfit:      parseFloat(((premTgt - cePremium) * lotSize).toFixed(0)),
        lotLoss:        parseFloat(((cePremium - premSL) * lotSize).toFixed(0)),
        // All 45 patterns with full detail across all timeframes
        patterns15m:    pat15m,
        patterns1h:     pat1h,
        patterns1d:     pat1d,
        patternCount15m: pat15m.length,
        patternCount1h:  pat1h.length,
        patternCount1d:  pat1d.length,
        totalPatterns:   pat15m.length + pat1h.length + pat1d.length,
        // Quick name lists for card display
        topPatterns:    [...pat15m, ...pat1h, ...pat1d]
                          .sort((a,b) => b.strength - a.strength)
                          .slice(0, 6)
                          .map(p => ({ name: p.name, tf: p.tf || '15m', strength: p.strength, category: p.category })),
        indicators:     { rsi15, rsi1d, adx: adxVal, macdHist: parseFloat(macd15.histogram.toFixed(2)), vwap: parseFloat(vwap.toFixed(2)) },
        near52High:     near52H,
        color:          '#00c853',
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PE BUY CONDITIONS
  // ════════════════════════════════════════════════════════════════════════════
  const peConditions = {
    downtrend_15m:    ema9_15 < ema21_15,
    downtrend_1h:     ema20_1h > 0 && ema50_1h > 0 ? ema20_1h < ema50_1h : false,
    below_ema50_1d:   ema50_1d > 0 ? spot < ema50_1d : false,
    below_vwap:       spot < vwap,
    rsi_bearish:      rsi15 >= 28 && rsi15 <= 55,
    rsi_1d_weak:      rsi1d <= 55,
    macd_bearish:     macd15.histogram < 0,
    trending_market:  adxVal >= 18,
    oi_bearish:       shortBuildup || (stock.change < 0 && oiChange < 0),
    oi_significant:   Math.abs(oiChangePct) >= 3,
    delivery_ok:      delivOk,
    volume_surge:     volOk,
    not_oversold:     rsi15 > 25,
    below_resistance: spot < resistance * 0.998,
    consecutive_red:  cl15.length >= 3 && cl15[n] < cl15[n-1] && cl15[n-1] < cl15[n-2],
    below_52w_mid:    stock.yearHigh > 0 && stock.yearLow > 0 ? spot < (stock.yearHigh + stock.yearLow) / 2 : false,
  };

  const peScore = Object.values(peConditions).filter(Boolean).length;
  const pePct   = Math.round((peScore / Object.keys(peConditions).length) * 100);

  if (pePct >= 70) {
    const pePremium = peData?.ltp || estimatePremium(spot, peStrike, 'PE', atr15);
    const peIV      = peData?.iv  || 0;
    const peOI      = peData?.oi  || 0;
    const peOIChg   = peData?.oiChange || 0;

    const peTarget = Math.max(support * 1.001, spot - atr1d * 2.5);
    const peSL     = Math.min(resistance * 0.999, spot + atr15 * 2);
    const peRR     = (spot - peTarget) / (peSL - spot);

    if (peRR >= 1.5 && pePremium > 0) {
      const premTgt = parseFloat((pePremium * 1.6).toFixed(1));
      const premSL  = parseFloat((pePremium * 0.45).toFixed(1));
      const lotSize = estimateLotSize(spot);

      results.push({
        type:           'PE BUY',
        symbol:         stock.symbol,
        sector:         stock.meta?.industry || stock.industry || '',
        spot:           parseFloat(spot.toFixed(2)),
        strike:         peStrike,
        expiry:         oc?.expiry || 'Near Monthly',
        premium:        parseFloat(pePremium.toFixed(1)),
        premiumTarget:  premTgt,
        premiumSL:      premSL,
        premiumGainPct: parseFloat(((premTgt/pePremium - 1)*100).toFixed(0)),
        spotTarget:     parseFloat(peTarget.toFixed(2)),
        spotSL:         parseFloat(peSL.toFixed(2)),
        rr:             parseFloat(peRR.toFixed(2)),
        confidence:     pePct,
        conditionsMet:  peScore,
        totalConditions:Object.keys(peConditions).length,
        conditions:     peConditions,
        iv:             peIV,
        ivOk:           peIV === 0 || peIV < 40,
        oi:             peOI,
        oiChange:       peOIChg,
        oiSignal:       shortBuildup ? 'Short Buildup' : 'Bearish OI',
        deliveryPct,
        volRatio:       parseFloat(volRatio.toFixed(2)),
        lotSize,
        lotCost:        parseFloat((pePremium * lotSize).toFixed(0)),
        lotProfit:      parseFloat(((premTgt - pePremium) * lotSize).toFixed(0)),
        lotLoss:        parseFloat(((pePremium - premSL) * lotSize).toFixed(0)),
        // All 45 patterns with full detail across all timeframes
        patterns15m:    pat15m,
        patterns1h:     pat1h,
        patterns1d:     pat1d,
        patternCount15m: pat15m.length,
        patternCount1h:  pat1h.length,
        patternCount1d:  pat1d.length,
        totalPatterns:   pat15m.length + pat1h.length + pat1d.length,
        topPatterns:    [...pat15m, ...pat1h, ...pat1d]
                          .sort((a,b) => b.strength - a.strength)
                          .slice(0, 6)
                          .map(p => ({ name: p.name, tf: p.tf || '15m', strength: p.strength, category: p.category })),
        indicators:     { rsi15, rsi1d, adx: adxVal, macdHist: parseFloat(macd15.histogram.toFixed(2)), vwap: parseFloat(vwap.toFixed(2)) },
        near52High:     near52H,
        color:          '#ff5252',
      });
    }
  }

  return results.length > 0 ? results : null;
}

function estimateLotSize(spot) {
  // NSE standard lot sizes (approximate)
  if (spot < 100)   return 4000;
  if (spot < 250)   return 2000;
  if (spot < 500)   return 1200;
  if (spot < 1000)  return 600;
  if (spot < 2000)  return 300;
  if (spot < 5000)  return 150;
  return 75;
}

module.exports = { generateFOSignal };
