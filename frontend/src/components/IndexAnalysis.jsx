import { useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Target, Shield, RefreshCw, Layers, Zap } from 'lucide-react';
import axios from 'axios';

const TF_COLOR  = { '15m': '#0ea5e9', '1h': '#7c3aed', '1d': '#f59e0b' };
const CAT_COLOR = { Breakout:'#f59e0b', Trend:'#00c853', Continuation:'#0ea5e9', Momentum:'#7c3aed', Candlestick:'#ec4899', Reversal:'#f97316', 'Support/Resistance':'#64748b' };
const scoreColor = s => s>=75?'#00c853':s>=60?'#69f0ae':s>=45?'#ffd740':'#90a4ae';

const LEVEL_COLOR = { strike:'#475569', resistance:'#ef4444', support:'#22c55e', maxpain:'#f59e0b' };

function LevelRow({ level, spot }) {
  const dist = spot > 0 ? ((level.price - spot) / spot * 100).toFixed(2) : null;
  const isAbove = level.price > spot;
  return (
    <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg text-xs ${level.atm ? 'bg-blue-500/20 border border-blue-500/40' : 'bg-slate-800/60'}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level.type] || '#64748b' }}/>
        <span className="text-slate-300 font-medium">₹{level.price.toLocaleString('en-IN')}</span>
        <span className="text-slate-500">{level.label}</span>
      </div>
      {dist && (
        <span className={`font-medium ${isAbove ? 'text-red-400' : 'text-green-400'}`}>
          {isAbove ? '+' : ''}{dist}%
        </span>
      )}
    </div>
  );
}

function PatternRow({ pattern }) {
  const catColor = CAT_COLOR[pattern.category] || '#64748b';
  return (
    <div className="bg-slate-800 rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: TF_COLOR[pattern.tf]+'22', color: TF_COLOR[pattern.tf] }}>{pattern.tf}</span>
          <span className="text-sm font-medium text-white">{pattern.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: catColor+'22', color: catColor }}>{pattern.category}</span>
          <span className="text-xs font-bold" style={{ color: scoreColor(pattern.strength) }}>{pattern.strength}</span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-2">{pattern.desc}</p>
      {pattern.entry && (
        <div className="flex gap-4 text-xs">
          <span className="text-slate-400">Entry <span className="text-white font-medium">₹{pattern.entry?.toLocaleString('en-IN')}</span></span>
          <span className="text-slate-400">Target <span className="text-green-400 font-medium">₹{pattern.target?.toLocaleString('en-IN')}</span></span>
          <span className="text-slate-400">SL <span className="text-red-400 font-medium">₹{pattern.stopLoss?.toLocaleString('en-IN')}</span></span>
          {pattern.rr && <span className="text-yellow-400 font-medium">R:R {pattern.rr}</span>}
        </div>
      )}
    </div>
  );
}

