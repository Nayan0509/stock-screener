require('dotenv').config();
const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const cors       = require('cors');
const cron       = require('node-cron');

const { fetchFullUniverse, fetchOIData, refreshCookies } = require('./scrapers/nseScraper');
const { fetchBatchCandles, candlesToStockSummary }        = require('./scrapers/historicalData');
const { rankStocks }                                      = require('./analyzers/screener');
const { scoreOrderFlow, fetchDeliveryData }               = require('./analyzers/orderFlow');
const swingRoutes                                         = require('./routes/swingRoutes');
const intradayPicksRoutes                                 = require('./routes/intradayPicksRoutes');
const dominanceRoutes                                     = require('./routes/dominanceRoutes');

let cachedOrderFlow = []; // separate cache for order flow section

// Inject broadcast into swing routes and share cachedResults
function setupSwingRoutes() {
  swingRoutes.setBroadcast(broadcast);
  intradayPicksRoutes.setBroadcast(broadcast);
  dominanceRoutes.setBroadcast(broadcast);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/swing', swingRoutes.router);
app.use('/api/picks',      intradayPicksRoutes.router);
app.use('/api/dominance', dominanceRoutes.router);

const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

let cachedResults  = [];
let lastUpdated    = null;
let isRefreshing   = false;
let marketMode     = 'historical';
let scanProgress   = { current: 0, total: 0, phase: '' };

function isMarketOpen() {
  const ist        = new Date(Date.now() + 5.5 * 3600 * 1000);
  const day        = ist.getUTCDay();
  const timeInMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && timeInMins >= 555 && timeInMins <= 930;
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function broadcastProgress(phase, current, total) {
  scanProgress = { phase, current, total };
  broadcast({ type: 'progress', phase, current, total,
    pct: total > 0 ? Math.round((current / total) * 100) : 0 });
}

// ── Fetch candles in parallel batches ────────────────────────────────────────
async function fetchCandlesParallel(symbols, concurrency = 5, delayMs = 150) {
  const result = {};
  const total  = symbols.length;
  let done     = 0;

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(sym => {
        const { fetchHistoricalCandles } = require('./scrapers/historicalData');
        return fetchHistoricalCandles(sym).then(c => ({ sym, c }));
      })
    );
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.c && r.value.c.length > 20) {
        result[r.value.sym] = r.value.c;
      }
    });
    done += batch.length;
    broadcastProgress('Fetching chart data', done, total);
    await new Promise(r => setTimeout(r, delayMs));
  }
  return result;
}

// ── LIVE MODE ─────────────────────────────────────────────────────────────────
async function runLiveScreener() {
  broadcastProgress('Fetching live market data', 0, 1);
  let stocks = [];
  try {
    stocks = await fetchFullUniverse();
    console.log(`[Live] Fetched ${stocks.length} stocks from NSE`);
  } catch (e) {
    console.error('[Live] NSE error:', e.message);
  }
  if (stocks.length === 0) return runHistoricalScreener();

  // Fetch candles for all stocks (for chart pattern analysis)
  const symbols   = stocks.map(s => s.symbol);
  const candleMap = await fetchCandlesParallel(symbols, 8, 100);

  broadcastProgress('Scoring stocks', 0, stocks.length);
  const ranked = rankStocks(stocks, candleMap);
  return { ranked, total: stocks.length, mode: 'live' };
}

// ── HISTORICAL MODE (after hours / weekends) ──────────────────────────────────
async function runHistoricalScreener() {
  broadcastProgress('Fetching NSE stock universe', 0, 1);
  let stocks = [];
  try {
    stocks = await fetchFullUniverse();
    console.log(`[Historical] Universe: ${stocks.length} stocks`);
  } catch (e) {
    console.error('[Historical] NSE universe error:', e.message);
  }

  // Fallback to hardcoded list if NSE is down
  if (stocks.length === 0) {
    const { FO_SYMBOLS } = require('./scrapers/stockList');
    stocks = FO_SYMBOLS.map(symbol => ({ symbol, ltp: 0, change: 0, volume: 0,
      openInterest: 0, oiChange: 0, high52: 0, low52: 0 }));
  }

  const symbols   = stocks.map(s => s.symbol);
  const candleMap = await fetchCandlesParallel(symbols, 6, 150);

  // Build accurate summaries from Yahoo candle data
  const enriched = stocks.map(s => {
    const candles = candleMap[s.symbol];
    if (candles && candles.length > 0) {
      const summary = candlesToStockSummary(s.symbol, candles);
      return { ...s, ...summary }; // Yahoo price overrides NSE stale price
    }
    return s;
  }).filter(s => s.ltp > 0);

  broadcastProgress('Scoring & ranking', 0, enriched.length);
  const ranked = rankStocks(enriched, candleMap);
  return { ranked, total: enriched.length, mode: 'historical' };
}

