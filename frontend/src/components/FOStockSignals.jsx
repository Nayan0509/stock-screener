import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Shield, RefreshCw, Zap, CheckCircle, AlertTriangle, BarChart2, Package, Layers } from 'lucide-react';
import axios from 'axios';

const confColor = c => c >= 90 ? '#00c853' : c >= 80 ? '#69f0ae' : c >= 70 ? '#ffd740' : '#90a4ae';
const isCE = s => s.type === 'CE BUY';

const TF_COLOR   = { '15m': '#0ea5e9', '1h': '#7c3aed', '1D': '#f59e0b' };
const CAT_COLOR  = { Breakout:'#f59e0b', Trend:'#00c853', Continuation:'#0ea5e9', Momentum:'#7c3aed', Candlestick:'#ec4899', Reversal:'#f97316', 'Support/Resistance':'#64748b' };
const strengthColor = s => s >= 88 ? '#00c853' : s >= 80 ? '#69f0ae' : s >= 72 ? '#ffd740' : '#90a4ae';

const CONDITION_LABELS = {
  // CE
  uptrend_15m:      'EMA9 > EMA21 on 15m (intraday uptrend)',
  uptrend_1h:       'EMA20 > EMA50 on 1h (swing uptrend)',
  above_ema50_1d:   'Price above EMA50 on daily (macro trend)',
  above_vwap:       'Price above intraday VWAP',
  rsi_healthy:      'RSI(14) 45–72 (healthy momentum)',
  rsi_1d_ok:        'Daily RSI 40–75 (not overbought)',
  macd_bullish:     'MACD histogram positive (momentum up)',
  trending_market:  'ADX ≥ 18 (trending, not sideways)',
  patterns_15m:     '≥ 2 bullish patterns on 15m',
  patterns_1h:      '≥ 1 bullish pattern on 1h',
  oi_bullish:       'OI signal: Long Buildup or Short Covering',
  oi_significant:   'OI change ≥ 3% (significant new positions)',
  delivery_ok:      'Delivery % ≥ 40% (real buyers, not intraday)',
  volume_surge:     'Volume ≥ 1.5x 20-day average',
  not_overbought:   'RSI < 75 (not overbought)',
  above_support:    'Price above nearest support',
  near_52w_high:    'Near 52W high or above EMA50 by 2%+',
  // PE
  downtrend_15m:    'EMA9 < EMA21 on 15m (intraday downtrend)',
  downtrend_1h:     'EMA20 < EMA50 on 1h (swing downtrend)',
  below_ema50_1d:   'Price below EMA50 on daily (macro downtrend)',
  below_vwap:       'Price below intraday VWAP',
  rsi_bearish:      'RSI(14) 28–55 (bearish zone)',
  rsi_1d_weak:      'Daily RSI ≤ 55 (weak)',
  macd_bearish:     'MACD histogram negative (momentum down)',
  oi_bearish:       'OI signal: Short Buildup or Bearish OI',
  not_oversold:     'RSI > 25 (not oversold)',
  below_resistance: 'Price below nearest resistance',
  consecutive_red:  '3 consecutive red 15m candles',
  below_52w_mid:    'Price below 52W midpoint (bearish structure)',
};

