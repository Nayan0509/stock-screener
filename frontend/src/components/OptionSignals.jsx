import { useState } from 'react';
import { Zap, Target, Shield, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import axios from 'axios';

const confColor = c => c >= 90 ? '#00c853' : c >= 80 ? '#69f0ae' : c >= 70 ? '#ffd740' : '#90a4ae';

function ConditionRow({ label, met }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {met
        ? <CheckCircle size={12} className="text-green-400 shrink-0"/>
        : <AlertTriangle size={12} className="text-slate-600 shrink-0"/>}
      <span className={`text-xs ${met ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
    </div>
  );
}

const CONDITION_LABELS = {
  // CE
  trend_up_15m:   'EMA9 > EMA21 on 15m (uptrend)',
  above_vwap:     'Price above intraday VWAP',
  trending:       'ADX ≥ 18 (trending, not sideways)',
  rsi_ok:         'RSI(9) between 40–72 (healthy)',
  macd_bullish:   'MACD histogram positive',
  patterns_15m:   '≥ 2 bullish patterns on 15m',
  patterns_1h:    '≥ 1 bullish pattern on 1h',
  trend_1h:       'EMA20 > EMA50 on 1h',
  trend_1d:       'Price above EMA20 on daily',
  pcr_bullish:    'PCR 0.7–1.3 (neutral-bullish)',
  room_to_target: 'CE wall far enough for target',
  not_overbought: 'RSI < 75 (not overbought)',
  // PE
  trend_down_15m:  'EMA9 < EMA21 on 15m (downtrend)',
  below_vwap:      'Price below intraday VWAP',
  macd_bearish:    'MACD histogram negative',
  trend_1h_bear:   'EMA20 < EMA50 on 1h',
  trend_1d_bear:   'Price below EMA20 on daily',
  pcr_bearish:     'PCR > 1.3 (bearish sentiment)',
  room_to_target:  'PE wall far enough for target',
  not_oversold:    'RSI > 25 (not oversold)',
  consecutive_red: '3 consecutive red 15m candles',
};

function SignalCard({ signal, onClick }) {
  const isCE  = signal.type === 'CE BUY';
  const color = isCE ? '#00c853' : '#ff5252';
  const cc    = confColor(signal.confidence);

  return (
    <div onClick={() => onClick(signal)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `4px solid ${color}` }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white text-lg">{signal.index}</span>
            <span className="text-sm font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: color+'22', color }}>{signal.type}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">₹{signal.strike?.toLocaleString('en-IN')}</span>
            <span className="text-slate-400 text-sm">{signal.expiry}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold" style={{ color: cc }}>{signal.confidence}%</div>
          <div className="text-xs text-slate-400">confidence</div>
          <div className="text-xs mt-1" style={{ color: cc }}>{signal.conditionsMet}/{signal.totalConditions} checks</div>
        </div>
      </div>

      {/* Premium box */}
      <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
        <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
          <Zap size={10} className="text-yellow-400"/> Option Premium
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-slate-400">Buy At</div>
            <div className="text-lg font-bold text-white">₹{signal.premium}</div>
          </div>
          <div>
            <div className="text-xs text-green-400 flex items-center justify-center gap-0.5"><Target size={9}/>Target</div>
            <div className="text-lg font-bold text-green-400">₹{signal.premiumTarget}</div>
          </div>
          <div>
            <div className="text-xs text-red-400 flex items-center justify-center gap-0.5"><Shield size={9}/>Stop Loss</div>
            <div className="text-lg font-bold text-red-400">₹{signal.premiumSL}</div>
          </div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>1 lot ({signal.lotSize} qty) = ₹{signal.lotCost?.toLocaleString('en-IN')}</span>
          <span className="text-yellow-400">R:R {signal.rr}</span>
        </div>
      </div>

      {/* Spot levels */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
        <div className="bg-slate-700/40 rounded-lg p-2">
          <div className="text-slate-400">Spot Entry</div>
          <div className="font-bold text-white">₹{signal.spotEntry?.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-green-900/20 rounded-lg p-2">
          <div className="text-green-400">Spot Target</div>
          <div className="font-bold text-green-400">₹{signal.spotTarget?.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-red-900/20 rounded-lg p-2">
          <div className="text-red-400">Spot SL</div>
          <div className="font-bold text-red-400">₹{signal.spotSL?.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* IV + OI */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        {signal.iv > 0 && <span>IV: <span className={signal.ivScore >= 70 ? 'text-green-400' : 'text-yellow-400'}>{signal.iv}%</span></span>}
        {signal.oi > 0 && <span>OI: <span className="text-slate-300">{(signal.oi/1000).toFixed(0)}K</span></span>}
        {signal.oiChange !== 0 && <span>OI Chg: <span className={signal.oiChange > 0 ? 'text-green-400' : 'text-red-400'}>{signal.oiChange > 0 ? '+' : ''}{(signal.oiChange/1000).toFixed(0)}K</span></span>}
      </div>
    </div>
  );
}

function SignalDetail({ signal, onClose }) {
  if (!signal) return null;
  const isCE  = signal.type === 'CE BUY';
  const color = isCE ? '#00c853' : '#ff5252';
  const cc    = confColor(signal.confidence);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{signal.index}</span>
              <span className="font-bold px-2 py-0.5 rounded text-sm" style={{ backgroundColor: color+'22', color }}>{signal.type}</span>
            </div>
            <div className="text-2xl font-bold text-white mt-0.5">
              Strike ₹{signal.strike?.toLocaleString('en-IN')} {signal.expiry}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: cc }}>{signal.confidence}%</div>
              <div className="text-xs text-slate-400">confidence</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6">
          {/* Premium trade setup */}
          <div className="bg-slate-800 rounded-xl p-5 mb-5 border border-slate-600">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Zap size={14} className="text-yellow-400"/> Option Trade Setup
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="bg-slate-700 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1">Buy Premium</div>
                <div className="text-2xl font-bold text-white">₹{signal.premium}</div>
              </div>
              <div className="bg-green-900/30 rounded-xl p-3 border border-green-800/40">
                <div className="text-xs text-green-400 mb-1 flex items-center justify-center gap-1"><Target size={10}/>Target</div>
                <div className="text-2xl font-bold text-green-400">₹{signal.premiumTarget}</div>
                <div className="text-xs text-green-600">+{((signal.premiumTarget/signal.premium-1)*100).toFixed(0)}%</div>
              </div>
              <div className="bg-red-900/30 rounded-xl p-3 border border-red-800/40">
                <div className="text-xs text-red-400 mb-1 flex items-center justify-center gap-1"><Shield size={10}/>Stop Loss</div>
                <div className="text-2xl font-bold text-red-400">₹{signal.premiumSL}</div>
                <div className="text-xs text-red-600">-{((1-signal.premiumSL/signal.premium)*100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-700/40 rounded-lg p-3">
              <div><div className="text-slate-400">1 Lot Cost</div><div className="font-bold text-white">₹{signal.lotCost?.toLocaleString('en-IN')}</div></div>
              <div><div className="text-green-400">Lot Profit</div><div className="font-bold text-green-400">₹{(signal.lotTarget - signal.lotCost)?.toLocaleString('en-IN')}</div></div>
              <div><div className="text-red-400">Lot Loss</div><div className="font-bold text-red-400">₹{(signal.lotCost - signal.lotSL)?.toLocaleString('en-IN')}</div></div>
            </div>
            <div className="text-center mt-2 text-sm text-yellow-400 font-medium">Risk:Reward = 1:{signal.rr}</div>
          </div>

          {/* Spot levels */}
          <div className="bg-slate-800 rounded-xl p-4 mb-5">
            <div className="text-sm font-semibold text-slate-300 mb-3">Index Spot Levels</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Entry', value: signal.spotEntry, color: '#94a3b8' },
                { label: 'Target', value: signal.spotTarget, color: '#00c853' },
                { label: 'Stop Loss', value: signal.spotSL, color: '#ff5252' },
              ].map((l,i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-3">
                  <div className="text-xs mb-1" style={{ color: l.color }}>{l.label}</div>
                  <div className="font-bold" style={{ color: l.color }}>₹{l.value?.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Option data */}
          {(signal.iv > 0 || signal.oi > 0) && (
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label: 'IV', value: signal.iv ? signal.iv + '%' : '-', color: signal.ivScore >= 70 ? '#00c853' : '#ffd740' },
                { label: 'Open Interest', value: signal.oi ? (signal.oi/1000).toFixed(0)+'K' : '-', color: '#94a3b8' },
                { label: 'OI Change', value: signal.oiChange ? (signal.oiChange>0?'+':'')+(signal.oiChange/1000).toFixed(0)+'K' : '-', color: signal.oiChange > 0 ? '#00c853' : '#ff5252' },
              ].map((m,i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Conditions checklist */}
          <div className="bg-slate-800 rounded-xl p-4 mb-5">
            <div className="text-sm font-semibold text-slate-300 mb-3">
              Signal Conditions ({signal.conditionsMet}/{signal.totalConditions} met)
            </div>
            <div className="h-2 bg-slate-700 rounded-full mb-3 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${signal.confidence}%`, backgroundColor: cc }}/>
            </div>
            {Object.entries(signal.conditions || {}).map(([key, met]) => (
              <ConditionRow key={key} label={CONDITION_LABELS[key] || key.replace(/_/g,' ')} met={met}/>
            ))}
          </div>

          {/* Reasons */}
          {signal.reason?.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-4 mb-5">
              <div className="text-sm font-semibold text-slate-300 mb-2">Why this signal?</div>
              {signal.reason.map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}/>
                  <span className="text-xs text-slate-300">{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Patterns */}
          {signal.patterns15m?.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-300 mb-2">Supporting Patterns</div>
              <div className="flex flex-wrap gap-2">
                {signal.patterns15m.map((p,i) => (
                  <span key={i} className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">15m: {p}</span>
                ))}
                {signal.patterns1h.map((p,i) => (
                  <span key={i} className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">1h: {p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OptionSignals({ optionSignals, onRefresh }) {
  const [selected, setSelected]   = useState(null);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/options/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 5000);
  };

  const signals = (optionSignals || []).filter(s =>
    typeFilter === 'ALL' || s.type === typeFilter
  );

  const highConf = signals.filter(s => s.confidence >= 85);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Zap size={16} className="text-yellow-400"/>
            CE / PE Buy Signals — Intraday Options
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Only 75%+ confidence signals shown · 12 expert conditions checked · Strike price, premium, target & SL for every signal
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Important disclaimer */}
      <div className="mb-5 bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5"/>
        <div className="text-xs text-yellow-300">
          <span className="font-semibold">Live option chain data requires market hours (9:15–15:30 IST).</span>
          {' '}Outside market hours, signals use estimated premiums from ATR. Premium values will be accurate only during live market.
          {' '}Always verify premium on your broker before placing trades.
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5">
        {['ALL', 'CE BUY', 'PE BUY'].map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={typeFilter === f
              ? { backgroundColor: f==='CE BUY'?'#00c85333':f==='PE BUY'?'#ff525233':'#3b82f633',
                  color: f==='CE BUY'?'#00c853':f==='PE BUY'?'#ff5252':'#60a5fa',
                  border: `1px solid ${f==='CE BUY'?'#00c85355':f==='PE BUY'?'#ff525255':'#3b82f655'}` }
              : { backgroundColor: '#1e293b', color: '#64748b' }}>
            {f}
            {f !== 'ALL' && <span className="ml-1 opacity-60">({(optionSignals||[]).filter(s=>s.type===f).length})</span>}
          </button>
        ))}
      </div>

      {/* High confidence banner */}
      {highConf.length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-green-900/30 to-slate-800/30 border border-green-800/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={14} className="text-green-400"/>
            <span className="text-sm font-semibold text-green-400">High Confidence Signals (≥85%)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {highConf.map((s,i) => (
              <button key={i} onClick={() => setSelected(s)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors">
                <span className="font-bold text-white text-sm">{s.index}</span>
                <span className="text-xs font-bold" style={{ color: s.type==='CE BUY'?'#00c853':'#ff5252' }}>{s.type}</span>
                <span className="text-xs text-slate-400">₹{s.strike}</span>
                <span className="text-xs text-yellow-400">{s.confidence}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {signals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Clock size={32} className="mb-3 opacity-30"/>
          <p className="text-sm">No high-confidence signals right now.</p>
          <p className="text-xs mt-1 text-slate-600">Signals appear when 75%+ of expert conditions are met.</p>
          <p className="text-xs mt-1 text-slate-600">During sideways markets, no signals are generated (theta decay risk).</p>
          <p className="text-xs mt-1 text-slate-600">Live option premiums available only during market hours.</p>
        </div>
      )}

      {/* Signal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {signals.map((s, i) => (
          <SignalCard key={i} signal={s} onClick={setSelected}/>
        ))}
      </div>

      <SignalDetail signal={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