// ── MASTER RUNNER ─────────────────────────────────────────────────────────────
async function runScreener() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    console.log(`[Screener] Starting. Market open: ${isMarketOpen()}`);
    broadcast({ type: 'status', message: 'Scan started...' });

    const result = isMarketOpen()
      ? await runLiveScreener()
      : await runHistoricalScreener();

    cachedResults = result.ranked;
    lastUpdated   = new Date().toISOString();
    marketMode    = result.mode;

    broadcast({
      type: 'screener_update',
      data: cachedResults,
      lastUpdated,
      total: result.total,
      filtered: cachedResults.length,
      mode: result.mode,
    });
    console.log(`[Screener] Done. ${cachedResults.length} safe stocks from ${result.total} scanned.`);
    // Kick off order flow scan after screener finishes
    setTimeout(() => runOrderFlowScan(), 2000);
  } catch (e) {
    console.error('[Screener] Fatal:', e.message);
    broadcast({ type: 'error', message: e.message });
  } finally {
    isRefreshing = false;
    scanProgress = { current: 0, total: 0, phase: '' };
  }
}

// ── ORDER FLOW SCAN ───────────────────────────────────────────────────────────
let isOrderFlowRefreshing = false;

async function runOrderFlowScan(symbols) {
  if (isOrderFlowRefreshing) return;
  isOrderFlowRefreshing = true;
  try {
    broadcast({ type: 'orderflow_status', message: 'Fetching delivery & order flow data...' });

    // Use top 100 stocks from screener results (already have candles)
    const targets = (symbols || cachedResults.slice(0, 100).map(s => s.symbol));
    const { cookieJar } = require('./scrapers/nseScraper');

    const results = [];
    const CONCURRENCY = 5;

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async sym => {
          const stock   = cachedResults.find(s => s.symbol === sym) || { symbol: sym, ltp: 0, change: 0, openInterest: 0, oiChange: 0 };
          const candles = null; // candles already scored in screener
          const delivery = await fetchDeliveryData(sym, cookieJar || '');
          const orderBook = delivery ? { deliveryPct: delivery.deliveryPct, totalBuyQty: 0, totalSellQty: 0 } : null;

          // Get candles from Yahoo for volume imbalance
          const { fetchHistoricalCandles } = require('./scrapers/historicalData');
          const c = await fetchHistoricalCandles(sym);

          const flow = scoreOrderFlow(stock, c || [], orderBook);
          return { symbol: sym, ltp: stock.ltp, change: stock.change, ...flow, deliveryDate: delivery?.date };
        })
      );
      settled.forEach(r => { if (r.status === 'fulfilled') results.push(r.value); });
      broadcast({ type: 'orderflow_progress', current: Math.min(i + CONCURRENCY, targets.length), total: targets.length });
      await new Promise(r => setTimeout(r, 300));
    }

    cachedOrderFlow = results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    broadcast({ type: 'orderflow_update', data: cachedOrderFlow, lastUpdated: new Date().toISOString() });
    console.log(`[OrderFlow] Done. ${cachedOrderFlow.length} stocks analyzed.`);
  } catch (e) {
    console.error('[OrderFlow] Error:', e.message);
  } finally {
    isOrderFlowRefreshing = false;
  }
}

