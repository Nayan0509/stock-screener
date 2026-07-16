import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Target, Shield, RefreshCw, TrendingUp, IndianRupee, AlertTriangle, Zap, BarChart2 } from 'lucide-react';
import axios from 'axios';

const confColor = c => c === 'MAXIMUM' ? '#00c853' : c === 'VERY HIGH' ? '#69f0ae' : c === 'HIGH' ? '#ffd740' : '#90a4ae';

const GATE_LABELS = {
  above_ema20_1d:    'Price above EMA20 (daily) — medium trend up',
  above_ema50_1d:    'Price above EMA50 (daily) — macro trend up',
  rsi_1d_healthy:    'Daily RSI 45–72 (healthy, not overbought)',
  ema9_above_ema21:  'EMA9 > EMA21 on 15m (intraday uptrend)',
  above_vwap:        'Price above intraday VWAP (buyers in control)',
  macd_positive:     'MACD histogram positive (momentum up)',
  macd_rising:       'MACD histogram rising (momentum accelerating)',
  rsi_15m_ok:        'RSI(9) 45–68 on 15m (ideal entry zone)',
  volume_surge:      'Volume ≥ 2x 20-period average (institutional)',
  delivery_ok:       'Delivery % ≥ 45% (real buyers, not intraday)',
  volume_increasing: 'Volume increasing last 3 candles (accumulation)',
  higher_high:       'Higher high vs previous session (momentum)',
  near_breakout:     'Price within 0.5% of breakout level',
  atr_tradeable:     'ATR 0.3–4% of price (tradeable volatility)',
  oi_bullish:        'OI signal: Long Buildup or Short Covering',
  rr_ok:             'R:R ≥ 2:1 and SL within 3% of entry',
};

// ── Gate checklist ────────────────────────────────────────────────────────────
function GateList({ gates }) {
  return (
    <div className="space-y-1">
      {Object.entries(gates).map(([key, met]) => (
        <div key={key} className={`flex items-center gap-2 py-1 px-2 rounded ${met ? 'bg-green-900/10' : 'bg-slate-800/30'}`}>
          {met ? <CheckCircle size={12} className="text-green-400 shrink-0"/> : <XCircle size={12} className="text-slate-700 shrink-0"/>}
          <span className={`text-xs ${met ? 'text-slate-300' : 'text-slate-600'}`}>{GATE_LABELS[key] || key}</span>
        </div>
      ))}
    </div>
  );
}

