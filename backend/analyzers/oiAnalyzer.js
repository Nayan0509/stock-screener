/**
 * Open Interest Analyzer
 * OI + Price action tells the real story of smart money
 */

function analyzeOI(stock) {
  const { ltp, change, openInterest, oiChange, volume } = stock;
  const signals = [];
  let score = 0;

  // Long Buildup: Price UP + OI UP = Bulls adding positions
  if (change > 0 && oiChange > 0) {
    score += 30;
    signals.push({ type: 'Long Buildup', description: 'Price ↑ OI ↑ — Bulls adding', bullish: true });
  }

  // Short Covering: Price UP + OI DOWN = Bears covering
  if (change > 0 && oiChange < 0) {
    score += 20;
    signals.push({ type: 'Short Covering', description: 'Price ↑ OI ↓ — Bears covering', bullish: true });
  }

  // Short Buildup: Price DOWN + OI UP = Bears adding (bearish)
  if (change < 0 && oiChange > 0) {
    score -= 20;
    signals.push({ type: 'Short Buildup', description: 'Price ↓ OI ↑ — Bears adding', bullish: false });
  }

  // Long Unwinding: Price DOWN + OI DOWN = Bulls exiting (bearish)
  if (change < 0 && oiChange < 0) {
    score -= 10;
    signals.push({ type: 'Long Unwinding', description: 'Price ↓ OI ↓ — Bulls exiting', bullish: false });
  }

  // High OI with price near 52W high = strong momentum
  if (openInterest > 1000000 && change > 1) {
    score += 15;
    signals.push({ type: 'High OI Momentum', description: 'Large OI with positive move', bullish: true });
  }

  // OI change > 10% is significant
  const oiChangePct = openInterest > 0 ? (oiChange / openInterest) * 100 : 0;
  if (oiChangePct > 10 && change > 0) {
    score += 20;
    signals.push({ type: 'OI Surge', description: `OI up ${oiChangePct.toFixed(1)}% with price up`, bullish: true });
  }

  return { score: Math.max(0, Math.min(score, 100)), signals, oiChangePct };
}

function analyzeVolumeOI(stocks) {
  return stocks
    .map(s => ({ ...s, oiAnalysis: analyzeOI(s) }))
    .filter(s => s.oiAnalysis.score > 20)
    .sort((a, b) => b.oiAnalysis.score - a.oiAnalysis.score);
}

module.exports = { analyzeOI, analyzeVolumeOI };
