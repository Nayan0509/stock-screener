import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, XCircle, TrendingUp, Target, Shield, RefreshCw, Zap, BarChart2, Search } from 'lucide-react';
import axios from 'axios';

// ── Criterion badge ───────────────────────────────────────────────────────────
function CriterionRow({ criterion, index }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${criterion.pass ? 'bg-green-900/15 border border-green-800/30' : 'bg-slate-800/40 border border-slate-700/40'}`}>
      <div className="shrink-0 mt-0.5">
        {criterion.pass
          ? <CheckCircle size={16} className="text-green-400"/>
          : <XCircle    size={16} className="text-slate-600"/>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">#{index}</span>
          <span className={`text-sm font-medium ${criterion.pass ? 'text-white' : 'text-slate-500'}`}>
            {criterion.label}
          </span>
        </div>
        <p className={`text-xs mt-0.5 ${criterion.pass ? 'text-slate-400' : 'text-slate-600'}`}>
          {criterion.detail}
        </p>
      </div>
    </div>
  );
}

// ── Compact card for grid view ────────────────────────────────────────────────
function SetupCard({ setup, onClick }) {
  const { symbol, ltp, change, passed, total, confidence, confColor, pattern, rsi, setup: trade, ema } = setup;
  const isUp = change >= 0;

  return (
    <div onClick={() => onClick(setup)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `4px solid ${confColor}` }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-lg">{symbol}</span>
            {setup.allPass && <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">ALL 6 ✓</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span className={`text-xs ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? '+' : ''}{change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: confColor }}>{passed}/6</div>
          <div className="text-xs font-medium mt-0.5" style={{ color: confColor }}>{confidence}</div>
        </div>
      </div>

      {/* 6 criteria dots */}
      <div className="flex gap-1.5 mb-3">
        {setup.criteria.map((c, i) => (
          <div key={i} title={`#${i+1}: ${c.label}`}
            className="flex-1 h-2 rounded-full"
            style={{ backgroundColor: c.pass ? confColor : '#334155' }}/>
        ))}
      </div>

      {/* Trade setup */}
      {trade && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
          <div className="bg-slate-700/50 rounded-lg p-1.5">
            <div className="text-slate-400">Entry</div>
            <div className="font-bold text-white">₹{trade.entry?.toLocaleString('en-IN')}</div>
          </div>
          <div className="bg-green-900/20 rounded-lg p-1.5">
            <div className="text-green-400 flex items-center justify-center gap-0.5"><Target size={8}/>T1</div>
            <div className="font-bold text-green-400">₹{trade.target1?.toLocaleString('en-IN')}</div>
          </div>
          <div className="bg-red-900/20 rounded-lg p-1.5">
            <div className="text-red-400 flex items-center justify-center gap-0.5"><Shield size={8}/>SL</div>
            <div className="font-bold text-red-400">₹{trade.sl?.toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}

      {/* Indicators */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {pattern && <span className="text-blue-400 font-medium">{pattern}</span>}
        <span>RSI <span className={rsi > 70 ? 'text-yellow-400' : 'text-slate-300'}>{rsi}</span></span>
        {ema?.ema20 && <span>EMA20 <span className="text-slate-300">₹{ema.ema20?.toLocaleString('en-IN')}</span></span>}
        {trade && <span className="text-yellow-400">R:R 1:{trade.rr}</span>}
      </div>
    </div>
  );
}

