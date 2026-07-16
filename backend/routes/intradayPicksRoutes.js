const express = require('express');
const router  = express.Router();
const { evaluateIntradayPick, buildDailyPlan } = require('../analyzers/intradayPicks');

let cachedPicks   = null; // { trades, plan, lastUpdated }
let isRunning     = false;
let broadcastFn   = () => {};

function setBroadcast(fn) { broadcastFn = fn; }

async function runIntradayPicksScan(cachedResults, capital = 100000) {
  if (isRunning) return;
  isRunning = true;
  try {
    broadcastFn({ type: 'picks_status', message: 'Scanning for high-confidence intraday picks...' });

    const { fetchStockCandles, fetchDelivery } = require('../scrapers/foStockData');
    const { FO_SYMBOLS } = require('../scrapers/stockList');

    // Prioritize: screener top picks + high OI change stocks
    const screenerSyms = (cachedResults || [])
      .filter(s => s.scores?.composite >= 60)
      .slice(0, 60)
      .map(s => s.symbol);
    const symbols = [...new Set([...screenerSyms, ...FO_SYMBOLS.slice(0, 40)])];

    const allPicks = [];
    const BATCH    = 5;

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      broadcastFn({ type: 'picks_progress', current: i + BATCH, total: symbols.length });

      const settled = await Promise.allSettled(batch.map(async sym => {
        const stock = (cachedResults || []).find(s => s.symbol === sym) || { symbol: sym, ltp: 0, change: 0 };
        const [candles, delivery] = await Promise.all([
          fetchStockCandles(sym),
          fetchDelivery(sym, ''),
        ]);
        // Use Yahoo accurate price
        const lastClose = candles?.['1d']?.slice(-1)[0]?.close;
        if (lastClose) stock.ltp = lastClose;

        return evaluateIntradayPick(stock, candles?.['15m'], candles?.['1d'], delivery, capital);
      }));

      settled.forEach(r => { if (r.status === 'fulfilled' && r.value) allPicks.push(r.value); });
      await new Promise(r => setTimeout(r, 150));
    }

    const sorted = allPicks.sort((a, b) => b.score - a.score);
    const plan   = buildDailyPlan(sorted, capital);

    cachedPicks = { picks: sorted, plan, lastUpdated: new Date().toISOString() };
    broadcastFn({ type: 'picks_update', data: cachedPicks });
    console.log(`[Picks] Done. ${sorted.length} high-confidence picks. Top 3 in plan.`);
  } catch (e) {
    console.error('[Picks] Error:', e.message);
  } finally {
    isRunning = false;
  }
}

router.get('/', (req, res) => {
  const capital = parseInt(req.query.capital) || 100000;
  if (!cachedPicks) return res.json({ picks: [], plan: null, lastUpdated: null });
  res.json(cachedPicks);
});

router.post('/refresh', (req, res) => {
  const capital = parseInt(req.body?.capital) || 100000;
  const { cachedResults } = req.app.locals;
  res.json({ message: 'Intraday picks scan triggered' });
  runIntradayPicksScan(cachedResults, capital);
});

module.exports = { router, runIntradayPicksScan, setBroadcast };
