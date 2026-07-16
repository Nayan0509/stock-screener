import { useState, useMemo } from 'react';
import { Clock, TrendingUp, TrendingDown, Target, Shield, RefreshCw, Zap } from 'lucide-react';
import axios from 'axios';

const CAT_COLOR = {
  Breakout:             '#f59e0b',
  Trend:                '#00c853',
  Continuation:         '#0ea5e9',
  Momentum:             '#7c3aed',
  Candlestick:          '#ec4899',
  Reversal:             '#f97316',
  'Support/Resistance': '#64748b',
};

const scoreColor = s => s >= 85 ? '#00c853' : s >= 70 ? '#69f0ae' : s >= 55 ? '#ffd740' : '#90a4ae';

function RRBadge({ rr }) {
  if (!rr || rr <= 0) return null;
  const color = rr >= 2 ? '#00c853' : rr >= 1.5 ? '#ffd740' : '#90a4ae';
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '22', color }}>
      R:R {rr}
    </span>
  );
}

function IntradayCard({ item, onClick }) {
  const isUp  = item.change >= 0;
  const sc    = scoreColor(item.score);
  const best  = item.setup;
  const topPat = item.patterns?.[0];

  return (
    <div onClick={() => onClick(item)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `3px solid ${sc}` }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-lg">{item.symbol}</span>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">15m</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{item.ltp?.toFixed(2)}</span>
            <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
              {item.change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: sc }}>{item.score}</div>
          <div className="text-xs text-slate-500">{item.patternCount}P</div>
        </div>
      </div>

      {/* Best setup entry/target/sl */}
      {best && (
        <div className="bg-slate-700/40 rounded-lg p-2.5 mb-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Entry</div>
            <div className="text-xs font-bold text-white">₹{best.entry?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 flex items-center justify-center gap-0.5">
              <Target size={9}/> Target
            </div>
            <div className="text-xs font-bold text-green-400">₹{best.target?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 flex items-center justify-center gap-0.5">
              <Shield size={9}/> SL
            </div>
            <div className="text-xs font-bold text-red-400">₹{best.stopLoss?.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Indicators row */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-slate-400">RSI <span className={item.indicators?.rsi > 70 ? 'text-red-400' : item.indicators?.rsi < 30 ? 'text-green-400' : 'text-slate-300'}>{item.indicators?.rsi}</span></span>
        <span className="text-slate-400">Vol <span className={item.indicators?.volRatio >= 2 ? 'text-green-400' : 'text-slate-300'}>{item.indicators?.volRatio}x</span></span>
        {best?.rr && <RRBadge rr={best.rr} />}
      </div>

      {/* Pattern tags */}
      <div className="flex flex-wrap gap-1">
        {(item.patterns || []).slice(0, 3).map((p, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: (CAT_COLOR[p.category] || '#64748b') + '20',
                     color: CAT_COLOR[p.category] || '#64748b' }}>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function IntradayDetail({ item, onClose }) {
  if (!item) return null;
  const sc   = scoreColor(item.score);
  const ind  = item.indicators || {};
  const best = item.setup;
  const pdhl = item.pdhl;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{item.symbol}</h2>
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">15m Intraday</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-300">₹{item.ltp?.toFixed(2)}</span>
              <span className={item.change >= 0 ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                {item.change?.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: sc }}>{item.score}</div>
              <div className="text-xs text-slate-400">{item.patternCount} patterns</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl p-1">✕</button>
          </div>
        </div>

        {/* Best trade setup */}
        {best && (
          <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-600">
            <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
              <Zap size={12} className="text-yellow-400"/> Best Setup — {best.pattern}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-slate-700 rounded-lg p-2">
                <div className="text-xs text-slate-400">Entry</div>
                <div className="font-bold text-white">₹{best.entry?.toFixed(2)}</div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-2">
                <div className="text-xs text-green-400 flex items-center justify-center gap-1"><Target size={10}/>Target</div>
                <div className="font-bold text-green-400">₹{best.target?.toFixed(2)}</div>
              </div>
              <div className="bg-red-900/30 rounded-lg p-2">
                <div className="text-xs text-red-400 flex items-center justify-center gap-1"><Shield size={10}/>Stop Loss</div>
                <div className="font-bold text-red-400">₹{best.stopLoss?.toFixed(2)}</div>
              </div>
            </div>
            {best.rr && (
              <div className="text-center">
                <RRBadge rr={best.rr} />
                <span className="text-xs text-slate-500 ml-2">Risk:Reward ratio</span>
              </div>
            )}
          </div>
        )}

        {/* Indicators */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'RSI(9)',    value: ind.rsi,      color: ind.rsi > 70 ? '#ff5252' : ind.rsi < 30 ? '#00c853' : '#94a3b8' },
            { label: 'EMA9',     value: ind.ema9?.toFixed(1),  color: ind.inUptrend ? '#00c853' : '#ff5252' },
            { label: 'EMA21',    value: ind.ema21?.toFixed(1), color: '#94a3b8' },
            { label: 'Vol Ratio',value: ind.volRatio + 'x',    color: ind.volRatio >= 2 ? '#00c853' : '#94a3b8' },
            { label: 'Stoch(9)', value: ind.stoch?.toFixed(0), color: ind.stoch < 20 ? '#00c853' : ind.stoch > 80 ? '#ff5252' : '#94a3b8' },
            { label: 'ATR(10)',  value: ind.atr?.toFixed(2),   color: '#94a3b8' },
          ].map((m, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-2 text-center">
              <div className="text-xs text-slate-400">{m.label}</div>
              <div className="font-bold text-sm" style={{ color: m.color }}>{m.value ?? '-'}</div>
            </div>
          ))}
        </div>

        {/* Prev Day Levels */}
        {pdhl && (
          <div className="bg-slate-800 rounded-xl p-3 mb-4">
            <div className="text-xs text-slate-400 mb-2">Previous Day Levels</div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><span className="text-slate-400">PDH </span><span className="text-yellow-400 font-bold">₹{pdhl.high?.toFixed(2)}</span></div>
              <div><span className="text-slate-400">PDL </span><span className="text-orange-400 font-bold">₹{pdhl.low?.toFixed(2)}</span></div>
              <div><span className="text-slate-400">PDC </span><span className="text-slate-300 font-bold">₹{pdhl.close?.toFixed(2)}</span></div>
            </div>
          </div>
        )}

        {/* All patterns */}
        <div className="text-sm text-slate-400 mb-2">Detected Patterns ({item.patternCount})</div>
        <div className="space-y-2">
          {(item.patterns || []).map((p, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: (CAT_COLOR[p.category] || '#64748b') + '22',
                             color: CAT_COLOR[p.category] || '#64748b' }}>
                    {p.category}
                  </span>
                  <span className="text-xs font-bold" style={{ color: scoreColor(p.strength) }}>{p.strength}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400">{p.desc}</p>
              {p.entry && (
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-slate-400">Entry <span className="text-white">₹{p.entry}</span></span>
                  <span className="text-slate-400">T <span className="text-green-400">₹{p.target}</span></span>
                  <span className="text-slate-400">SL <span className="text-red-400">₹{p.stopLoss}</span></span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = ['All', 'Breakout', 'Trend', 'Continuation', 'Momentum', 'Candlestick', 'Reversal', 'Support/Resistance'];

export default function Intraday15m({ intradayData, onRefresh }) {
  const [selected, setSelected]   = useState(null);
  const [catFilter, setCatFilter] = useState('All');
  const [minRR, setMinRR]         = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/intraday/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 3000);
  };

  const items = useMemo(() => {
    let list = [...(intradayData || [])];
    if (catFilter !== 'All') {
      list = list.filter(i => (i.patterns || []).some(p => p.category === catFilter));
    }
    if (minRR > 0) {
      list = list.filter(i => i.setup?.rr >= minRR);
    }
    return list.sort((a, b) => b.score - a.score);
  }, [intradayData, catFilter, minRR]);

  const topSetups = items.filter(i => i.setup?.rr >= 2 && i.score >= 80).slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Clock size={16} className="text-blue-400"/>
            15-Minute Intraday Swing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            45 patterns on 15m candles · Entry, Target & Stop Loss · Works 24/7 · Auto-refreshes every 15 min during market hours
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Scanning...' : 'Refresh Now'}
        </button>
      </div>

      {/* Top setups banner */}
      {topSetups.length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-blue-900/30 to-slate-800/30 border border-blue-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-yellow-400"/>
            <span className="text-sm font-semibold text-yellow-400">Best Intraday Setups (R:R ≥ 2)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topSetups.map(s => (
              <button key={s.symbol} onClick={() => setSelected(s)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors">
                <span className="font-bold text-white text-sm">{s.symbol}</span>
                <span className="text-xs text-green-400">T ₹{s.setup?.target?.toFixed(0)}</span>
                <span className="text-xs text-red-400">SL ₹{s.setup?.stopLoss?.toFixed(0)}</span>
                <RRBadge rr={s.setup?.rr}/>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={catFilter === cat
              ? { backgroundColor: (CAT_COLOR[cat] || '#3b82f6') + '33',
                  color: CAT_COLOR[cat] || '#3b82f6',
                  border: `1px solid ${(CAT_COLOR[cat] || '#3b82f6')}55` }
              : { backgroundColor: '#1e293b', color: '#64748b' }}>
            {cat}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">Min R:R</span>
          {[0, 1.5, 2, 2.5].map(v => (
            <button key={v} onClick={() => setMinRR(v)}
              className={`text-xs px-2 py-1 rounded transition-colors ${minRR === v ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {v === 0 ? 'Any' : `${v}+`}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-4">{items.length} stocks with 15m patterns</div>

      {/* Empty state */}
      {(!intradayData || intradayData.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Clock size={32} className="mb-3 opacity-30"/>
          <p className="text-sm">Scanning 15m candles from last 5 trading days...</p>
          <p className="text-xs mt-1 text-slate-600">Works 24/7 — Yahoo Finance keeps 5 days of 15m data always available.</p>
          <p className="text-xs mt-1 text-slate-600">Click "Refresh Now" if data hasn't loaded yet.</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(item => (
          <IntradayCard key={item.symbol} item={item} onClick={setSelected}/>
        ))}
      </div>

      {items.length === 0 && intradayData?.length > 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">No stocks match this filter.</div>
      )}

      <IntradayDetail item={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