// ── REST API ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', lastUpdated, marketOpen: isMarketOpen(), mode: marketMode, progress: scanProgress })
);
app.get('/api/stocks', (req, res) => {
  const { action, minScore, limit } = req.query;
  let data = [...cachedResults];
  if (action)   data = data.filter(s => s.recommendation?.action === action);
  if (minScore) data = data.filter(s => s.scores?.composite >= parseInt(minScore));
  if (limit)    data = data.slice(0, parseInt(limit));
  res.json({ data, lastUpdated, total: cachedResults.length, mode: marketMode });
});
app.get('/api/stocks/top', (req, res) =>
  res.json({ data: cachedResults.slice(0, parseInt(req.query.limit) || 20), lastUpdated, mode: marketMode })
);
app.get('/api/stocks/:symbol', (req, res) => {
  const stock = cachedResults.find(s => s.symbol === req.params.symbol.toUpperCase());
  if (!stock) return res.status(404).json({ error: 'Not found' });
  res.json(stock);
});
app.get('/api/orderflow', (req, res) => {
  res.json({ data: cachedOrderFlow, lastUpdated, total: cachedOrderFlow.length });
});
app.post('/api/refresh', (req, res) => {
  res.json({ message: 'Refresh triggered' });
  runScreener();
});
app.post('/api/orderflow/refresh', (req, res) => {
  res.json({ message: 'Order flow scan triggered' });
  runOrderFlowScan();
});

// ── INTRADAY 15m API (new — no changes to existing routes) ───────────────────
let cachedIntraday   = [];
let intradayUpdated  = null;
let isIntradayRunning = false;

async function runIntraday15mScan() {
  if (isIntradayRunning) return;
  isIntradayRunning = true;
  try {
    broadcast({ type: 'intraday_status', message: 'Fetching 15m candles...' });
    const { fetchIntraday15mBatch } = require('./scrapers/intradayData');
    const { detect15mPatterns }     = require('./analyzers/intradayPatterns');

    // Use top screener symbols + F&O list
    const { FO_SYMBOLS } = require('./scrapers/stockList');
    const screenerSyms   = cachedResults.slice(0, 80).map(s => s.symbol);
    const symbols        = [...new Set([...screenerSyms, ...FO_SYMBOLS.slice(0, 40)])];

    const BATCH = 8;
    const results = [];
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch    = symbols.slice(i, i + BATCH);
      const candles  = await fetchIntraday15mBatch(batch, BATCH, 100);
      for (const sym of batch) {
        const c = candles[sym];
        if (!c || c.length < 20) continue;
        const analysis = detect15mPatterns(c);
        if (analysis.patternCount === 0) continue;
        const stock = cachedResults.find(s => s.symbol === sym) || {};
        results.push({
          symbol:       sym,
          ltp:          c[c.length - 1].close,
          change:       stock.change || 0,
          timeframe:    '15m',
          ...analysis,
        });
      }
      broadcast({ type: 'intraday_progress',
        current: Math.min(i + BATCH, symbols.length), total: symbols.length });
      await new Promise(r => setTimeout(r, 80));
    }

    cachedIntraday  = results.sort((a, b) => b.score - a.score);
    intradayUpdated = new Date().toISOString();
    broadcast({ type: 'intraday_update', data: cachedIntraday, lastUpdated: intradayUpdated });
    console.log(`[Intraday] Done. ${cachedIntraday.length} stocks with 15m patterns.`);
  } catch (e) {
    console.error('[Intraday] Error:', e.message);
  } finally {
    isIntradayRunning = false;
  }
}

app.get('/api/intraday', (req, res) =>
  res.json({ data: cachedIntraday, lastUpdated: intradayUpdated, total: cachedIntraday.length })
);
app.post('/api/intraday/refresh', (req, res) => {
  res.json({ message: 'Intraday scan triggered' });
  runIntraday15mScan();
});

// ── INDEX ANALYSIS (Nifty / Sensex / BankNifty) ───────────────────────────────
let cachedIndexData  = [];
let indexUpdated     = null;
let isIndexRunning   = false;

