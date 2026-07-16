const axios = require('axios');

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/',
};

/**
 * Order Flow Analyzer
 *
 * Metrics used:
 *  1. Bid/Ask Imbalance  — live order book (market hours): totalBuyQty vs totalSellQty
 *  2. Delivery %         — high delivery = real buyers accumulating, not intraday noise
 *  3. Volume Imbalance   — up-volume vs down-volume from candle history
 *  4. Price Pressure     — close near high of day = buyers winning
 *  5. OI + Price combo   — Long Buildup = smart money entering
 */

// ── Fetch live order book depth for a symbol ─────────────────────────────────
async function fetchOrderBook(symbol, cookieJar) {
  try {
    const res = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`,
      { headers: { ...NSE_HEADERS, Cookie: cookieJar }, timeout: 8000 }
    );
    const book = res.data?.marketDeptOrderBook;
    const dp   = res.data?.securityWiseDP;
    if (!book) return null;

    return {
      totalBuyQty:  book.totalBuyQuantity  || 0,
      totalSellQty: book.totalSellQuantity || 0,
      bids: (book.bid || []).map(b => ({ price: b.price, qty: b.quantity })),
      asks: (book.ask || []).map(a => ({ price: a.price, qty: a.quantity })),
      deliveryPct:  dp?.deliveryToTradedQuantity || null,
      deliveryQty:  dp?.deliveryQuantity || 0,
      tradedQty:    dp?.quantityTraded || 0,
    };
  } catch {
    return null;
  }
}

// ── Fetch delivery % for a symbol (works after market hours too) ──────────────
async function fetchDeliveryData(symbol, cookieJar) {
  try {
    const res = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`,
      { headers: { ...NSE_HEADERS, Cookie: cookieJar }, timeout: 8000 }
    );
    const dp = res.data?.securityWiseDP;
    if (!dp) return null;
    return {
      deliveryPct: dp.deliveryToTradedQuantity || 0,
      deliveryQty: dp.deliveryQuantity || 0,
      tradedQty:   dp.quantityTraded || 0,
      date:        dp.secWiseDelPosDate || '',
    };
  } catch {
    return null;
  }
}

// ── Compute volume imbalance from candle history ──────────────────────────────
function calcVolumeImbalance(candles) {
  if (!candles || candles.length < 10) return { ratio: 1, upVol: 0, downVol: 0 };

  let upVol = 0, downVol = 0;
  const recent = candles.slice(-20);
  recent.forEach(c => {
    if (c.close >= c.open) upVol   += c.volume;
    else                   downVol += c.volume;
  });

  const ratio = downVol > 0 ? upVol / downVol : upVol > 0 ? 99 : 1;
  return { ratio: parseFloat(ratio.toFixed(2)), upVol, downVol };
}

// ── Compute price pressure (close vs day range) ───────────────────────────────
function calcPricePressure(candles) {
  if (!candles || candles.length < 5) return 50;
  const recent = candles.slice(-5);
  const scores = recent.map(c => {
    const range = c.high - c.low;
    if (range === 0) return 50;
    return ((c.close - c.low) / range) * 100; // 100 = closed at high, 0 = closed at low
  });
  return parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
}

