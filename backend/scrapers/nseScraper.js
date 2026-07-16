const axios = require('axios');

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
  'Connection': 'keep-alive',
};

let cookieJar = '';
let cookieTime = 0;

async function refreshCookies() {
  try {
    const res = await axios.get('https://www.nseindia.com', { headers: NSE_HEADERS, timeout: 10000 });
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      cookieJar = cookies.map(c => c.split(';')[0]).join('; ');
      cookieTime = Date.now();
    }
  } catch (e) {
    console.error('Cookie refresh failed:', e.message);
  }
}

async function nseGet(url) {
  // Refresh cookies every 8 minutes
  if (!cookieJar || Date.now() - cookieTime > 8 * 60 * 1000) await refreshCookies();
  try {
    const res = await axios.get(url, { headers: { ...NSE_HEADERS, Cookie: cookieJar }, timeout: 15000 });
    return res.data;
  } catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      await refreshCookies();
      const res = await axios.get(url, { headers: { ...NSE_HEADERS, Cookie: cookieJar }, timeout: 15000 });
      return res.data;
    }
    throw e;
  }
}

function mapStock(s) {
  return {
    symbol:        s.symbol,
    ltp:           s.lastPrice,
    change:        s.pChange,
    volume:        s.totalTradedVolume,
    openInterest:  s.openInterest || 0,
    oiChange:      s.changeinOpenInterest || 0,
    high52:        s['52WeekHigh'] || s.yearHigh || 0,
    low52:         s['52WeekLow']  || s.yearLow  || 0,
    marketCap:     s.ffmc || 0,
  };
}

// Full NSE universe: NIFTY TOTAL MARKET (750 stocks) + F&O (213) merged
async function fetchFullUniverse() {
  const indices = [
    'NIFTY TOTAL MARKET',
    'SECURITIES IN F%26O',   // F&O stocks have OI data
    'NIFTY MICROCAP 250',
  ];

  const symbolMap = {};

  for (const idx of indices) {
    try {
      const data = await nseGet(`https://www.nseindia.com/api/equity-stockIndices?index=${idx}`);
      (data?.data || []).forEach(s => {
        if (!s.symbol || s.symbol === idx) return;
        const mapped = mapStock(s);
        // Merge: F&O data has OI, keep it
        if (!symbolMap[s.symbol]) symbolMap[s.symbol] = mapped;
        else symbolMap[s.symbol] = { ...symbolMap[s.symbol], ...mapped };
      });
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`[NSE] Failed to fetch ${idx}:`, e.message);
    }
  }

  return Object.values(symbolMap).filter(s => s.ltp > 0);
}

async function fetchOIData() {
  const data = await nseGet('https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O');
  return (data?.data || []).filter(s => s.symbol).map(mapStock);
}

async function fetchNifty500() {
  const data = await nseGet('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500');
  return (data?.data || []).filter(s => s.symbol).map(mapStock);
}

module.exports = { fetchFullUniverse, fetchOIData, fetchNifty500, refreshCookies, get cookieJar() { return cookieJar; } };
