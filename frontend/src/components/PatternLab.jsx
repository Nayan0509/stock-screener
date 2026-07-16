import { useState, useMemo } from 'react';
import { ShieldCheck, TrendingUp, TrendingDown, Zap, RefreshCw, BarChart2, Layers } from 'lucide-react';

const CATEGORIES = ['All', 'Trend', 'Continuation', 'Reversal', 'Momentum', 'Candlestick'];

const CAT_META = {
  All:          { icon: Layers,    color: '#94a3b8', desc: 'All 45 patterns' },
  Trend:        { icon: TrendingUp, color: '#00c853', desc: 'EMA crossovers, breakouts, trend structure' },
  Continuation: { icon: Zap,       color: '#0ea5e9', desc: 'Bull flag, pennant, cup & handle' },
  Reversal:     { icon: RefreshCw, color: '#f59e0b', desc: 'Double bottom, H&S, wedge breakouts' },
  Momentum:     { icon: BarChart2, color: '#7c3aed', desc: 'MACD, RSI, Supertrend, Ichimoku' },
  Candlestick:  { icon: ShieldCheck, color: '#ec4899', desc: 'Engulfing, soldiers, doji, harami' },
};

const strengthColor = (s) => {
  if (s >= 88) return '#00c853';
  if (s >= 80) return '#69f0ae';
  if (s >= 72) return '#ffd740';
  return '#90a4ae';
};

function PatternBadge({ pattern }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-slate-500 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-white leading-tight">{pattern.name}</span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: strengthColor(pattern.strength) + '22', color: strengthColor(pattern.strength) }}
        >
          {pattern.strength}
        </span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{pattern.desc}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: CAT_META[pattern.category]?.color + '22', color: CAT_META[pattern.category]?.color }}
        >
          {pattern.category}
        </span>
        <span className="text-xs text-green-400">{pattern.signal}</span>
      </div>
    </div>
  );
}

