/**
 * Order Book Dominance Analyzer
 *
 * Finds F&O stocks where:
 *   - Buyers dominate 70%+ of total bid/ask quantity  → BUYER DOMINATED
 *   - Sellers dominate 70%+ of total bid/ask quantity → SELLER DOMINATED
 *
 * Data sources (in priority order):
 *   1. NSE live order book (totalBuyQuantity / totalSellQuantity) — market hours only
 *   2. Volume imbalance from 15m candles (up-volume vs down-volume) — always available
 *   3. OI + price action (Long Buildup / Short Buildup) — always available
 *   4. Delivery % (high = buyers holding) — always available
 *
 * A stock qualifies if ANY 2 of the 4 sources agree on dominance direction
 * AND the dominance is 70%+
 */

const axios = require('axios');

const NSE_H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/',
};

// ── Fetch live order book for a stock ────────────────────────────────────────
async function fetchOrderBook(symbol, cookieJar) {
  try {
    const r = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`,
      { headers: { ...NSE_H, Cookie: cookieJar }, timeout: 8000 }
    );
    const book = r.data?.marketDeptOrderBook;
    const dp   = r.data?.securityWiseDP;
    if (!book) return null;

    const buyQty  = book.totalBuyQuantity  || 0;
    const sellQty = book.totalSellQuantity || 0;
    const total   = buyQty + sellQty;
    const buyPct  = total > 0 ? parseFloat(((buyQty / total) * 100).toFixed(1)) : null;
    const sellPct = total > 0 ? parseFloat(((sellQty / total) * 100).toFixed(1)) : null;

    // Top 5 bid/ask depth
    const bids = (book.bid || []).map(b => ({ price: b.price, qty: b.quantity })).filter(b => b.qty > 0);
    const asks = (book.ask || []).map(a => ({ price: a.price, qty: a.quantity })).filter(a => a.qty > 0);
    const bidDepth = bids.reduce((s, b) => s + b.qty, 0);
    const askDepth = asks.reduce((s, a) => s + a.qty, 0);

    return {
      buyQty, sellQty, buyPct, sellPct,
      bids, asks, bidDepth, askDepth,
      deliveryPct: dp?.deliveryToTradedQuantity || null,
      hasLiveData: total > 0,
    };
  } catch { return null; }
}

// ── Volume imbalance from 15m candles ────────────────────────────────────────
function calcVolumeImbalance(candles15m) {
  if (!candles15m || candles15m.length < 10) return null;
  const recent = candles15m.slice(-20);
  let upVol = 0, downVol = 0;
  recent.forEach(c => {
    if (c.close >= c.open) upVol   += c.volume;
    else                   downVol += c.volume;
  });
  const total  = upVol + downVol;
  const buyPct = total > 0 ? parseFloat(((upVol / total) * 100).toFixed(1)) : 50;
  return { upVol, downVol, buyPct, sellPct: parseFloat((100 - buyPct).toFixed(1)) };
}

// ── Price pressure (close position in day range) ──────────────────────────────
function calcPricePressure(candles15m) {
  if (!candles15m || candles15m.length < 5) return 50;
  const recent = candles15m.slice(-8);
  const scores = recent.map(c => {
    const range = c.high - c.low;
    return range > 0 ? ((c.close - c.low) / range) * 100 : 50;
  });
  return parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
}

// ── Master dominance scorer ───────────────────────────────────────────────────
function scoreDominance(stock, orderBook, candles15m) {
  const signals = [];
  let buyScore = 0, sellScore = 0;

  // ── Source 1: Live order book ─────────────────────────────────────────────
  if (orderBook?.hasLiveData) {
    const bp = orderBook.buyPct;
    const sp = orderBook.sellPct;
    if (bp >= 70) {
      buyScore += 40;
      signals.push({ source: 'Order Book', type: 'BUY', value: bp, desc: `${bp}% buy orders vs ${sp}% sell orders`, strength: 'LIVE' });
    } else if (sp >= 70) {
      sellScore += 40;
      signals.push({ source: 'Order Book', type: 'SELL', value: sp, desc: `${sp}% sell orders vs ${bp}% buy orders`, strength: 'LIVE' });
    }

    // Bid/Ask depth wall
    if (orderBook.bidDepth > 0 && orderBook.askDepth > 0) {
      const depthTotal = orderBook.bidDepth + orderBook.askDepth;
      const bidPct = (orderBook.bidDepth / depthTotal) * 100;
      if (bidPct >= 65) {
        buyScore += 20;
        signals.push({ source: 'Depth Wall', type: 'BUY', value: parseFloat(bidPct.toFixed(1)), desc: `Bid depth ${(orderBook.bidDepth/1000).toFixed(0)}K vs Ask ${(orderBook.askDepth/1000).toFixed(0)}K`, strength: 'LIVE' });
      } else if (bidPct <= 35) {
        sellScore += 20;
        signals.push({ source: 'Depth Wall', type: 'SELL', value: parseFloat((100-bidPct).toFixed(1)), desc: `Ask depth ${(orderBook.askDepth/1000).toFixed(0)}K dominates`, strength: 'LIVE' });
      }
    }
  }

  // ── Source 2: Volume imbalance ────────────────────────────────────────────
  const volImb = calcVolumeImbalance(candles15m);
  if (volImb) {
    if (volImb.buyPct >= 65) {
      buyScore += 25;
      signals.push({ source: 'Volume', type: 'BUY', value: volImb.buyPct, desc: `${volImb.buyPct}% up-volume in last 20 candles`, strength: 'HIGH' });
    } else if (volImb.sellPct >= 65) {
      sellScore += 25;
      signals.push({ source: 'Volume', type: 'SELL', value: volImb.sellPct, desc: `${volImb.sellPct}% down-volume in last 20 candles`, strength: 'HIGH' });
    }
  }

  // ── Source 3: OI + Price action ───────────────────────────────────────────
  const oi       = stock.openInterest || 0;
  const oiChange = stock.oiChange || 0;
  const change   = stock.change || 0;
  if (oi > 0) {
    const oiChangePct = (oiChange / oi) * 100;
    if (change > 0.5 && oiChange > 0 && oiChangePct > 3) {
      buyScore += 20;
      signals.push({ source: 'OI', type: 'BUY', value: parseFloat(oiChangePct.toFixed(1)), desc: `Long Buildup: price +${change.toFixed(1)}% + OI +${oiChangePct.toFixed(1)}%`, strength: 'HIGH' });
    } else if (change < -0.5 && oiChange > 0 && oiChangePct > 3) {
      sellScore += 20;
      signals.push({ source: 'OI', type: 'SELL', value: parseFloat(oiChangePct.toFixed(1)), desc: `Short Buildup: price ${change.toFixed(1)}% + OI +${oiChangePct.toFixed(1)}%`, strength: 'HIGH' });
    } else if (change > 0.5 && oiChange < 0) {
      buyScore += 15;
      signals.push({ source: 'OI', type: 'BUY', value: Math.abs(oiChangePct), desc: `Short Covering: price up + OI falling`, strength: 'MEDIUM' });
    }
  }

  // ── Source 4: Price pressure ──────────────────────────────────────────────
  const pp = calcPricePressure(candles15m);
  if (pp >= 70) {
    buyScore += 15;
    signals.push({ source: 'Price Pressure', type: 'BUY', value: pp, desc: `Closing at ${pp}% of day range — buyers winning`, strength: 'MEDIUM' });
  } else if (pp <= 30) {
    sellScore += 15;
    signals.push({ source: 'Price Pressure', type: 'SELL', value: parseFloat((100-pp).toFixed(1)), desc: `Closing at ${pp}% of day range — sellers winning`, strength: 'MEDIUM' });
  }

  // ── Source 5: Delivery % ──────────────────────────────────────────────────
  const delPct = orderBook?.deliveryPct;
  if (delPct != null) {
    if (delPct >= 60) {
      buyScore += 15;
      signals.push({ source: 'Delivery', type: 'BUY', value: delPct, desc: `${delPct.toFixed(1)}% delivery — institutional accumulation`, strength: 'HIGH' });
    } else if (delPct < 25) {
      sellScore += 10;
      signals.push({ source: 'Delivery', type: 'SELL', value: delPct, desc: `${delPct.toFixed(1)}% delivery — mostly intraday selling`, strength: 'LOW' });
    }
  }

  // ── Final dominance calculation ───────────────────────────────────────────
  const totalScore = buyScore + sellScore;
  const buyDomPct  = totalScore > 0 ? parseFloat(((buyScore / totalScore) * 100).toFixed(1)) : 50;
  const sellDomPct = parseFloat((100 - buyDomPct).toFixed(1));

  const direction = buyScore >= sellScore ? 'BUY' : 'SELL';
  const domPct    = direction === 'BUY' ? buyDomPct : sellDomPct;

  // ── Strict qualification rules ────────────────────────────────────────────
  const hasLive = orderBook?.hasLiveData;

  // Count how many INDEPENDENT sources agree on the direction
  const agreeSources = signals.filter(s => s.type === direction).length;

  // Without live order book: need at least 3 sources agreeing + domPct >= 72
  // With live order book: need at least 2 sources + domPct >= 68
  const minSources  = hasLive ? 2 : 3;
  const minDomPct   = hasLive ? 68 : 72;
  // Also need minimum raw score to avoid noise (single weak signal = skip)
  const minRawScore = hasLive ? 40 : 50;
  const rawScore    = direction === 'BUY' ? buyScore : sellScore;

  if (agreeSources < minSources) return null;
  if (domPct < minDomPct)        return null;
  if (rawScore < minRawScore)    return null;

  const grade = domPct >= 85 ? 'A' : domPct >= 75 ? 'B' : 'C';

  return {
    symbol:      stock.symbol,
    ltp:         stock.ltp || 0,
    change:      stock.change || 0,
    direction,
    domPct,
    buyPct:      buyDomPct,
    sellPct:     sellDomPct,
    buyScore,
    sellScore,
    grade,
    signals,
    signalCount: signals.length,
    liveData:    orderBook?.hasLiveData || false,
    orderBook,
    volImbalance: volImb,
    pricePressure: pp,
    deliveryPct:  delPct,
    color:        direction === 'BUY' ? '#00c853' : '#ff5252',
    label:        direction === 'BUY' ? 'BUYER DOMINATED' : 'SELLER DOMINATED',
  };
}

module.exports = { scoreDominance, fetchOrderBook, calcVolumeImbalance, calcPricePressure };