async function runIndexScan() {
  if (isIndexRunning) return;
  isIndexRunning = true;
  try {
    broadcast({ type: 'index_status', message: 'Fetching index data...' });
    const { INDICES, fetchAllTimeframes, fetchOptionChain } = require('./scrapers/indexData');
    const { analyzeIndex } = require('./analyzers/indexAnalyzer');
    const { cookieJar } = require('./scrapers/nseScraper');

    const results = [];
    const keys = Object.keys(INDICES);
    for (let i = 0; i < keys.length; i++) {
      const key  = keys[i];
      const meta = INDICES[key];
      broadcast({ type: 'index_progress', current: i + 1, total: keys.length, label: meta.label });
      try {
        const [tfs, oc] = await Promise.all([
          fetchAllTimeframes(meta.yahoo),
          fetchOptionChain(meta.nse, cookieJar || ''),
        ]);
        const analysis = analyzeIndex(key, tfs['15m'], tfs['1h'], tfs['1d'], oc);
        results.push(analysis);
      } catch (e) {
        console.error(`[Index] ${key} error:`, e.message);
      }
      await new Promise(r => setTimeout(r, 400));
    }

    cachedIndexData = results.sort((a, b) => b.composite - a.composite);
    indexUpdated    = new Date().toISOString();
    broadcast({ type: 'index_update', data: cachedIndexData, lastUpdated: indexUpdated });
    console.log(`[Index] Done. ${cachedIndexData.length} indices analyzed.`);
  } catch (e) {
    console.error('[Index] Error:', e.message);
  } finally {
    isIndexRunning = false;
  }
}

app.get('/api/indices', (req, res) =>
  res.json({ data: cachedIndexData, lastUpdated: indexUpdated })
);
app.post('/api/indices/refresh', (req, res) => {
  res.json({ message: 'Index scan triggered' });
  runIndexScan();
});

// ── OPTION SIGNALS (CE/PE Buy) ────────────────────────────────────────────────
let cachedOptionSignals = [];
let optionSignalsUpdated = null;
let isOptionScanRunning  = false;