function StockPatternRow({ stock, onSelect }) {
  const rec = stock.recommendation || { action: 'WATCH', color: '#ffd740' };
  return (
    <div
      onClick={() => onSelect(stock)}
      className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors"
      style={{ borderLeft: `3px solid ${rec.color}` }}
    >
      <div className="w-28 shrink-0">
        <div className="font-bold text-white">{stock.symbol}</div>
        <div className={`text-xs ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          ₹{stock.ltp?.toFixed(2)} ({stock.change?.toFixed(1)}%)
        </div>
      </div>
      <div className="flex flex-wrap gap-1 flex-1">
        {(stock.patterns || []).map((p, i) => (
          <span
            key={i}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: CAT_META[p.category]?.color + '18', color: CAT_META[p.category]?.color, border: `1px solid ${CAT_META[p.category]?.color}33` }}
          >
            {p.name}
          </span>
        ))}
        {(!stock.patterns || stock.patterns.length === 0) && (
          <span className="text-xs text-slate-600">No patterns detected</span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold" style={{ color: rec.color }}>{stock.scores?.composite}</div>
        <div className="text-xs" style={{ color: rec.color }}>{rec.action}</div>
      </div>
    </div>
  );
}

export default function PatternLab({ stocks, onSelectStock }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [minStrength, setMinStrength]       = useState(75);
  const [view, setView]                     = useState('stocks'); // 'stocks' | 'guide'

  // Stocks that have at least one pattern in the selected category
  const filteredStocks = useMemo(() => {
    return stocks
      .filter(s => {
        const patterns = s.patterns || [];
        if (activeCategory === 'All') return patterns.length > 0;
        return patterns.some(p => p.category === activeCategory && p.strength >= minStrength);
      })
      .sort((a, b) => {
        const aCount = (a.patterns || []).filter(p => activeCategory === 'All' || p.category === activeCategory).length;
        const bCount = (b.patterns || []).filter(p => activeCategory === 'All' || p.category === activeCategory).length;
        return bCount - aCount || b.scores?.composite - a.scores?.composite;
      });
  }, [stocks, activeCategory, minStrength]);

  // Pattern guide — all 45 patterns grouped by category
  const PATTERN_GUIDE = {
    Trend: [
      { name: '52W High Breakout', strength: 92, signal: 'BUY', category: 'Trend', desc: 'Price at 52W high with volume confirmation' },
      { name: 'Golden Cross (EMA20/50)', strength: 85, signal: 'BUY', category: 'Trend', desc: 'EMA20 just crossed above EMA50' },
      { name: 'Major Golden Cross (EMA50/200)', strength: 95, signal: 'BUY', category: 'Trend', desc: 'EMA50 crossed above EMA200 — major bull signal' },
      { name: 'Strong Uptrend (All EMAs)', strength: 82, signal: 'BUY', category: 'Trend', desc: 'Price above EMA20, EMA50, EMA200 — strong trend' },
      { name: 'Volume Climax Breakout', strength: 83, signal: 'BUY', category: 'Trend', desc: '3x+ volume surge with price up — institutional buying' },
      { name: 'Pennant Breakout', strength: 81, signal: 'BUY', category: 'Trend', desc: 'Converging pennant with breakout volume' },
      { name: 'Higher Highs & Higher Lows', strength: 77, signal: 'BUY', category: 'Trend', desc: 'Classic uptrend structure intact' },
      { name: 'Darvas Box Breakout', strength: 86, signal: 'BUY', category: 'Trend', desc: 'Price breaks above 4-week high box with volume — Nicolas Darvas method' },
      { name: 'Weinstein Stage 2', strength: 83, signal: 'BUY', category: 'Trend', desc: 'Price above rising 30-week SMA with above-average volume — Stan Weinstein Stage 2' },
    ],
    Continuation: [
      { name: 'Bull Flag', strength: 88, signal: 'BUY', category: 'Continuation', desc: 'Tight consolidation after strong move, breaking out' },
      { name: 'Cup & Handle', strength: 93, signal: 'BUY', category: 'Continuation', desc: 'Classic accumulation pattern with handle breakout' },
      { name: 'Consolidation Breakout', strength: 87, signal: 'BUY', category: 'Continuation', desc: 'Tight range compression breaking out with volume' },
      { name: 'Rising Three Methods', strength: 83, signal: 'BUY', category: 'Continuation', desc: 'Long green, 3 small red candles within range, then strong green breakout' },
      { name: 'Upside Tasuki Gap', strength: 78, signal: 'BUY', category: 'Continuation', desc: 'Gap up green candles followed by red that fails to fill the gap' },
      { name: 'Mat Hold', strength: 81, signal: 'BUY', category: 'Continuation', desc: 'Strong green, small pullback above midpoint, then breakout' },
      { name: 'Bullish Kicker', strength: 87, signal: 'BUY', category: 'Continuation', desc: 'Gap up from red candle to green candle — powerful signal' },
      { name: 'On Neck Bullish', strength: 70, signal: 'BUY', category: 'Continuation', desc: 'After downtrend, green candle closes at prior close — potential reversal' },
    ],
    Reversal: [
      { name: 'Ascending Triangle', strength: 86, signal: 'BUY', category: 'Reversal', desc: 'Flat resistance + rising lows = bullish breakout' },
      { name: 'Double Bottom', strength: 84, signal: 'BUY', category: 'Reversal', desc: 'W-pattern with neckline breakout' },
      { name: 'Inverse Head & Shoulders', strength: 91, signal: 'BUY', category: 'Reversal', desc: 'Reversal pattern — neckline breakout confirmed' },
      { name: 'Triple Bottom', strength: 88, signal: 'BUY', category: 'Reversal', desc: 'Three lows at same level with neckline breakout' },
      { name: 'Rounding Bottom (Saucer)', strength: 82, signal: 'BUY', category: 'Reversal', desc: 'Gradual U-shape accumulation — price returning to prior highs' },
      { name: 'V-Bottom Recovery', strength: 80, signal: 'BUY', category: 'Reversal', desc: 'Sharp drop then sharp recovery back above EMA20' },
      { name: 'Island Reversal Bottom', strength: 86, signal: 'BUY', category: 'Reversal', desc: 'Gap down, consolidation, gap up — island isolated by two gaps' },
      { name: 'Falling Wedge Breakout', strength: 85, signal: 'BUY', category: 'Reversal', desc: 'Lower highs and lower lows converging — breakout above upper trendline' },
      { name: 'Adam & Eve Double Bottom', strength: 87, signal: 'BUY', category: 'Reversal', desc: 'Sharp Adam bottom + rounded Eve bottom with neckline break' },
    ],
    Momentum: [
      { name: 'BB Squeeze Breakout', strength: 89, signal: 'BUY', category: 'Momentum', desc: 'Bollinger Band squeeze releasing upward' },
      { name: 'MACD Bullish Crossover', strength: 80, signal: 'BUY', category: 'Momentum', desc: 'MACD line crossed above signal line' },
      { name: 'RSI Oversold Recovery', strength: 78, signal: 'BUY', category: 'Momentum', desc: 'RSI recovering from oversold in uptrend' },
      { name: 'Support Bounce', strength: 76, signal: 'BUY', category: 'Momentum', desc: 'Bouncing off key support with volume' },
      { name: 'Stochastic Crossover', strength: 74, signal: 'BUY', category: 'Momentum', desc: 'Stochastic crossing out of oversold zone' },
      { name: 'VWAP Reclaim', strength: 78, signal: 'BUY', category: 'Momentum', desc: 'Price crosses back above 20-day average price with volume' },
      { name: 'ADX Trend Strength', strength: 79, signal: 'BUY', category: 'Momentum', desc: 'Consistent directional movement with expanding range' },
      { name: 'Supertrend Buy', strength: 81, signal: 'BUY', category: 'Momentum', desc: 'Price above Supertrend upper band proxy for 3 consecutive days' },
      { name: 'Ichimoku Cloud Breakout', strength: 84, signal: 'BUY', category: 'Momentum', desc: 'Price breaks above cloud proxy after being below — trend change' },
      { name: 'Elder Ray Bull Power', strength: 76, signal: 'BUY', category: 'Momentum', desc: 'EMA13 rising with high above EMA13 — positive bull power' },
    ],
    Candlestick: [
      { name: 'Morning Star', strength: 79, signal: 'BUY', category: 'Candlestick', desc: '3-candle reversal pattern at support' },
      { name: 'Hammer / Pin Bar', strength: 75, signal: 'BUY', category: 'Candlestick', desc: 'Long lower wick rejection — buyers in control' },
      { name: 'Bullish Engulfing', strength: 82, signal: 'BUY', category: 'Candlestick', desc: 'Current candle fully engulfs prior red candle — strong reversal' },
      { name: 'Three White Soldiers', strength: 85, signal: 'BUY', category: 'Candlestick', desc: '3 consecutive green candles each closing higher' },
      { name: 'Piercing Line', strength: 76, signal: 'BUY', category: 'Candlestick', desc: 'Bull candle opens below prior low and closes above prior midpoint' },
      { name: 'Bullish Harami', strength: 72, signal: 'BUY', category: 'Candlestick', desc: 'Small green candle inside large red candle — inside bar reversal' },
      { name: 'Dragonfly Doji', strength: 74, signal: 'BUY', category: 'Candlestick', desc: 'Open=close near high with very long lower wick at support' },
      { name: 'Tweezer Bottom', strength: 71, signal: 'BUY', category: 'Candlestick', desc: 'Two candles sharing the same low, second is bullish' },
      { name: 'Three Inside Up', strength: 80, signal: 'BUY', category: 'Candlestick', desc: 'Bearish candle, bullish harami, then confirming green close' },
      { name: 'Higher Highs & Higher Lows', strength: 77, signal: 'BUY', category: 'Candlestick', desc: 'Classic uptrend structure intact' },
    ],
  };

  const guidePatterns = activeCategory === 'All'
    ? Object.values(PATTERN_GUIDE).flat()
    : PATTERN_GUIDE[activeCategory] || [];

  return (
    <div>
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map(cat => {
          const meta = CAT_META[cat];
          const Icon = meta.icon;
          const count = cat === 'All'
            ? stocks.filter(s => (s.patterns || []).length > 0).length
            : stocks.filter(s => (s.patterns || []).some(p => p.category === cat)).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                activeCategory === cat
                  ? 'text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
              style={activeCategory === cat ? { backgroundColor: meta.color + '33', color: meta.color, border: `1px solid ${meta.color}55` } : {}}
            >
              <Icon size={12} />
              {cat}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}

        {/* View toggle */}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setView('stocks')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${view === 'stocks' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            Stocks
          </button>
          <button
            onClick={() => setView('guide')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${view === 'guide' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            Pattern Guide
          </button>
        </div>
      </div>

      {/* Category description */}
      {activeCategory !== 'All' && (
        <p className="text-xs text-slate-500 mb-4">{CAT_META[activeCategory].desc}</p>
      )}

      {/* Strength filter (stocks view only) */}
      {view === 'stocks' && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-slate-400">Min strength:</span>
          {[0, 70, 75, 80, 85].map(v => (
            <button
              key={v}
              onClick={() => setMinStrength(v)}
              className={`text-xs px-2 py-1 rounded transition-colors ${minStrength === v ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
            >
              {v === 0 ? 'Any' : `${v}+`}
            </button>
          ))}
          <span className="text-xs text-slate-500 ml-auto">{filteredStocks.length} stocks</span>
        </div>
      )}

      {/* STOCKS VIEW */}
      {view === 'stocks' && (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredStocks.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No stocks with {activeCategory === 'All' ? 'any' : activeCategory} patterns detected yet.
            </div>
          )}
          {filteredStocks.map(s => (
            <StockPatternRow key={s.symbol} stock={s} onSelect={onSelectStock} />
          ))}
        </div>
      )}

      {/* PATTERN GUIDE VIEW */}
      {view === 'guide' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
          {guidePatterns.map((p, i) => (
            <PatternBadge key={i} pattern={p} />
          ))}
        </div>
      )}
    </div>
  );
}
