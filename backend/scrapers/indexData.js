const axios = require('axios');

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/option-chain',
};

// Index definitions
const INDICES = {
  NIFTY50:   { yahoo: '^NSEI',    nse: 'NIFTY',     label: 'Nifty 50',    strikeGap: 50,   lotSize: 75  },
  SENSEX:    { yahoo: '^BSESN',   nse: 'SENSEX',    label: 'Sensex',      strikeGap: 100,  lotSize: 10  },
  BANKNIFTY: { yahoo: '^NSEBANK', nse: 'BANKNIFTY', label: 'Bank Nifty',  strikeGap: 100,  lotSize: 30  },
  FINNIFTY:  { yahoo: '^CNXFIN',  nse: 'FINNIFTY',  label: 'Fin Nifty',   strikeGap: 50,   lotSize: 40  },
  MIDCPNIFTY:{ yahoo: '^NSEMDCP50',nse:'MIDCPNIFTY',label: 'Midcap Nifty',strikeGap: 25,   lotSize: 75  },
};

// Fetch OHLCV candles for an index from Yahoo Finance
async function fetchIndexCandles(yahooSymbol, interval = '15m', range = '5d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
  try {
    const res    = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 12000 });
    const result = res.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    if (timestamps.length < 5) return null;

    return timestamps.map((ts, i) => ({
      ts,
      time:   new Date(ts * 1000).toISOString(),
      open:   parseFloat((quote.open?.[i]  || 0).toFixed(2)),
      high:   parseFloat((quote.high?.[i]  || 0).toFixed(2)),
      low:    parseFloat((quote.low?.[i]   || 0).toFixed(2)),
      close:  parseFloat((quote.close?.[i] || 0).toFixed(2)),
      volume: parseInt(quote.volume?.[i]   || 0, 10),
    })).filter(c => c.close > 0);
  } catch {
    return null;
  }
}

// Fetch all timeframes for an index
async function fetchAllTimeframes(yahooSymbol) {
  const [tf15m, tf1h, tf1d] = await Promise.all([
    fetchIndexCandles(yahooSymbol, '15m', '5d'),
    fetchIndexCandles(yahooSymbol, '1h',  '60d'),
    fetchIndexCandles(yahooSymbol, '1d',  '1y'),
  ]);
  return { '15m': tf15m, '1h': tf1h, '1d': tf1d };
}

// Fetch NSE option chain (live during market hours, empty after)
async function fetchOptionChain(nseSymbol, cookieJar = '') {
  try {
    const res = await axios.get(
      `https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`,
      { headers: { ...NSE_HEADERS, Cookie: cookieJar }, timeout: 12000 }
    );
    const records = res.data?.records;
    if (!records?.data?.length) return null;

    const spot    = records.underlyingValue;
    const expiries = records.expiryDates || [];
    const data    = records.data || [];

    // Get nearest expiry data
    const nearExpiry = expiries[0];
    const chainData  = data.filter(d => d.expiryDate === nearExpiry);

    // Build strike map
    const strikes = [...new Set(chainData.map(d => d.strikePrice))].sort((a, b) => a - b);
    const atmIdx  = strikes.findIndex(s => s >= spot);
    const atmStrike = strikes[atmIdx] || spot;

    // Get 10 strikes around ATM
    const nearStrikes = strikes.slice(Math.max(0, atmIdx - 5), atmIdx + 6);

    const strikeMap = {};
    chainData.forEach(d => {
      if (!nearStrikes.includes(d.strikePrice)) return;
      strikeMap[d.strikePrice] = {
        strike: d.strikePrice,
        CE: d.CE ? {
          oi:       d.CE.openInterest || 0,
          oiChange: d.CE.changeinOpenInterest || 0,
          ltp:      d.CE.lastPrice || 0,
          iv:       d.CE.impliedVolatility || 0,
          volume:   d.CE.totalTradedVolume || 0,
          bid:      d.CE.bidprice || 0,
          ask:      d.CE.askPrice || 0,
        } : null,
        PE: d.PE ? {
          oi:       d.PE.openInterest || 0,
          oiChange: d.PE.changeinOpenInterest || 0,
          ltp:      d.PE.lastPrice || 0,
          iv:       d.PE.impliedVolatility || 0,
          volume:   d.PE.totalTradedVolume || 0,
          bid:      d.PE.bidprice || 0,
          ask:      d.PE.askPrice || 0,
        } : null,
      };
    });

    // Max pain calculation
    const maxPain = calcMaxPain(chainData, strikes);

    // PCR (Put-Call Ratio)
    const totalCEOI = chainData.reduce((s, d) => s + (d.CE?.openInterest || 0), 0);
    const totalPEOI = chainData.reduce((s, d) => s + (d.PE?.openInterest || 0), 0);
    const pcr = totalCEOI > 0 ? parseFloat((totalPEOI / totalCEOI).toFixed(3)) : null;

    // Key support/resistance from OI walls
    const ceWall = findOIWall(chainData, 'CE'); // resistance
    const peWall = findOIWall(chainData, 'PE'); // support

    return {
      spot, expiry: nearExpiry, expiries: expiries.slice(0, 4),
      atmStrike, nearStrikes, strikeMap,
      pcr, maxPain, ceWall, peWall,
      totalCEOI, totalPEOI,
    };
  } catch {
    return null;
  }
}

function calcMaxPain(data, strikes) {
  let minLoss = Infinity, maxPainStrike = null;
  for (const strike of strikes) {
    let totalLoss = 0;
    data.forEach(d => {
      if (d.CE?.openInterest) totalLoss += Math.max(0, d.strikePrice - strike) * d.CE.openInterest;
      if (d.PE?.openInterest) totalLoss += Math.max(0, strike - d.strikePrice) * d.PE.openInterest;
    });
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = strike; }
  }
  return maxPainStrike;
}

function findOIWall(data, type) {
  let maxOI = 0, wallStrike = null;
  data.forEach(d => {
    const oi = d[type]?.openInterest || 0;
    if (oi > maxOI) { maxOI = oi; wallStrike = d.strikePrice; }
  });
  return { strike: wallStrike, oi: maxOI };
}

module.exports = { INDICES, fetchAllTimeframes, fetchIndexCandles, fetchOptionChain };