async function runOptionSignalScan() {
  if (isOptionScanRunning) return;
  isOptionScanRunning = true;
  try {
    broadcast({ type: 'options_status', message: 'Analyzing CE/PE signals...' });
    const { INDICES, fetchAllTimeframes, fetchOptionChain } = require('./scrapers/indexData');
    const { generateOptionSignals } = require('./analyzers/optionSignals');
    const { cookieJar } = require('./scrapers/nseScraper');

    const allSignals = [];
    for (const [key, meta] of Object.entries(INDICES)) {
      try {
        const [tfs, oc] = await Promise.all([
          fetchAllTimeframes(meta.yahoo),
          fetchOptionChain(meta.nse, cookieJar || ''),
        ]);
        const spot = tfs['15m']?.slice(-1)[0]?.close || tfs['1d']?.slice(-1)[0]?.close || 0;
        const signals = generateOptionSignals(key, spot, tfs['15m'], tfs['1h'], tfs['1d'], oc, meta);
        allSignals.push(...signals);
      } catch (e) {
        console.error(`[Options] ${key}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 400));
    }

    cachedOptionSignals  = allSignals.sort((a, b) => b.confidence - a.confidence);
    optionSignalsUpdated = new Date().toISOString();
    broadcast({ type: 'options_update', data: cachedOptionSignals, lastUpdated: optionSignalsUpdated });
    console.log(`[Options] Done. ${cachedOptionSignals.length} CE/PE signals.`);
  } catch (e) {
    console.error('[Options] Error:', e.message);
  } finally {
    isOptionScanRunning = false;
  }
}

app.get('/api/options', (req, res) =>
  res.json({ data: cachedOptionSignals, lastUpdated: optionSignalsUpdated })
);
app.post('/api/options/refresh', (req, res) => {
  res.json({ message: 'Option signal scan triggered' });
  runOptionSignalScan();
});

// Run option scan every 5 min during market hours
cron.schedule('*/5 9-15 * * 1-5', () => {
  if (isMarketOpen()) runOptionSignalScan();
}, { timezone: 'Asia/Kolkata' });

// ── F&O STOCK CE/PE SIGNALS ───────────────────────────────────────────────────
let cachedFOSignals   = [];
let foSignalsUpdated  = null;
let isFOScanRunning   = false;

async function runFOStockScan() {
  if (isFOScanRunning) return;
  isFOScanRunning = true;
  try {
    broadcast({ type: 'fo_status', message: 'Scanning F&O stocks for CE/PE signals...' });
    const { fetchFOStockList, fetchStockOptionChain, fetchDelivery, fetchStockCandles } = require('./scrapers/foStockData');
    const { generateFOSignal } = require('./analyzers/foStockSignals');
    const { cookieJar } = require('./scrapers/nseScraper');

    // Get F&O stock list
    let stocks = await fetchFOStockList(cookieJar || '');
    if (!stocks.length) {
      // Fallback: use cached screener results that are F&O eligible
      stocks = cachedResults.slice(0, 100).map(s => ({
        symbol: s.symbol, ltp: s.ltp, change: s.change,
        volume: s.volume, openInterest: s.openInterest || 0,
        oiChange: s.oiChange || 0, yearHigh: s.high52 || 0, yearLow: s.low52 || 0,
        avgVolume: s.avgVolume || s.volume * 0.7,
      }));
    }

    // Sort by OI change + volume to prioritize most active
    stocks.sort((a, b) => Math.abs(b.oiChange||0) - Math.abs(a.oiChange||0));
    const targets = stocks.slice(0, 80); // scan top 80 most active

    const allSignals = [];
    const BATCH = 5;

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      broadcast({ type: 'fo_progress', current: i + BATCH, total: targets.length });

      const settled = await Promise.allSettled(batch.map(async stock => {
        const [candles, oc, delivery] = await Promise.all([
          fetchStockCandles(stock.symbol),
          fetchStockOptionChain(stock.symbol, cookieJar || ''),
          fetchDelivery(stock.symbol, cookieJar || ''),
        ]);
        // Use Yahoo close as accurate price
        const lastClose = candles?.['1d']?.slice(-1)[0]?.close;
        if (lastClose) stock.ltp = lastClose;

        const signals = generateFOSignal(stock, candles?.['15m'], candles?.['1h'], candles?.['1d'], oc, delivery);
        return signals;
      }));

      settled.forEach(r => {
        if (r.status === 'fulfilled' && r.value) allSignals.push(...r.value);
      });
      await new Promise(r => setTimeout(r, 200));
    }

    cachedFOSignals  = allSignals.sort((a, b) => b.confidence - a.confidence);
    foSignalsUpdated = new Date().toISOString();
    broadcast({ type: 'fo_update', data: cachedFOSignals, lastUpdated: foSignalsUpdated });
    console.log(`[FO] Done. ${cachedFOSignals.length} CE/PE signals from ${targets.length} stocks.`);
  } catch (e) {
    console.error('[FO] Error:', e.message);
  } finally {
    isFOScanRunning = false;
  }
}

app.get('/api/fo-signals', (req, res) =>
  res.json({ data: cachedFOSignals, lastUpdated: foSignalsUpdated, total: cachedFOSignals.length })
);
app.post('/api/fo-signals/refresh', (req, res) => {
  res.json({ message: 'F&O scan triggered' });
  runFOStockScan();
});

// Every 10 min during market hours; EOD scan
cron.schedule('*/10 9-15 * * 1-5', () => { if (isMarketOpen()) runFOStockScan(); }, { timezone: 'Asia/Kolkata' });
cron.schedule('15 16 * * 1-5',     () => runFOStockScan(), { timezone: 'Asia/Kolkata' });

// Swing scan: EOD + weekend (2-3 day setups don't need intraday refresh)
cron.schedule('30 16 * * 1-5', () => swingRoutes.runSwingScan(cachedResults), { timezone: 'Asia/Kolkata' });
cron.schedule('0 9  * * 1-5', () => swingRoutes.runSwingScan(cachedResults),  { timezone: 'Asia/Kolkata' });
cron.schedule('0 10 * * 6',   () => swingRoutes.runSwingScan(cachedResults),  { timezone: 'Asia/Kolkata' });

// 15m intraday: every 15 min during market hours (live candles)
cron.schedule('*/15 9-15 * * 1-5', () => runIntraday15mScan(), { timezone: 'Asia/Kolkata' });
// After market close: refresh once at 4 PM to capture final candles
cron.schedule('5 16 * * 1-5', () => runIntraday15mScan(), { timezone: 'Asia/Kolkata' });
// Weekend: refresh Saturday 10 AM so last week's 15m data is ready
cron.schedule('0 10 * * 6', () => runIntraday15mScan(), { timezone: 'Asia/Kolkata' });

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  if (cachedResults.length > 0) {
    ws.send(JSON.stringify({ type: 'screener_update', data: cachedResults, lastUpdated, mode: marketMode }));
    if (cachedOrderFlow.length > 0) {
      ws.send(JSON.stringify({ type: 'orderflow_update', data: cachedOrderFlow, lastUpdated }));
    }
    if (cachedIntraday.length > 0) {
      ws.send(JSON.stringify({ type: 'intraday_update', data: cachedIntraday, lastUpdated: intradayUpdated }));
    }
    if (cachedIndexData.length > 0) {
      ws.send(JSON.stringify({ type: 'index_update', data: cachedIndexData, lastUpdated: indexUpdated }));
    }
    if (cachedOptionSignals.length > 0) {
      ws.send(JSON.stringify({ type: 'options_update', data: cachedOptionSignals, lastUpdated: optionSignalsUpdated }));
    }
    if (cachedFOSignals.length > 0) {
      ws.send(JSON.stringify({ type: 'fo_update', data: cachedFOSignals, lastUpdated: foSignalsUpdated }));
    }
    // Swing data is served via REST /api/swing — client fetches on tab open
  } else if (scanProgress.total > 0) {
    ws.send(JSON.stringify({ type: 'progress', ...scanProgress }));
  } else {
    ws.send(JSON.stringify({ type: 'status', message: 'Initial scan starting...' }));
  }
  ws.on('message', msg => {
    try { if (JSON.parse(msg).action === 'refresh') runScreener(); } catch {}
  });
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// Index scan: every 15 min during market hours, EOD, and startup
cron.schedule('*/15 9-15 * * 1-5', () => runIndexScan(), { timezone: 'Asia/Kolkata' });
cron.schedule('10 16 * * 1-5',     () => runIndexScan(), { timezone: 'Asia/Kolkata' });
cron.schedule('*/3 * * * 1-5',  () => { if (isMarketOpen()) runScreener(); }, { timezone: 'Asia/Kolkata' });
cron.schedule('0 16 * * 1-5',   () => runScreener(), { timezone: 'Asia/Kolkata' }); // EOD
cron.schedule('0 10 * * 6',     () => runScreener(), { timezone: 'Asia/Kolkata' }); // Saturday

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`[Server] http://localhost:${PORT}`);
  setupSwingRoutes();
  app.locals.cachedResults = cachedResults; // share with routes
  await refreshCookies();
  runScreener();
  setTimeout(() => runIntraday15mScan(), 5000);
  setTimeout(() => runIndexScan(), 8000);
  setTimeout(() => runOptionSignalScan(), 12000);
  setTimeout(() => runFOStockScan(), 16000);
  setTimeout(() => {
    app.locals.cachedResults = cachedResults;
    swingRoutes.runSwingScan(cachedResults);
    intradayPicksRoutes.runIntradayPicksScan(cachedResults, 100000);
  }, 20000);
  setTimeout(() => dominanceRoutes.runDominanceScan(cachedResults), 25000);
  // Refresh picks every 15 min during market hours
  cron.schedule('*/15 9-15 * * 1-5', () => {
    if (isMarketOpen()) intradayPicksRoutes.runIntradayPicksScan(cachedResults, 100000);
  }, { timezone: 'Asia/Kolkata' });
  // Dominance scan every 5 min during market hours (order book changes fast)
  cron.schedule('*/5 9-15 * * 1-5', () => {
    if (isMarketOpen()) dominanceRoutes.runDominanceScan(cachedResults);
  }, { timezone: 'Asia/Kolkata' });
});
