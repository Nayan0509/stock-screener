const express = require('express');
const router  = express.Router();
const { scoreDominance, fetchOrderBook } = require('../analyzers/orderDominance');

let cachedDominance  = [];
let dominanceUpdated = null;
let isRunning        = false;
let broadcastFn      = () => {};

function setBroadcast(fn) { broadcastFn = fn; }

async function runDominanceScan(cachedResults) {
  if (isRunning) return;
  isRunning = true;
  try {
    broadcastFn({ type: 'dominance_status', message: 'Scanning F&O order book dominance...' });

    const { fetchFOStockList, fetchStockCandles } = require('../scrapers/foStockData');
    const { cookieJar } = require('../scrapers/nseScraper');
    const { FO_SYMBOLS } = require('../scrapers/stockList');

    // Get F&O stock list
    let stocks = await fetchFOStockList(cookieJar || '');
    if (!stocks.length) {
      stocks = (cachedResults || []).slice(0, 120).map(s => ({
        symbol: s.symbol, ltp: s.ltp, change: s.change,
        openInterest: s.openInterest || 0, oiChange: s.oiChange || 0,
      }));
    }

    const results = [];
    const BATCH   = 8;
    const total   = stocks.length;

    for (let i = 0; i < stocks.length; i += BATCH) {
      const batch = stocks.slice(i, i + BATCH);
      broadcastFn({ type: 'dominance_progress', current: Math.min(i + BATCH, total), total,
        pct: Math.round(Math.min(i + BATCH, total) / total * 100) });

      const settled = await Promise.allSettled(batch.map(async stock => {
        const [orderBook, candles] = await Promise.all([
          fetchOrderBook(stock.symbol, cookieJar || ''),
          fetchStockCandles(stock.symbol).then(c => c?.['15m']).catch(() => null),
        ]);
        // Use Yahoo price if available
        const lastClose = candles?.slice(-1)[0]?.close;
        if (lastClose) stock.ltp = lastClose;

        return scoreDominance(stock, orderBook, candles);
      }));

      settled.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          const result = r.value;
          // Tag F&O availability
          result.isFO = FO_SYMBOLS.includes(result.symbol);
          results.push(result);
        }
      });
      await new Promise(r => setTimeout(r, 120));
    }

    // Sort: buyers first (highest domPct), then sellers
    cachedDominance  = results.sort((a, b) => b.domPct - a.domPct);
    dominanceUpdated = new Date().toISOString();
    broadcastFn({ type: 'dominance_update', data: cachedDominance, lastUpdated: dominanceUpdated });
    console.log(`[Dominance] Done. ${cachedDominance.length} stocks with 65%+ dominance.`);
  } catch (e) {
    console.error('[Dominance] Error:', e.message);
  } finally {
    isRunning = false;
  }
}

router.get('/', (req, res) =>
  res.json({ data: cachedDominance, lastUpdated: dominanceUpdated, total: cachedDominance.length })
);

router.post('/refresh', (req, res) => {
  const { cachedResults } = req.app.locals;
  res.json({ message: 'Dominance scan triggered' });
  runDominanceScan(cachedResults);
});

module.exports = { router, runDominanceScan, setBroadcast };