// ── Full detail modal ─────────────────────────────────────────────────────────
function SetupDetail({ setup, onClose }) {
  if (!setup) return null;
  const { symbol, ltp, change, passed, confidence, confColor, criteria, setup: trade, ema, pattern, rsi, resistance, volRatio, timeframe } = setup;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{symbol}</span>
              {setup.allPass && <span className="text-sm bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">ALL 6 CRITERIA MET ✓</span>}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-300">₹{ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className={change >= 0 ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>{change >= 0 ? '+' : ''}{change?.toFixed(2)}%</span>
              <span className="text-xs text-slate-500">{timeframe} chart</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: confColor }}>{passed}/6</div>
              <div className="text-xs font-medium" style={{ color: confColor }}>{confidence}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Trade setup box */}
          {trade && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-600">
              <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Zap size={14} className="text-yellow-400"/> 2-3 Day Swing Trade Setup
              </div>
              <div className="grid grid-cols-4 gap-3 text-center mb-4">
                <div className="bg-slate-700 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Entry</div>
                  <div className="text-xl font-bold text-white">₹{trade.entry?.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-green-900/30 rounded-xl p-3 border border-green-800/40">
                  <div className="text-xs text-green-400 mb-1">Target 1 (1.5R)</div>
                  <div className="text-xl font-bold text-green-400">₹{trade.target1?.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-blue-900/20 rounded-xl p-3 border border-blue-800/30">
                  <div className="text-xs text-blue-400 mb-1">Target 2 (2.5R)</div>
                  <div className="text-xl font-bold text-blue-400">₹{trade.target2?.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-red-900/30 rounded-xl p-3 border border-red-800/40">
                  <div className="text-xs text-red-400 mb-1">Stop Loss</div>
                  <div className="text-xl font-bold text-red-400">₹{trade.sl?.toLocaleString('en-IN')}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs bg-slate-700/40 rounded-lg p-3">
                <div><div className="text-slate-400">Risk</div><div className="font-bold text-red-400">₹{trade.risk?.toFixed(2)} ({trade.riskPct}%)</div></div>
                <div><div className="text-slate-400">ATR(14)</div><div className="font-bold text-slate-300">₹{trade.atr?.toFixed(2)}</div></div>
                <div><div className="text-slate-400">Risk:Reward</div><div className="font-bold text-yellow-400">1 : {trade.rr}</div></div>
              </div>
            </div>
          )}

          {/* Indicators */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Key Indicators</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'RSI(14)',      value: rsi,                    color: rsi > 70 ? '#ffd740' : rsi < 40 ? '#00c853' : '#94a3b8' },
                { label: 'EMA20',        value: ema?.ema20?.toLocaleString('en-IN'), color: ema?.ema20Slope ? '#00c853' : '#ff5252' },
                { label: 'EMA50',        value: ema?.ema50?.toLocaleString('en-IN'), color: ema?.ema50Slope ? '#00c853' : '#ff5252' },
                { label: 'Pattern',      value: pattern || 'None',      color: pattern ? '#0ea5e9' : '#64748b' },
                { label: 'Resistance',   value: resistance?.toLocaleString('en-IN'), color: '#f59e0b' },
                { label: 'Vol Ratio',    value: volRatio ? volRatio + 'x' : '-', color: volRatio >= 1.5 ? '#00c853' : '#94a3b8' },
              ].map((m, i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold text-sm" style={{ color: m.color }}>{m.value ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 6 Criteria checklist */}
          <div>
            <div className="text-sm font-semibold text-slate-300 mb-3">
              The 6 Criteria Checklist ({passed}/6 passed)
            </div>
            <div className="space-y-2">
              {criteria.map((c, i) => <CriterionRow key={i} criterion={c} index={i + 1}/>)}
            </div>
          </div>

          {/* Trade notes */}
          <div className="bg-blue-900/15 border border-blue-800/30 rounded-xl p-4">
            <div className="text-sm font-semibold text-blue-400 mb-2">Trade Notes</div>
            <ul className="space-y-1 text-xs text-slate-400">
              <li>• This is a 2-3 day swing trade, not intraday. Hold through minor pullbacks.</li>
              <li>• Exit at Target 1 (1.5R) for conservative, Target 2 (2.5R) for aggressive.</li>
              <li>• Move SL to breakeven once Target 1 is hit.</li>
              <li>• If price closes below SL on daily candle, exit immediately.</li>
              <li>• {passed === 6 ? 'All 6 criteria met — high probability setup.' : `${6 - passed} criteria not met — wait for confirmation.`}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SwingSetup() {
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('ALL'); // ALL | ALL6 | 5+
  const [search, setSearch]       = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch on mount
  useEffect(() => {
    axios.get('/api/swing')
      .then(r => { setData(r.data.data || []); setLastUpdated(r.data.lastUpdated); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await axios.post('/api/swing/refresh');
      // Poll for result
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const r = await axios.get('/api/swing');
        if (r.data.data?.length > 0 || attempts > 20) {
          setData(r.data.data || []);
          setLastUpdated(r.data.lastUpdated);
          setIsRefreshing(false);
          clearInterval(poll);
        }
      }, 3000);
    } catch { setIsRefreshing(false); }
  };

  const filtered = useMemo(() => {
    let list = [...data];
    if (filter === 'ALL6') list = list.filter(s => s.allPass);
    if (filter === '5+')   list = list.filter(s => s.passed >= 5);
    if (search) list = list.filter(s => s.symbol.includes(search.toUpperCase()));
    return list;
  }, [data, filter, search]);

  const all6Count = data.filter(s => s.allPass).length;
  const fivePlusCount = data.filter(s => s.passed >= 5).length;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Page header */}
      <div className="border-b border-slate-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart2 size={22} className="text-emerald-400"/>
              2-3 Day Swing Trade Screener
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Based on 6 expert criteria · Higher Highs/Lows · EMA20/50 · Bull Flag/Triangle · Breakout + Volume · RSI · ATR Stop Loss
            </p>
            {lastUpdated && (
              <p className="text-xs text-slate-600 mt-1">Last scan: {new Date(lastUpdated).toLocaleString('en-IN')}</p>
            )}
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''}/>
            {isRefreshing ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Setups (4+ criteria)', value: data.length,      color: '#94a3b8' },
            { label: 'All 6 Criteria Met',          value: all6Count,        color: '#00c853' },
            { label: '5+ Criteria Met',             value: fivePlusCount,    color: '#69f0ae' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">{s.label}</div>
              <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* The 6 criteria legend */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-slate-300 mb-3">The 6 Criteria (all must be YES for high-probability trade)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { n: 1, label: 'Higher Highs & Higher Lows on 4H/1D chart' },
              { n: 2, label: 'Price above EMA20 & EMA50, both sloping up' },
              { n: 3, label: 'Bull Flag or Ascending Triangle forming' },
              { n: 4, label: 'Breakout candle closes above resistance + above-avg volume' },
              { n: 5, label: 'RSI not in extreme overbought (< 75)' },
              { n: 6, label: 'Stop loss 1-2 ATR below, target 1.5-2× risk' },
            ].map(c => (
              <div key={c.n} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">{c.n}</span>
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search symbol..."
              className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs pl-8 pr-3 py-2 rounded-lg outline-none focus:border-emerald-500 w-44"/>
          </div>
          {[
            { id: 'ALL',  label: `All (${data.length})` },
            { id: 'ALL6', label: `All 6 ✓ (${all6Count})` },
            { id: '5+',   label: `5+ (${fivePlusCount})` },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`text-xs px-3 py-2 rounded-lg transition-colors ${filter === f.id ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {f.label}
            </button>
          ))}
          <span className="text-xs text-slate-500 self-center ml-auto">{filtered.length} setups</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"/>
            <p className="text-sm">Loading swing setups...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <TrendingUp size={32} className="mb-3 opacity-30"/>
            <p className="text-sm">No setups match current filter.</p>
            <p className="text-xs mt-1 text-slate-600">Click "Run Scan" to scan all F&O stocks.</p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s, i) => (
            <SetupCard key={`${s.symbol}-${i}`} setup={s} onClick={setSelected}/>
          ))}
        </div>
      </div>

      <SetupDetail setup={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
