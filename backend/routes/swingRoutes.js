const express  = require('express');
const router   = express.Router();
const { evaluateSwingSetup } = require('../analyzers/swingSetup');

let cachedSwing   = [];
let swingUpdated  = null;
let isSwingRunning = false;

// Shared broadcast function — injected from server
let broadcastFn = () => {};
function setBroadcast(fn) { broadcastFn = fn; }

async function runSwingScan(cachedResults) {
  if (isSwingRunning) return;
  isSwingRunning = true;
  try {
    broadcastFn({ type: 'swing_status', message: 'Running 2-3 day swing scan...' });

    const { fetchStockCandles } = require('../scrapers/foStockData');
    const { FO_SYMBOLS }        = require('../scrapers/stockList');

    // Use screener results + FO symbols
    const screenerSyms = (cachedResults || []).slice(0, 100).map(s => s.symbol);
    const symbols = [...new Set([...screenerSyms, ...FO_SYMBOLS.slice(0, 60)])];

    const results = [];
    const BATCH   = 6;

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      broadcastFn({ type: 'swing_progress', current: i + BATCH, total: symbols.length });

      const settled = await Promise.allSettled(batch.map(async sym => {
        const candles = await fetchStockCandles(sym);
        const stock   = (cachedResults || []).find(s => s.symbol === sym) || { symbol: sym };
        // Use 1h as 4H proxy, 1D as daily
        return evaluateSwingSetup(sym, candles?.['1h'], candles?.['1d'], stock);
      }));

      settled.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value); });
      await new Promise(r => setTimeout(r, 150));
    }

    cachedSwing  = results.sort((a, b) => b.passed - a.passed || b.score - a.score);
    swingUpdated = new Date().toISOString();
    broadcastFn({ type: 'swing_update', data: cachedSwing, lastUpdated: swingUpdated });
    console.log(`[Swing] Done. ${cachedSwing.length} setups found.`);
  } catch (e) {
    console.error('[Swing] Error:', e.message);
  } finally {
    isSwingRunning = false;
  }
}

router.get('/', (req, res) =>
  res.json({ data: cachedSwing, lastUpdated: swingUpdated, total: cachedSwing.length })
);

router.post('/refresh', (req, res) => {
  const { cachedResults } = req.app.locals;
  res.json({ message: 'Swing scan triggered' });
  runSwingScan(cachedResults);
});

module.exports = { router, runSwingScan, setBroadcast };
