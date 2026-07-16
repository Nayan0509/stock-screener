const axios = require('axios');

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

/**
 * Fetch 15-minute candles from Yahoo Finance
 * Returns last 5 days of 15m OHLCV for NSE stocks
 */
async function fetch15mCandles(symbol) {
  const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=15m&range=5d`;

  try {
    const res    = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 12000 });
    const result = res.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    if (timestamps.length < 10) return null;

    return timestamps.map((ts, i) => ({
      ts:     ts,
      time:   new Date(ts * 1000).toISOString(),
      open:   parseFloat((quote.open?.[i]  || 0).toFixed(2)),
      high:   parseFloat((quote.high?.[i]  || 0).toFixed(2)),
      low:    parseFloat((quote.low?.[i]   || 0).toFixed(2)),
      close:  parseFloat((quote.close?.[i] || 0).toFixed(2)),
      volume: parseInt(quote.volume?.[i]   || 0, 10),
    })).filter(c => c.close > 0 && c.high > 0);
  } catch {
    return null;
  }
}

/**
 * Fetch 15m candles for a batch of symbols with concurrency control
 */
async function fetchIntraday15mBatch(symbols, concurrency = 6, delayMs = 120) {
  const result = {};
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(sym => fetch15mCandles(sym).then(c => ({ sym, c })))
    );
    settled.forEach(r => {
      if (r.status === 'fulfilled' && r.value.c?.length >= 20) {
        result[r.value.sym] = r.value.c;
      }
    });
    await new Promise(r => setTimeout(r, delayMs));
  }
  return result;
}

module.exports = { fetch15mCandles, fetchIntraday15mBatch };