// ── Master order flow score for a stock ──────────────────────────────────────
function scoreOrderFlow(stock, candles, orderBook = null) {
  let score = 0;
  const signals = [];
  const details = {};

  // ── 1. Live Bid/Ask Imbalance (only during market hours) ──────────────────
  if (orderBook && (orderBook.totalBuyQty > 0 || orderBook.totalSellQty > 0)) {
    const buyQty  = orderBook.totalBuyQty;
    const sellQty = orderBook.totalSellQty;
    const total   = buyQty + sellQty;
    const buyPct  = total > 0 ? (buyQty / total) * 100 : 50;
    details.buyQty  = buyQty;
    details.sellQty = sellQty;
    details.buyPct  = parseFloat(buyPct.toFixed(1));

    if (buyPct >= 70) {
      score += 35;
      signals.push({ type: 'Heavy Buy Pressure', desc: `${buyPct.toFixed(0)}% buyers in order book`, bullish: true, strength: 'HIGH' });
    } else if (buyPct >= 60) {
      score += 20;
      signals.push({ type: 'Buy Pressure', desc: `${buyPct.toFixed(0)}% buyers vs ${(100 - buyPct).toFixed(0)}% sellers`, bullish: true, strength: 'MEDIUM' });
    } else if (buyPct < 40) {
      score -= 15;
      signals.push({ type: 'Sell Pressure', desc: `${(100 - buyPct).toFixed(0)}% sellers dominating`, bullish: false, strength: 'HIGH' });
    }

    // Bid/Ask depth imbalance (top 5 levels)
    if (orderBook.bids && orderBook.asks) {
      const bidDepth = orderBook.bids.reduce((s, b) => s + b.qty, 0);
      const askDepth = orderBook.asks.reduce((s, a) => s + a.qty, 0);
      if (bidDepth > askDepth * 2) {
        score += 15;
        signals.push({ type: 'Deep Bid Wall', desc: `Bid depth ${(bidDepth / 1000).toFixed(0)}K vs Ask ${(askDepth / 1000).toFixed(0)}K`, bullish: true, strength: 'HIGH' });
      }
      details.bidDepth = bidDepth;
      details.askDepth = askDepth;
    }
  }

  // ── 2. Delivery % (institutional accumulation signal) ─────────────────────
  const deliveryPct = orderBook?.deliveryPct ?? null;
  if (deliveryPct !== null) {
    details.deliveryPct = deliveryPct;
    if (deliveryPct >= 70) {
      score += 30;
      signals.push({ type: 'High Delivery %', desc: `${deliveryPct.toFixed(1)}% delivery — strong accumulation`, bullish: true, strength: 'HIGH' });
    } else if (deliveryPct >= 50) {
      score += 18;
      signals.push({ type: 'Good Delivery %', desc: `${deliveryPct.toFixed(1)}% delivery — real buyers holding`, bullish: true, strength: 'MEDIUM' });
    } else if (deliveryPct < 25) {
      score -= 10;
      signals.push({ type: 'Low Delivery %', desc: `${deliveryPct.toFixed(1)}% delivery — mostly intraday noise`, bullish: false, strength: 'LOW' });
    }
  }

  // ── 3. Volume Imbalance from candle history ────────────────────────────────
  const volImbalance = calcVolumeImbalance(candles);
  details.volImbalance = volImbalance;
  if (volImbalance.ratio >= 2.5) {
    score += 25;
    signals.push({ type: 'Volume Dominated by Buyers', desc: `Up-volume ${volImbalance.ratio}x down-volume (last 20 days)`, bullish: true, strength: 'HIGH' });
  } else if (volImbalance.ratio >= 1.5) {
    score += 15;
    signals.push({ type: 'Buyer Volume Edge', desc: `Up-volume ${volImbalance.ratio}x down-volume`, bullish: true, strength: 'MEDIUM' });
  } else if (volImbalance.ratio < 0.7) {
    score -= 10;
    signals.push({ type: 'Seller Volume Dominance', desc: `Down-volume ${(1 / volImbalance.ratio).toFixed(1)}x up-volume`, bullish: false, strength: 'HIGH' });
  }

  // ── 4. Price Pressure (close vs range) ────────────────────────────────────
  const pricePressure = calcPricePressure(candles);
  details.pricePressure = pricePressure;
  if (pricePressure >= 75) {
    score += 15;
    signals.push({ type: 'Closing Near Highs', desc: `Avg close at ${pricePressure.toFixed(0)}% of day range — buyers in control`, bullish: true, strength: 'MEDIUM' });
  } else if (pricePressure < 30) {
    score -= 10;
    signals.push({ type: 'Closing Near Lows', desc: `Avg close at ${pricePressure.toFixed(0)}% of day range — sellers winning`, bullish: false, strength: 'MEDIUM' });
  }

  // ── 5. OI + Price (Long Buildup = smart money) ────────────────────────────
  if (stock.openInterest > 0) {
    const oiChangePct = stock.openInterest > 0 ? (stock.oiChange / stock.openInterest) * 100 : 0;
    if (stock.change > 0 && stock.oiChange > 0 && oiChangePct > 5) {
      score += 20;
      signals.push({ type: 'Smart Money Long Buildup', desc: `OI +${oiChangePct.toFixed(1)}% with price up — institutions entering`, bullish: true, strength: 'HIGH' });
    }
    details.oiChangePct = parseFloat(oiChangePct.toFixed(2));
  }

  // ── 6. Large volume spike on up day ───────────────────────────────────────
  if (candles && candles.length > 20) {
    const avgVol = candles.slice(-21, -1).map(c => c.volume).reduce((a, b) => a + b, 0) / 20;
    const lastC  = candles[candles.length - 1];
    const volRatio = avgVol > 0 ? lastC.volume / avgVol : 1;
    if (volRatio >= 2 && lastC.close > lastC.open) {
      score += 15;
      signals.push({ type: 'Institutional Volume Spike', desc: `${volRatio.toFixed(1)}x avg volume on green day`, bullish: true, strength: 'HIGH' });
    }
    details.volRatio = parseFloat(volRatio.toFixed(2));
  }

  const finalScore = Math.max(0, Math.min(score, 100));

  return {
    score: finalScore,
    signals,
    details,
    grade: finalScore >= 70 ? 'A' : finalScore >= 50 ? 'B' : finalScore >= 30 ? 'C' : 'D',
    verdict: finalScore >= 70 ? 'Strong Buyer Dominance'
           : finalScore >= 50 ? 'Buyers in Control'
           : finalScore >= 30 ? 'Balanced'
           : 'Sellers Dominating',
  };
}

module.exports = { scoreOrderFlow, fetchOrderBook, fetchDeliveryData, calcVolumeImbalance, calcPricePressure };
