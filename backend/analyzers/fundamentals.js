const axios = require('axios');

/**
 * Fetch fundamentals from multiple free sources
 * Primary: NSE + Screener.in (public data)
 */

async function fetchFundamentals(symbol) {
  try {
    // Try screener.in for fundamentals
    const res = await axios.get(`https://www.screener.in/api/company/search/?q=${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 8000,
    });
    const companies = res.data;
    if (companies && companies.length > 0) {
      const slug = companies[0].url;
      return await fetchScreenerData(slug);
    }
  } catch (e) {
    // fallback to mock scoring
  }
  return generateFundamentalScore(symbol);
}

async function fetchScreenerData(slug) {
  try {
    const res = await axios.get(`https://www.screener.in${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    // Parse key ratios from HTML (simplified)
    const html = res.data;
    const pe = extractNumber(html, /P\/E<\/td>\s*<td[^>]*>([\d.]+)/);
    const roe = extractNumber(html, /ROE<\/td>\s*<td[^>]*>([\d.]+)/);
    const debtEquity = extractNumber(html, /Debt to equity<\/td>\s*<td[^>]*>([\d.]+)/);
    const eps = extractNumber(html, /EPS<\/td>\s*<td[^>]*>([\d.]+)/);
    const salesGrowth = extractNumber(html, /Sales growth<\/td>\s*<td[^>]*>([\d.]+)/);
    const profitGrowth = extractNumber(html, /Profit growth<\/td>\s*<td[^>]*>([\d.]+)/);

    return scoreFundamentals({ pe, roe, debtEquity, eps, salesGrowth, profitGrowth });
  } catch (e) {
    return generateFundamentalScore();
  }
}

function extractNumber(html, regex) {
  const match = html.match(regex);
  return match ? parseFloat(match[1]) : null;
}

function scoreFundamentals(data) {
  let score = 0;
  const reasons = [];

  // PE ratio (lower is better, but not too low)
  if (data.pe && data.pe > 0 && data.pe < 25) { score += 20; reasons.push(`PE: ${data.pe} (attractive)`); }
  else if (data.pe && data.pe < 40) { score += 10; reasons.push(`PE: ${data.pe} (fair)`); }

  // ROE (higher is better, >15% is good)
  if (data.roe && data.roe > 20) { score += 25; reasons.push(`ROE: ${data.roe}% (excellent)`); }
  else if (data.roe && data.roe > 15) { score += 15; reasons.push(`ROE: ${data.roe}% (good)`); }

  // Debt to equity (lower is better)
  if (data.debtEquity !== null && data.debtEquity < 0.5) { score += 20; reasons.push(`D/E: ${data.debtEquity} (low debt)`); }
  else if (data.debtEquity !== null && data.debtEquity < 1) { score += 10; reasons.push(`D/E: ${data.debtEquity} (manageable)`); }

  // Sales growth
  if (data.salesGrowth && data.salesGrowth > 15) { score += 15; reasons.push(`Sales Growth: ${data.salesGrowth}%`); }

  // Profit growth
  if (data.profitGrowth && data.profitGrowth > 20) { score += 20; reasons.push(`Profit Growth: ${data.profitGrowth}%`); }

  return { score: Math.min(score, 100), reasons, raw: data };
}

function generateFundamentalScore(symbol) {
  // Fallback: return neutral score when data unavailable
  return {
    score: 50,
    reasons: ['Fundamental data pending'],
    raw: {},
  };
}

module.exports = { fetchFundamentals, scoreFundamentals };