// ── Single trade card ─────────────────────────────────────────────────────────
function TradeCard({ pick, rank, onClick }) {
  const cc = confColor(pick.confidence);
  const isUp = pick.change >= 0;

  return (
    <div onClick={() => onClick(pick)}
      className="bg-slate-800/70 border border-slate-700 rounded-2xl p-5 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `5px solid ${cc}` }}>

      {/* Rank + header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: cc+'22', color: cc }}>#{rank}</span>
            <span className="text-xl font-bold text-white">{pick.symbol}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: cc+'22', color: cc }}>{pick.confidence}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300">₹{pick.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span className={`text-sm ${isUp ? 'text-green-400' : 'text-red-400'}`}>{isUp ? '+' : ''}{pick.change?.toFixed(2)}%</span>
            {pick.sector && <span className="text-xs text-slate-500">{pick.sector}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: cc }}>{pick.score}%</div>
          <div className="text-xs text-slate-400">{pick.passed}/{pick.total} gates</div>
        </div>
      </div>

      {/* Trade levels — the most important part */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-700/60 rounded-xl p-3 text-center">
          <div className="text-xs text-slate-400 mb-1">BUY AT</div>
          <div className="text-lg font-bold text-white">₹{pick.entry?.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-green-900/25 rounded-xl p-3 text-center border border-green-800/30">
          <div className="text-xs text-green-400 mb-1 flex items-center justify-center gap-0.5"><Target size={9}/>T1</div>
          <div className="text-lg font-bold text-green-400">₹{pick.target1?.toLocaleString('en-IN')}</div>
          <div className="text-xs text-green-600">+{pick.profitPct1}%</div>
        </div>
        <div className="bg-blue-900/20 rounded-xl p-3 text-center border border-blue-800/20">
          <div className="text-xs text-blue-400 mb-1 flex items-center justify-center gap-0.5"><Target size={9}/>T2</div>
          <div className="text-lg font-bold text-blue-400">₹{pick.target2?.toLocaleString('en-IN')}</div>
          <div className="text-xs text-blue-600">+{pick.profitPct2}%</div>
        </div>
        <div className="bg-red-900/25 rounded-xl p-3 text-center border border-red-800/30">
          <div className="text-xs text-red-400 mb-1 flex items-center justify-center gap-0.5"><Shield size={9}/>SL</div>
          <div className="text-lg font-bold text-red-400">₹{pick.sl?.toLocaleString('en-IN')}</div>
          <div className="text-xs text-red-600">-{pick.riskPct}%</div>
        </div>
      </div>

      {/* Position sizing */}
      <div className="bg-slate-700/40 rounded-xl p-3 mb-3">
        <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
          <IndianRupee size={10}/> Position Sizing (₹1L capital)
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div><div className="text-slate-400">Qty</div><div className="font-bold text-white text-base">{pick.qty}</div></div>
          <div><div className="text-slate-400">Capital</div><div className="font-bold text-yellow-400">₹{pick.capitalUsed?.toLocaleString('en-IN')}</div></div>
          <div><div className="text-green-400">T1 Profit</div><div className="font-bold text-green-400">₹{pick.profitT1?.toLocaleString('en-IN')}</div></div>
          <div><div className="text-red-400">Max Loss</div><div className="font-bold text-red-400">₹{pick.maxLoss?.toLocaleString('en-IN')}</div></div>
        </div>
      </div>

      {/* Indicators */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>RSI <span className={pick.indicators?.rsi15 > 68 ? 'text-yellow-400' : 'text-slate-300'}>{pick.indicators?.rsi15}</span></span>
        <span>Vol <span className="text-green-400">{pick.indicators?.volRatio}x</span></span>
        <span>ATR <span className="text-slate-300">₹{pick.indicators?.atr}</span></span>
        {pick.deliveryPct != null && <span>Del% <span className={pick.deliveryPct >= 50 ? 'text-green-400' : 'text-yellow-400'}>{pick.deliveryPct?.toFixed(0)}%</span></span>}
        <span className="text-blue-400">{pick.oiSignal}</span>
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function TradeDetail({ pick, onClose }) {
  if (!pick) return null;
  const cc = confColor(pick.confidence);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{pick.symbol}</span>
              <span className="font-bold px-2 py-0.5 rounded-full text-sm" style={{ backgroundColor: cc+'22', color: cc }}>{pick.confidence}</span>
            </div>
            <div className="text-slate-400 text-sm mt-0.5">₹{pick.ltp?.toLocaleString('en-IN')} · {pick.sector}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: cc }}>{pick.score}%</div>
              <div className="text-xs text-slate-400">{pick.passed}/{pick.total} gates</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Full trade plan */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-600">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Zap size={14} className="text-yellow-400"/> Intraday Trade Plan
            </div>
            <div className="grid grid-cols-4 gap-3 text-center mb-4">
              {[
                { label: 'Buy At',   value: `₹${pick.entry?.toLocaleString('en-IN')}`,   color: '#94a3b8', bg: 'bg-slate-700' },
                { label: 'Target 1', value: `₹${pick.target1?.toLocaleString('en-IN')}`, color: '#00c853', bg: 'bg-green-900/30' },
                { label: 'Target 2', value: `₹${pick.target2?.toLocaleString('en-IN')}`, color: '#60a5fa', bg: 'bg-blue-900/20' },
                { label: 'Stop Loss',value: `₹${pick.sl?.toLocaleString('en-IN')}`,      color: '#ff5252', bg: 'bg-red-900/30' },
              ].map((l, i) => (
                <div key={i} className={`${l.bg} rounded-xl p-3`}>
                  <div className="text-xs text-slate-400 mb-1">{l.label}</div>
                  <div className="font-bold" style={{ color: l.color }}>{l.value}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-center text-xs bg-slate-700/40 rounded-lg p-3">
              <div><div className="text-slate-400">Risk per share</div><div className="font-bold text-red-400">₹{pick.risk} ({pick.riskPct}%)</div></div>
              <div><div className="text-slate-400">Risk:Reward</div><div className="font-bold text-yellow-400">1 : {pick.rr}</div></div>
            </div>
          </div>

          {/* Position sizing */}
          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <IndianRupee size={14} className="text-emerald-400"/> Fund Management (₹1,00,000 capital)
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { label: 'Buy Quantity',    value: `${pick.qty} shares`,                          color: '#ffffff' },
                { label: 'Capital Used',    value: `₹${pick.capitalUsed?.toLocaleString('en-IN')} (${pick.capitalUsedPct}%)`, color: '#ffd740' },
                { label: 'T1 Profit',       value: `₹${pick.profitT1?.toLocaleString('en-IN')} (+${pick.profitPct1}%)`,       color: '#00c853' },
                { label: 'T2 Profit',       value: `₹${pick.profitT2?.toLocaleString('en-IN')} (+${pick.profitPct2}%)`,       color: '#60a5fa' },
                { label: 'Max Loss (SL hit)',value: `₹${pick.maxLoss?.toLocaleString('en-IN')} (${(pick.maxLoss/1000).toFixed(1)}% of capital)`, color: '#ff5252' },
                { label: 'ATR(14)',         value: `₹${pick.indicators?.atr} (${pick.indicators?.atrPct}% of price)`,         color: '#94a3b8' },
              ].map((m, i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-3">
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-xs text-blue-300">
              <strong>Rule:</strong> Risk only ₹1,000 (1% of capital) per trade. Qty = ₹1,000 ÷ (Entry − SL). Max 35% capital per trade.
            </div>
          </div>

          {/* Indicators */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">Technical Indicators</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'RSI(9) 15m',  value: pick.indicators?.rsi15,  color: pick.indicators?.rsi15 > 68 ? '#ffd740' : '#00c853' },
                { label: 'RSI(14) 1D',  value: pick.indicators?.rsi1d,  color: '#94a3b8' },
                { label: 'EMA9 (15m)',  value: `₹${pick.indicators?.ema9?.toLocaleString('en-IN')}`,  color: '#0ea5e9' },
                { label: 'EMA21 (15m)', value: `₹${pick.indicators?.ema21?.toLocaleString('en-IN')}`, color: '#7c3aed' },
                { label: 'VWAP',        value: `₹${pick.indicators?.vwap?.toLocaleString('en-IN')}`,  color: '#f59e0b' },
                { label: 'Vol Ratio',   value: `${pick.indicators?.volRatio}x avg`,                   color: pick.indicators?.volRatio >= 2 ? '#00c853' : '#94a3b8' },
              ].map((m, i) => (
                <div key={i} className="bg-slate-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold text-sm" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* All 16 gates */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">
              All 16 Gates ({pick.passed}/{pick.total} passed)
            </div>
            <div className="h-2 bg-slate-700 rounded-full mb-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pick.score}%`, backgroundColor: cc }}/>
            </div>
            <GateList gates={pick.gates}/>
          </div>

          {/* Trade rules */}
          <div className="bg-emerald-900/15 border border-emerald-800/30 rounded-xl p-4">
            <div className="text-sm font-semibold text-emerald-400 mb-2">Intraday Trade Rules</div>
            <ul className="space-y-1 text-xs text-slate-400">
              <li>• Buy at market open or on first pullback to VWAP after 9:30 AM.</li>
              <li>• Book 50% at Target 1, let rest run to Target 2.</li>
              <li>• Move SL to breakeven after Target 1 is hit.</li>
              <li>• Exit ALL positions by 3:15 PM — no overnight holding.</li>
              <li>• If SL is hit, stop trading for the day. Don't revenge trade.</li>
              <li>• Max 3 trades per day. Max ₹40,000 per trade.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Daily plan summary ────────────────────────────────────────────────────────
function DailyPlan({ plan }) {
  if (!plan || !plan.trades?.length) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-900/30 to-slate-800/30 border border-emerald-800/40 rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={16} className="text-emerald-400"/>
        <span className="font-semibold text-emerald-400">Today's Trading Plan — ₹{plan.capital?.toLocaleString('en-IN')} Capital</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Trades Today',    value: plan.tradeCount,                                                    color: '#94a3b8' },
          { label: 'Capital Deployed',value: `₹${plan.totalCapitalUsed?.toLocaleString('en-IN')} (${plan.capitalUsedPct}%)`, color: '#ffd740' },
          { label: 'Target Profit',   value: `₹${plan.totalProfitT1?.toLocaleString('en-IN')} (${plan.profitPctT1}%)`,       color: '#00c853' },
          { label: 'Max Risk',        value: `₹${plan.totalMaxLoss?.toLocaleString('en-IN')} (${plan.maxLossPct}%)`,         color: '#ff5252' },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400 mb-1">{s.label}</div>
            <div className="font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {plan.riskRewardOk
          ? <><CheckCircle size={12} className="text-green-400"/><span className="text-green-400">Total risk within safe limits (≤3% of capital)</span></>
          : <><AlertTriangle size={12} className="text-yellow-400"/><span className="text-yellow-400">Total risk elevated — consider reducing position sizes</span></>}
        <span className="text-slate-500 ml-auto">Capital remaining: ₹{plan.capitalRemaining?.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntradayPicks() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [capital, setCapital]   = useState(100000);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    axios.get('/api/picks')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await axios.post('/api/picks/refresh', { capital });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const r = await axios.get('/api/picks');
        if (r.data?.picks?.length > 0 || attempts > 30) {
          setData(r.data);
          setIsRefreshing(false);
          clearInterval(poll);
        }
      }, 3000);
    } catch { setIsRefreshing(false); }
  };

  const picks = data?.picks || [];
  const plan  = data?.plan;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp size={22} className="text-emerald-400"/>
              Intraday Stock Picks
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              16-gate maximum confidence filter · Position sizing for ₹1L capital · Entry, Target & SL for every trade
            </p>
            {data?.lastUpdated && (
              <p className="text-xs text-slate-600 mt-1">Last scan: {new Date(data.lastUpdated).toLocaleString('en-IN')}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
              <IndianRupee size={12} className="text-slate-400"/>
              <input type="number" value={capital} onChange={e => setCapital(parseInt(e.target.value)||100000)}
                className="bg-transparent text-white text-sm w-24 outline-none"
                placeholder="Capital"/>
            </div>
            <button onClick={handleRefresh} disabled={isRefreshing}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''}/>
              {isRefreshing ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Honest disclaimer */}
        <div className="mb-6 bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5"/>
          <div className="text-xs text-yellow-300">
            <strong>Realistic expectations:</strong> ₹10,000 daily profit on ₹1L = 10% daily — mathematically unsustainable.
            This system targets <strong>₹1,000–₹3,000 per day (1–3%)</strong> with strict risk management.
            Only stocks passing all 16 gates are shown. On most days, 0–3 stocks qualify.
            No system is 100% — always use stop losses.
          </div>
        </div>

        {/* Daily plan */}
        <DailyPlan plan={plan}/>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"/>
            <p className="text-sm">Loading picks...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && picks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <TrendingUp size={40} className="mb-4 opacity-20"/>
            <p className="text-base font-medium">No high-confidence picks right now.</p>
            <p className="text-sm mt-2 text-slate-600">This is normal — the filter is strict by design.</p>
            <p className="text-xs mt-1 text-slate-600">Sideways or bearish markets produce zero picks. That's the system protecting your capital.</p>
            <p className="text-xs mt-1 text-slate-600">Click "Scan Now" to run a fresh scan.</p>
          </div>
        )}

        {/* Picks */}
        <div className="space-y-4">
          {picks.map((pick, i) => (
            <TradeCard key={pick.symbol} pick={pick} rank={i + 1} onClick={setSelected}/>
          ))}
        </div>

        {/* Fund management rules */}
        {picks.length > 0 && (
          <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
            <div className="text-sm font-semibold text-slate-300 mb-3">Fund Management Rules (₹1L Capital)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
              {[
                ['Max trades per day', '3 simultaneous positions'],
                ['Max capital per trade', '35% = ₹35,000'],
                ['Risk per trade', '1% of capital = ₹1,000'],
                ['Position size formula', 'Qty = ₹1,000 ÷ (Entry − SL)'],
                ['Target per day (realistic)', '1–3% = ₹1,000–₹3,000'],
                ['Exit time', 'All positions closed by 3:15 PM'],
                ['After SL hit', 'Stop trading for the day'],
                ['Profit booking', '50% at T1, rest at T2 or 3:15 PM'],
              ].map(([label, value], i) => (
                <div key={i} className="flex justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-200 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TradeDetail pick={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