function IndexCard({ item, onClick }) {
  const rec = item.recommendation || { action: 'WATCH', color: '#ffd740' };
  const sc  = scoreColor(item.composite);
  const isUp = item.bestSetup?.entry ? item.spot >= item.bestSetup.entry : true;

  return (
    <div onClick={() => onClick(item)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `4px solid ${rec.color}` }}>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{item.label}</h3>
          <div className="text-2xl font-bold text-slate-200 mt-1">
            ₹{item.spot?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold" style={{ color: sc }}>{item.composite}</div>
          <div className="text-xs px-2 py-0.5 rounded mt-1" style={{ backgroundColor: rec.color+'22', color: rec.color }}>{rec.action}</div>
        </div>
      </div>

      {/* Pattern count per TF */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {['15m','1h','1d'].map(tf => (
          <div key={tf} className="rounded-lg p-2 text-center" style={{ backgroundColor: TF_COLOR[tf]+'18' }}>
            <div className="text-xs mb-0.5" style={{ color: TF_COLOR[tf] }}>{tf}</div>
            <div className="font-bold text-white">{item.patternCount?.[tf] || 0}</div>
            <div className="text-xs text-slate-500">patterns</div>
          </div>
        ))}
      </div>

      {/* Confluence badge */}
      {item.confluenceCount > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <Layers size={12} className="text-yellow-400"/>
          <span className="text-xs text-yellow-400 font-medium">{item.confluenceCount} MTF confluence pattern{item.confluenceCount>1?'s':''}</span>
        </div>
      )}

      {/* Best setup */}
      {item.bestSetup && (
        <div className="bg-slate-700/40 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <Zap size={10} className="text-yellow-400"/> Best: {item.bestSetup.name} ({item.bestSetup.tf})
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><div className="text-slate-400">Entry</div><div className="font-bold text-white">₹{item.bestSetup.entry?.toLocaleString('en-IN')}</div></div>
            <div><div className="text-green-400">Target</div><div className="font-bold text-green-400">₹{item.bestSetup.target?.toLocaleString('en-IN')}</div></div>
            <div><div className="text-red-400">SL</div><div className="font-bold text-red-400">₹{item.bestSetup.stopLoss?.toLocaleString('en-IN')}</div></div>
          </div>
          {item.bestSetup.rr && <div className="text-center mt-1 text-xs text-yellow-400">R:R {item.bestSetup.rr}</div>}
        </div>
      )}
    </div>
  );
}

