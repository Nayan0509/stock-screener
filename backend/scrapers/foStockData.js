const axios = require('axios');

const NSE_H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/',
};
const YAHOO_H = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

// Fetch F&O stock list with OI data from NSE
async function fetchFOStockList(cookieJar) {
  try {
    const r = await axios.get(
      'https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O',
      { headers: { ...NSE_H, Cookie: cookieJar }, timeout: 12000 }
    );
    return (r.data?.data || [])
      .filter(s => s.symbol && s.lastPrice > 0)
      .map(s => ({
        symbol:        s.symbol,
        ltp:           parseFloat(s.lastPrice),
        change:        s.pChange || 0,
        volume:        s.totalTradedVolume || 0,
        openInterest:  s.openInterest || 0,
        oiChange:      s.changeinOpenInterest || 0,
        yearHigh:      parseFloat(s.yearHigh) || 0,
        yearLow:       parseFloat(s.yearLow)  || 0,
        industry:      s.meta?.industry || '',
      }));
  } catch { return []; }
}

// Fetch option chain for a stock (live during market hours)
async function fetchStockOptionChain(symbol, cookieJar) {
  try {
    const r = await axios.get(
      `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`,
      { headers: { ...NSE_H, Cookie: cookieJar }, timeout: 10000 }
    );
    const rec = r.data?.records;
    if (!rec?.data?.length || !rec.underlyingValue) return null;

    const spot     = rec.underlyingValue;
    const expiries = rec.expiryDates || [];
    const data     = rec.data.filter(d => d.expiryDate === expiries[0]);
    const strikes  = [...new Set(data.map(d => d.strikePrice))].sort((a,b)=>a-b);
    const atmIdx   = strikes.findIndex(s => s >= spot);
    const atm      = strikes[atmIdx] || spot;
    const near     = strikes.slice(Math.max(0, atmIdx-4), atmIdx+5);

    const strikeMap = {};
    data.forEach(d => {
      if (!near.includes(d.strikePrice)) return;
      strikeMap[d.strikePrice] = {
        CE: d.CE ? { ltp: d.CE.lastPrice||0, oi: d.CE.openInterest||0, oiChange: d.CE.changeinOpenInterest||0, iv: d.CE.impliedVolatility||0, volume: d.CE.totalTradedVolume||0 } : null,
        PE: d.PE ? { ltp: d.PE.lastPrice||0, oi: d.PE.openInterest||0, oiChange: d.PE.changeinOpenInterest||0, iv: d.PE.impliedVolatility||0, volume: d.PE.totalTradedVolume||0 } : null,
      };
    });

    const totalCEOI = data.reduce((s,d) => s+(d.CE?.openInterest||0), 0);
    const totalPEOI = data.reduce((s,d) => s+(d.PE?.openInterest||0), 0);
    const pcr = totalCEOI > 0 ? parseFloat((totalPEOI/totalCEOI).toFixed(3)) : null;

    // Max OI walls
    let ceWall = { strike: null, oi: 0 }, peWall = { strike: null, oi: 0 };
    data.forEach(d => {
      if ((d.CE?.openInterest||0) > ceWall.oi) ceWall = { strike: d.strikePrice, oi: d.CE.openInterest };
      if ((d.PE?.openInterest||0) > peWall.oi) peWall = { strike: d.strikePrice, oi: d.PE.openInterest };
    });

    return { spot, expiry: expiries[0], atmStrike: atm, nearStrikes: near, strikeMap, pcr, ceWall, peWall };
  } catch { return null; }
}

// Fetch delivery % for a stock
async function fetchDelivery(symbol, cookieJar) {
  try {
    const r = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}&section=trade_info`,
      { headers: { ...NSE_H, Cookie: cookieJar }, timeout: 8000 }
    );
    return r.data?.securityWiseDP?.deliveryToTradedQuantity || null;
  } catch { return null; }
}

// Fetch 15m + 1h + 1D candles from Yahoo Finance
async function fetchStockCandles(symbol) {
  const ySym = `${symbol}.NS`;
  const fetch = async (interval, range) => {
    try {
      const r = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?interval=${interval}&range=${range}`,
        { headers: YAHOO_H, timeout: 12000 }
      );
      const res = r.data?.chart?.result?.[0];
      if (!res?.timestamp?.length) return null;
      const q = res.indicators?.quote?.[0] || {};
      return res.timestamp.map((ts, i) => ({
        time:   new Date(ts*1000).toISOString(),
        open:   parseFloat((q.open?.[i]  ||0).toFixed(2)),
        high:   parseFloat((q.high?.[i]  ||0).toFixed(2)),
        low:    parseFloat((q.low?.[i]   ||0).toFixed(2)),
        close:  parseFloat((q.close?.[i] ||0).toFixed(2)),
        volume: parseInt(q.volume?.[i]   ||0, 10),
      })).filter(c => c.close > 0);
    } catch { return null; }
  };

  const [c15m, c1h, c1d] = await Promise.all([
    fetch('15m', '5d'),
    fetch('1h',  '60d'),
    fetch('1d',  '1y'),
  ]);
  return { '15m': c15m, '1h': c1h, '1d': c1d };
}

module.exports = { fetchFOStockList, fetchStockOptionChain, fetchDelivery, fetchStockCandles };
