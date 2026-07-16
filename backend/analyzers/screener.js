const { analyzeOI } = require('./oiAnalyzer');
const { detectPatterns, calcRSI, calcMACD, calcEMA } = require('./chartPatterns');
const { applySafetyFilter, calcSafetyScore } = require('./safetyFilter');

function scoreStock(stock, candles = [], fundamentalScore = 50) {
  // ── Safety check first ────────────────────────────────────────────────────
  const safety = applySafetyFilter(stock, candles);
  if (!safety.safe) {
    return null; // Filtered out — not safe to buy
  }

  const safetyScore = calcSafetyScore(stock, candles);
  const hasOI = stock.openInterest > 0 || stock.oiChange !== 0;

  // Weights: safety is king, chart patterns second
  const weights = hasOI
    ? { safety: 0.30, chart: 0.25, oi: 0.20, volume: 0.10, fundamental: 0.15 }
    : { safety: 0.35, chart: 0.35, oi: 0.00, volume: 0.10, fundamental: 0.20 };

  // ── OI Score ──────────────────────────────────────────────────────────────
  const oiAnalysis = analyzeOI(stock);
  const oiScore    = hasOI ? oiAnalysis.score : 0;

  // ── Volume Score ──────────────────────────────────────────────────────────
  const avgVol   = stock.avgVolume > 0 ? stock.avgVolume : stock.volume * 0.7;
  const volRatio = avgVol > 0 ? stock.volume / avgVol : 1;
  let volumeScore = 0;
  if      (volRatio >= 3.0) volumeScore = 100;
  else if (volRatio >= 2.0) volumeScore = 80;
  else if (volRatio >= 1.5) volumeScore = 65;
  else if (volRatio >= 1.0) volumeScore = 45;
  else                      volumeScore = 20;

  // ── Chart Score ───────────────────────────────────────────────────────────
  let chartScore = 0;
  let patterns   = [];
  let rsi        = 50;
  let macd       = { macd: 0, signal: 0, histogram: 0 };

  if (candles && candles.length >= 30) {
    patterns = detectPatterns(candles);
    const closes = candles.map(c => c.close);
    rsi  = calcRSI(closes);
    macd = calcMACD(closes);

    if (patterns.length > 0) {
      // Weighted average of pattern strengths — more patterns = higher confidence
      const avgStrength = patterns.reduce((s, p) => s + p.strength, 0) / patterns.length;
      const multiBonus  = Math.min((patterns.length - 1) * 5, 20); // up to +20 for multiple patterns
      chartScore = Math.min(avgStrength + multiBonus, 100);
    } else {
      chartScore = 20; // no pattern = low chart score
    }

    // RSI adjustments
    if (rsi >= 45 && rsi <= 65) chartScore = Math.min(chartScore + 8, 100);
    if (rsi > 72)               chartScore = Math.max(chartScore - 15, 0);
    if (macd.histogram > 0)     chartScore = Math.min(chartScore + 8, 100);
    if (macd.histogram < 0)     chartScore = Math.max(chartScore - 8, 0);
  }

  // ── Composite ─────────────────────────────────────────────────────────────
  const composite =
    safetyScore    * weights.safety +
    chartScore     * weights.chart  +
    oiScore        * weights.oi     +
    volumeScore    * weights.volume +
    fundamentalScore * weights.fundamental;

  const near52High = stock.high52 > 0 && stock.ltp >= stock.high52 * 0.95;
  const finalScore = Math.min(near52High ? composite + 3 : composite, 100);

  return {
    ...stock,
    scores: {
      composite:   Math.round(finalScore),
      safety:      Math.round(safetyScore),
      chart:       Math.round(chartScore),
      oi:          Math.round(oiScore),
      volume:      Math.round(volumeScore),
      fundamental: Math.round(fundamentalScore),
    },
    patterns,
    patternCount: patterns.length,
    oiSignals:    oiAnalysis.signals,
    rsi:          Math.round(rsi),
    macd,
    near52High,
    hasOI,
    safetyReasons: safety.reasons,
    recommendation: getRecommendation(finalScore, rsi, patterns.length),
  };
}

function getRecommendation(score, rsi, patternCount) {
  if (score >= 78 && rsi < 70 && patternCount >= 2) return { action: 'STRONG BUY', color: '#00c853' };
  if (score >= 65 && rsi < 73)                       return { action: 'BUY',         color: '#69f0ae' };
  if (score >= 50)                                   return { action: 'WATCH',       color: '#ffd740' };
  if (score >= 35)                                   return { action: 'NEUTRAL',     color: '#90a4ae' };
  return                                                    { action: 'AVOID',       color: '#ff5252' };
}

function rankStocks(stocks, candleMap = {}, fundamentalMap = {}) {
  const results = [];
  for (const s of stocks) {
    const scored = scoreStock(s, candleMap[s.symbol] || [], fundamentalMap[s.symbol] || 50);
    if (scored) results.push(scored);
  }
  return results.sort((a, b) => b.scores.composite - a.scores.composite);
}

module.exports = { scoreStock, rankStocks, getRecommendation };