function ConditionList({ conditions }) {
  return (
    <div className="space-y-0.5">
      {Object.entries(conditions || {}).map(([key, met]) => (
        <div key={key} className="flex items-center gap-2 py-0.5">
          {met
            ? <CheckCircle size={11} className="text-green-400 shrink-0"/>
            : <AlertTriangle size={11} className="text-slate-700 shrink-0"/>}
          <span className={`text-xs ${met ? 'text-slate-300' : 'text-slate-600'}`}>
            {CONDITION_LABELS[key] || key.replace(/_/g,' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ sig, onClick }) {
  const ce    = isCE(sig);
  const color = ce ? '#00c853' : '#ff5252';
  const cc    = confColor(sig.confidence);

  return (
    <div onClick={() => onClick(sig)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `4px solid ${color}` }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-lg">{sig.symbol}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color+'22', color }}>{sig.type}</span>
            {sig.sector && <span className="text-xs text-slate-500">{sig.sector}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{sig.spot?.toLocaleString('en-IN')}</span>
            <span className="text-xs text-slate-500">Strike ₹{sig.strike?.toLocaleString('en-IN')}</span>
            <span className="text-xs text-slate-500">{sig.expiry}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold" style={{ color: cc }}>{sig.confidence}%</div>
          <div className="text-xs text-slate-400">{sig.conditionsMet}/{sig.totalConditions}</div>
        </div>
      </div>

      {/* Premium row */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-slate-700/50 rounded-lg p-2">
          <div className="text-xs text-slate-400">Buy</div>
          <div className="font-bold text-white">₹{sig.premium}</div>
        </div>
        <div className="bg-green-900/20 rounded-lg p-2">
          <div className="text-xs text-green-400 flex items-center justify-center gap-0.5"><Target size={9}/>Target</div>
          <div className="font-bold text-green-400">₹{sig.premiumTarget}</div>
          <div className="text-xs text-green-600">+{sig.premiumGainPct}%</div>
        </div>
        <div className="bg-red-900/20 rounded-lg p-2">
          <div className="text-xs text-red-400 flex items-center justify-center gap-0.5"><Shield size={9}/>SL</div>
          <div className="font-bold text-red-400">₹{sig.premiumSL}</div>
        </div>
      </div>

      {/* Spot levels */}
      <div className="flex gap-3 text-xs mb-3">
        <span className="text-slate-400">Spot SL <span className="text-red-400 font-medium">₹{sig.spotSL?.toLocaleString('en-IN')}</span></span>
        <span className="text-slate-400">Target <span className="text-green-400 font-medium">₹{sig.spotTarget?.toLocaleString('en-IN')}</span></span>
        <span className="text-yellow-400 font-medium ml-auto">R:R {sig.rr}</span>
      </div>

      {/* Lot cost */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
        <span>Lot ({sig.lotSize}) = ₹{sig.lotCost?.toLocaleString('en-IN')}</span>
        <span className="text-green-400">Profit ₹{sig.lotProfit?.toLocaleString('en-IN')}</span>
        <span className="text-red-400">Loss ₹{sig.lotLoss?.toLocaleString('en-IN')}</span>
      </div>

      {/* Indicators */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>RSI <span className={sig.indicators?.rsi15 > 70 ? 'text-red-400' : sig.indicators?.rsi15 < 35 ? 'text-green-400' : 'text-slate-300'}>{sig.indicators?.rsi15}</span></span>
        <span>ADX <span className={sig.indicators?.adx >= 20 ? 'text-green-400' : 'text-yellow-400'}>{sig.indicators?.adx}</span></span>
        {sig.deliveryPct != null && <span>Del% <span className={sig.deliveryPct >= 50 ? 'text-green-400' : 'text-yellow-400'}>{sig.deliveryPct?.toFixed(0)}%</span></span>}
        {sig.volRatio > 0 && <span>Vol <span className={sig.volRatio >= 2 ? 'text-green-400' : 'text-slate-300'}>{sig.volRatio}x</span></span>}
        <span className={`font-medium ${ce ? 'text-green-400' : 'text-red-400'}`}>{sig.oiSignal}</span>
      </div>

      {/* Pattern count + top patterns */}
      <div className="mt-2">
        {sig.totalPatterns > 0 && (
          <div className="flex items-center gap-2 mb-1.5">
            <Layers size={11} className="text-slate-400"/>
            <span className="text-xs text-slate-400">
              {sig.totalPatterns} patterns detected
              <span className="text-slate-600 ml-1">
                ({sig.patternCount15m || 0} on 15m · {sig.patternCount1h || 0} on 1h · {sig.patternCount1d || 0} on 1D)
              </span>
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {(sig.topPatterns || []).map((p, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
              style={{ backgroundColor: (CAT_COLOR[p.category] || '#64748b') + '20', color: CAT_COLOR[p.category] || '#64748b' }}>
              <span className="opacity-60 text-xs" style={{ color: TF_COLOR[p.tf] || '#94a3b8' }}>{p.tf}</span>
              {p.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalDetail({ sig, onClose }) {
  if (!sig) return null;
  const ce    = isCE(sig);
  const color = ce ? '#00c853' : '#ff5252';
  const cc    = confColor(sig.confidence);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Sticky header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{sig.symbol}</span>
              <span className="font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color+'22', color }}>{sig.type}</span>
              {sig.sector && <span className="text-xs text-slate-500">{sig.sector}</span>}
            </div>
            <div className="text-slate-400 text-sm mt-0.5">
              Spot ₹{sig.spot?.toLocaleString('en-IN')} · Strike ₹{sig.strike?.toLocaleString('en-IN')} · {sig.expiry}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: cc }}>{sig.confidence}%</div>
              <div className="text-xs text-slate-400">{sig.conditionsMet}/{sig.totalConditions} met</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Trade setup */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-600">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Zap size={14} className="text-yellow-400"/> Option Trade Setup
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="bg-slate-700 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1">Buy Premium</div>
                <div className="text-2xl font-bold text-white">₹{sig.premium}</div>
              </div>
              <div className="bg-green-900/30 rounded-xl p-3 border border-green-800/40">
                <div className="text-xs text-green-400 mb-1 flex items-center justify-center gap-1"><Target size={10}/>Target</div>
                <div className="text-2xl font-bold text-green-400">₹{sig.premiumTarget}</div>
                <div className="text-xs text-green-600">+{sig.premiumGainPct}% gain</div>
              </div>
              <div className="bg-red-900/30 rounded-xl p-3 border border-red-800/40">
                <div className="text-xs text-red-400 mb-1 flex items-center justify-center gap-1"><Shield size={10}/>Stop Loss</div>
                <div className="text-2xl font-bold text-red-400">₹{sig.premiumSL}</div>
                <div className="text-xs text-red-600">-{((1-sig.premiumSL/sig.premium)*100).toFixed(0)}% loss</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-700/40 rounded-lg p-3 mb-2">
              <div><div className="text-slate-400">1 Lot Cost</div><div className="font-bold text-white">₹{sig.lotCost?.toLocaleString('en-IN')}</div></div>
              <div><div className="text-green-400">Max Profit</div><div className="font-bold text-green-400">₹{sig.lotProfit?.toLocaleString('en-IN')}</div></div>
              <div><div className="text-red-400">Max Loss</div><div className="font-bold text-red-400">₹{sig.lotLoss?.toLocaleString('en-IN')}</div></div>
            </div>
            <div className="text-center text-sm text-yellow-400 font-medium">Risk : Reward = 1 : {sig.rr}</div>
          </div>

          {/* Spot levels */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Stock Spot Levels</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Entry (Spot)', value: sig.spot,        color: '#94a3b8' },
                { label: 'Target',       value: sig.spotTarget,  color: '#00c853' },
                { label: 'Stop Loss',    value: sig.spotSL,      color: '#ff5252' },
              ].map((l,i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-3">
                  <div className="text-xs mb-1" style={{ color: l.color }}>{l.label}</div>
                  <div className="font-bold" style={{ color: l.color }}>₹{l.value?.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Indicators */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Technical Indicators</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'RSI(14) 15m', value: sig.indicators?.rsi15,  color: sig.indicators?.rsi15>70?'#ff5252':sig.indicators?.rsi15<35?'#00c853':'#94a3b8' },
                { label: 'RSI(14) 1D',  value: sig.indicators?.rsi1d,  color: '#94a3b8' },
                { label: 'ADX',         value: sig.indicators?.adx,    color: sig.indicators?.adx>=20?'#00c853':'#ffd740' },
                { label: 'MACD Hist',   value: sig.indicators?.macdHist, color: sig.indicators?.macdHist>0?'#00c853':'#ff5252' },
                { label: 'VWAP',        value: sig.indicators?.vwap?.toLocaleString('en-IN'), color: '#94a3b8' },
                { label: 'Vol Ratio',   value: sig.volRatio+'x',       color: sig.volRatio>=2?'#00c853':'#94a3b8' },
              ].map((m,i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold text-sm" style={{ color: m.color }}>{m.value ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* OI + Fundamental */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">OI & Fundamentals</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'OI Signal',    value: sig.oiSignal,   color: ce?'#00c853':'#ff5252' },
                { label: 'OI Change',    value: sig.oiChange?(sig.oiChange>0?'+':'')+(sig.oiChange/1000).toFixed(0)+'K':'-', color: sig.oiChange>0?'#00c853':'#ff5252' },
                { label: 'Delivery %',   value: sig.deliveryPct!=null?sig.deliveryPct.toFixed(1)+'%':'-', color: sig.deliveryPct>=50?'#00c853':'#ffd740' },
                { label: 'IV',           value: sig.iv?sig.iv+'%':'-', color: sig.ivOk?'#00c853':'#ffd740' },
              ].map((m,i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-3 flex items-center gap-3">
                  <div>
                    <div className="text-xs text-slate-400">{m.label}</div>
                    <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conditions checklist */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-2">
              Signal Conditions ({sig.conditionsMet}/{sig.totalConditions} met)
            </div>
            <div className="h-2 bg-slate-700 rounded-full mb-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${sig.confidence}%`, backgroundColor: cc }}/>
            </div>
            <ConditionList conditions={sig.conditions}/>
          </div>

          {/* All 45 patterns — full breakdown by timeframe */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
              <Layers size={14} className="text-blue-400"/>
              Chart Patterns — All 45 Checked ({sig.totalPatterns || 0} detected)
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {sig.patternCount15m || 0} on 15m · {sig.patternCount1h || 0} on 1h · {sig.patternCount1d || 0} on 1D
            </div>

            {/* TF tabs */}
            {[
              { tf: '15m', patterns: sig.patterns15m, color: TF_COLOR['15m'] },
              { tf: '1h',  patterns: sig.patterns1h,  color: TF_COLOR['1h'] },
              { tf: '1D',  patterns: sig.patterns1d,  color: TF_COLOR['1D'] },
            ].map(({ tf, patterns, color }) => (
              patterns?.length > 0 && (
                <div key={tf} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color+'22', color }}>{tf}</span>
                    <span className="text-xs text-slate-500">{patterns.length} pattern{patterns.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {patterns.map((p, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-white">{p.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: (CAT_COLOR[p.category]||'#64748b')+'22', color: CAT_COLOR[p.category]||'#64748b' }}>
                              {p.category}
                            </span>
                          </div>
                          {p.desc && <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-bold" style={{ color: strengthColor(p.strength) }}>{p.strength}</div>
                          <div className="text-xs text-green-400">{p.signal}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}

            {(!sig.totalPatterns || sig.totalPatterns === 0) && (
              <div className="text-xs text-slate-600 text-center py-4">No patterns detected on any timeframe</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const SECTORS = ['All', 'Bank', 'IT', 'Pharma', 'Auto', 'Metal', 'Energy', 'FMCG', 'Finance'];

export default function FOStockSignals({ foSignals, onRefresh }) {
  const [selected, setSelected]     = useState(null);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [minConf, setMinConf]       = useState(70);
  const [search, setSearch]         = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/fo-signals/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 5000);
  };

  const signals = useMemo(() => {
    let list = foSignals || [];
    if (typeFilter !== 'ALL') list = list.filter(s => s.type === typeFilter);
    if (search) list = list.filter(s => s.symbol.includes(search.toUpperCase()));
    list = list.filter(s => s.confidence >= minConf);
    return list.sort((a, b) => b.confidence - a.confidence);
  }, [foSignals, typeFilter, minConf, search]);

  const topPicks = signals.filter(s => s.confidence >= 85).slice(0, 6);
  const ceCount  = (foSignals||[]).filter(s => s.type === 'CE BUY').length;
  const peCount  = (foSignals||[]).filter(s => s.type === 'PE BUY').length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <BarChart2 size={16} className="text-orange-400"/>
            F&O Stock CE/PE Signals — Intraday Options
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            213 F&O stocks · 17 expert conditions · OI + Delivery + Chart Patterns + Fundamentals · Entry, Target & SL
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mb-5 bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-3 flex gap-2">
        <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5"/>
        <p className="text-xs text-yellow-300">
          Live option premiums (IV, OI, bid/ask) available only during market hours 9:15–15:30 IST.
          Outside hours, premiums are estimated from ATR. Always verify on your broker before trading.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Signals', value: foSignals?.length || 0, color: '#94a3b8' },
          { label: 'CE BUY',        value: ceCount,                color: '#00c853' },
          { label: 'PE BUY',        value: peCount,                color: '#ff5252' },
        ].map((s,i) => (
          <div key={i} className="bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Top picks banner */}
      {topPicks.length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-orange-900/20 to-slate-800/30 border border-orange-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-orange-400"/>
            <span className="text-sm font-semibold text-orange-400">High Confidence Picks (≥85%)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topPicks.map((s,i) => (
              <button key={i} onClick={() => setSelected(s)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors">
                <span className="font-bold text-white text-sm">{s.symbol}</span>
                <span className="text-xs font-bold" style={{ color: isCE(s)?'#00c853':'#ff5252' }}>{s.type}</span>
                <span className="text-xs text-slate-400">₹{s.strike}</span>
                <span className="text-xs text-yellow-400">{s.confidence}%</span>
                <span className="text-xs text-yellow-400">R:R {s.rr}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search symbol..."
          className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs px-3 py-1.5 rounded-lg outline-none focus:border-orange-500 w-40"/>
        {['ALL','CE BUY','PE BUY'].map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={typeFilter===f
              ? { backgroundColor: f==='CE BUY'?'#00c85333':f==='PE BUY'?'#ff525233':'#f9731633', color: f==='CE BUY'?'#00c853':f==='PE BUY'?'#ff5252':'#fb923c', border:`1px solid ${f==='CE BUY'?'#00c85555':f==='PE BUY'?'#ff525255':'#f9731655'}` }
              : { backgroundColor:'#1e293b', color:'#64748b' }}>
            {f}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">Min confidence:</span>
          {[70,75,80,85,90].map(v => (
            <button key={v} onClick={() => setMinConf(v)}
              className={`text-xs px-2 py-1 rounded transition-colors ${minConf===v?'bg-slate-600 text-white':'bg-slate-800 text-slate-500'}`}>
              {v}%
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-4">{signals.length} signals matching filters</div>

      {/* Empty state */}
      {signals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Package size={32} className="mb-3 opacity-30"/>
          <p className="text-sm">No F&O signals at current confidence threshold.</p>
          <p className="text-xs mt-1 text-slate-600">Signals require trending market (ADX ≥ 18) + multiple confirming conditions.</p>
          <p className="text-xs mt-1 text-slate-600">Sideways markets produce no signals — theta decay kills option buyers.</p>
        </div>
      )}

      {/* Signal grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {signals.map((s,i) => (
          <SignalCard key={`${s.symbol}-${s.type}-${i}`} sig={s} onClick={setSelected}/>
        ))}
      </div>

      <SignalDetail sig={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