function IndexDetail({ item, onClose }) {
  const [activeTF, setActiveTF] = useState('15m');
  if (!item) return null;
  const rec = item.recommendation || { action: 'WATCH', color: '#ffd740' };
  const sc  = scoreColor(item.composite);
  const ind = item.indicators?.[activeTF] || {};
  const patterns = item.patterns?.[activeTF] || [];
  const allPatterns = [...(item.patterns?.['15m']||[]), ...(item.patterns?.['1h']||[]), ...(item.patterns?.['1d']||[])];
  const oc = item.optionChain;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">{item.label}</h2>
            <div className="text-3xl font-bold text-slate-200">₹{item.spot?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: sc }}>{item.composite}</div>
              <div className="text-xs px-2 py-0.5 rounded mt-1" style={{ backgroundColor: rec.color+'22', color: rec.color }}>{rec.action}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6">
          {/* MTF pattern summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {['15m','1h','1d'].map(tf => (
              <div key={tf} className="rounded-xl p-3 text-center cursor-pointer border transition-all"
                style={activeTF===tf ? { backgroundColor: TF_COLOR[tf]+'22', borderColor: TF_COLOR[tf]+'66' } : { backgroundColor:'#1e293b', borderColor:'#334155' }}
                onClick={() => setActiveTF(tf)}>
                <div className="text-sm font-bold mb-1" style={{ color: TF_COLOR[tf] }}>{tf}</div>
                <div className="text-2xl font-bold text-white">{item.patternCount?.[tf] || 0}</div>
                <div className="text-xs text-slate-400">patterns</div>
              </div>
            ))}
          </div>

          {/* MTF Confluence */}
          {item.confluenceCount > 0 && (
            <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} className="text-yellow-400"/>
                <span className="text-sm font-semibold text-yellow-400">Multi-Timeframe Confluence ({item.confluenceCount} patterns)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(item.confluence || {}).map(([name, tfs]) => (
                  <div key={name} className="bg-slate-800 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-white">{name}</span>
                    <span className="text-xs text-yellow-400 ml-2">{tfs.join(' + ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Indicators for active TF */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
            {[
              { label: 'RSI', value: ind.rsi, color: ind.rsi>70?'#ff5252':ind.rsi<30?'#00c853':'#94a3b8' },
              { label: 'EMA9',  value: ind.ema9?.toFixed(0),  color: '#0ea5e9' },
              { label: 'EMA20', value: ind.ema20?.toFixed(0), color: '#7c3aed' },
              { label: 'EMA50', value: ind.ema50?.toFixed(0), color: '#f59e0b' },
              { label: 'MACD',  value: ind.macd?.histogram?.toFixed(1), color: ind.macd?.histogram>0?'#00c853':'#ff5252' },
              { label: 'ATR',   value: ind.atr?.toFixed(0),  color: '#94a3b8' },
            ].map((m,i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-xs text-slate-400">{m.label}</div>
                <div className="font-bold text-sm" style={{ color: m.color }}>{m.value ?? '-'}</div>
              </div>
            ))}
          </div>

          {/* Option Chain Summary */}
          {oc && (
            <div className="mb-6 bg-slate-800 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-300 mb-3">Option Chain — {oc.expiry}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {[
                  { label: 'PCR', value: oc.pcr, color: oc.pcr>1?'#00c853':oc.pcr<0.7?'#ff5252':'#ffd740' },
                  { label: 'Max Pain', value: oc.maxPain?.toLocaleString('en-IN'), color: '#f59e0b' },
                  { label: 'CE Wall', value: oc.ceWall?.strike?.toLocaleString('en-IN'), color: '#ff5252' },
                  { label: 'PE Wall', value: oc.peWall?.strike?.toLocaleString('en-IN'), color: '#00c853' },
                ].map((m,i) => (
                  <div key={i} className="bg-slate-700 rounded-lg p-2 text-center">
                    <div className="text-xs text-slate-400">{m.label}</div>
                    <div className="font-bold" style={{ color: m.color }}>{m.value ?? '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Levels */}
          {item.levels?.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-300 mb-3">Key Levels & Strike Prices</div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {item.levels.map((l, i) => <LevelRow key={i} level={l} spot={item.spot}/>)}
              </div>
            </div>
          )}

          {/* Patterns for active TF */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-300">
                {activeTF} Patterns ({patterns.length})
              </span>
              <div className="flex gap-1">
                {['15m','1h','1d'].map(tf => (
                  <button key={tf} onClick={() => setActiveTF(tf)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={activeTF===tf ? { backgroundColor: TF_COLOR[tf]+'33', color: TF_COLOR[tf] } : { backgroundColor:'#1e293b', color:'#64748b' }}>
                    {tf} ({item.patternCount?.[tf]||0})
                  </button>
                ))}
              </div>
            </div>
            {patterns.length === 0 && <div className="text-xs text-slate-500 text-center py-6">No patterns on {activeTF}</div>}
            {patterns.map((p, i) => <PatternRow key={i} pattern={p}/>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IndexAnalysis({ indexData, onRefresh }) {
  const [selected, setSelected]   = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/indices/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 3000);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <BarChart2 size={16} className="text-purple-400"/>
            Nifty & Sensex — Index Intraday Swing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            45 patterns × 3 timeframes (15m + 1h + 1D) · Strike prices · Option chain · MTF confluence · Works 24/7
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6 text-xs">
        {Object.entries(TF_COLOR).map(([tf, color]) => (
          <div key={tf} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color+'44', border: `1px solid ${color}` }}/>
            <span style={{ color }}>{tf} timeframe</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4">
          <Layers size={12} className="text-yellow-400"/>
          <span className="text-yellow-400">MTF Confluence = same pattern on 2+ timeframes</span>
        </div>
      </div>

      {/* Empty state */}
      {(!indexData || indexData.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <BarChart2 size={32} className="mb-3 opacity-30"/>
          <p className="text-sm">Loading Nifty, Sensex, BankNifty analysis...</p>
          <p className="text-xs mt-1 text-slate-600">Runs on startup and every 15 min. Click Refresh to trigger now.</p>
        </div>
      )}

      {/* Index cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(indexData || []).map(item => (
          <IndexCard key={item.indexKey} item={item} onClick={setSelected}/>
        ))}
      </div>

      <IndexDetail item={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
