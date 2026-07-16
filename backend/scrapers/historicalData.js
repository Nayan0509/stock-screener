const axios = require('axios');

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

/**
 * Fetch 1-year daily OHLCV from Yahoo Finance (free, no auth, accurate prices)
 * Symbol format: INFY.NS, RELIANCE.NS etc.
 */
async function fetchHistoricalCandles(symbol) {
  const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1y`;

  try {
    const res = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 15000 });
    const result = res.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    const adjClose   = result.indicators?.adjclose?.[0]?.adjclose || [];

    if (timestamps.length === 0) return null;

    const candles = timestamps.map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().split('T')[0],
      open:   parseFloat((quote.open?.[i]  || 0).toFixed(2)),
      high:   parseFloat((quote.high?.[i]  || 0).toFixed(2)),
      low:    parseFloat((quote.low?.[i]   || 0).toFixed(2)),
      close:  parseFloat((adjClose[i] || quote.close?.[i] || 0).toFixed(2)),
      volume: parseInt(quote.volume?.[i]   || 0, 10),
    })).filter(c => c.close > 0 && c.high > 0);

    return candles.length >= 10 ? candles : null;
  } catch (e) {
    // Try v7 endpoint as fallback
    try {
      return await fetchYahooV7(yahooSymbol);
    } catch {
      return null;
    }
  }
}

async function fetchYahooV7(yahooSymbol) {
  const now   = Math.floor(Date.now() / 1000);
  const year  = now - 365 * 24 * 3600;
  const url   = `https://query2.finance.yahoo.com/v7/finance/download/${yahooSymbol}?period1=${year}&period2=${now}&interval=1d&events=history`;

  const res = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 15000, responseType: 'text' });
  const lines = res.data.trim().split('\n');
  // Header: Date,Open,High,Low,Close,Adj Close,Volume
  return lines.slice(1).map(line => {
    const [date, open, high, low, close, adjClose, volume] = line.split(',');
    return {
      date,
      open:   parseFloat(open),
      high:   parseFloat(high),
      low:    parseFloat(low),
      close:  parseFloat(adjClose || close), // prefer adj close
      volume: parseInt(volume, 10),
    };
  }).filter(c => c.close > 0 && !isNaN(c.close));
}

/**
 * Fetch batch with rate limiting — Yahoo allows ~2000 req/hour freely
 */
async function fetchBatchCandles(symbols, delayMs = 200) {
  const result = {};
  for (const sym of symbols) {
    const candles = await fetchHistoricalCandles(sym);
    if (candles && candles.length > 20) {
      result[sym] = candles;
    } else {
      console.log(`[History] No data for ${sym}`);
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return result;
}

/**
 * Build stock summary from candle history — used in after-hours mode
 */
function candlesToStockSummary(symbol, candles) {
  if (!candles || candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);

  // 20-day avg volume excluding today
  const avgVolume = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const change    = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

  return {
    symbol,
    ltp:           last.close,
    change:        parseFloat(change.toFixed(2)),
    volume:        last.volume,
    avgVolume:     Math.round(avgVolume),
    high52:        parseFloat(Math.max(...highs.slice(-252)).toFixed(2)),
    low52:         parseFloat(Math.min(...lows.slice(-252)).toFixed(2)),
    openInterest:  0,
    oiChange:      0,
    lastTradeDate: last.date,
  };
}

module.exports = { fetchHistoricalCandles, fetchBatchCandles, candlesToStockSummary };
