import { useState, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, RefreshCw, Zap, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import axios from 'axios';

const GRADE_META = {
  A: { color: '#00c853', label: 'Very Strong' },
  B: { color: '#69f0ae', label: 'Strong' },
  C: { color: '#ffd740', label: 'Moderate' },
};

const SOURCE_COLOR = {
  'Order Book':     '#00c853',
  'Depth Wall':     '#0ea5e9',
  'Volume':         '#7c3aed',
  'OI':             '#f59e0b',
  'Price Pressure': '#ec4899',
  'Delivery':       '#10b981',
};

const STRENGTH_COLOR = { LIVE: '#00c853', HIGH: '#69f0ae', MEDIUM: '#ffd740', LOW: '#90a4ae' };

// ── Buyer/Seller bar ──────────────────────────────────────────────────────────
function DomBar({ buyPct, sellPct, liveData }) {
  return (
    <div className="my-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-green-400 font-medium">Buyers {buyPct?.toFixed(0)}%</span>
        {liveData && <span className="text-xs text-emerald-400 font-medium">● LIVE</span>}
        <span className="text-red-400 font-medium">Sellers {sellPct?.toFixed(0)}%</span>
      </div>
      <div className="h-4 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500 transition-all duration-700 flex items-center justify-center"
          style={{ width: `${buyPct}%` }}>
          {buyPct >= 40 && <span className="text-xs font-bold text-white">{buyPct?.toFixed(0)}%</span>}
        </div>
        <div className="h-full bg-red-500 transition-all duration-700 flex items-center justify-center"
          style={{ width: `${sellPct}%` }}>
          {sellPct >= 40 && <span className="text-xs font-bold text-white">{sellPct?.toFixed(0)}%</span>}
        </div>
      </div>
    </div>
  );
}

// ── Stock card ────────────────────────────────────────────────────────────────
function DomCard({ item, onClick }) {
  const isBuy  = item.direction === 'BUY';
  const color  = item.color;
  const grade  = GRADE_META[item.grade] || GRADE_META.C;

  return (
    <div onClick={() => onClick(item)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `4px solid ${color}` }}>

      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-lg">{item.symbol}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: color+'22', color }}>
              {item.label}
            </span>
            {item.liveData && <span className="text-xs text-emerald-400 font-medium">● LIVE</span>}
            {item.isFO
              ? <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-medium">F&O</span>
              : <span className="text-xs bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">Non F&O</span>
            }
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{item.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span className={`text-xs ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color }}>{item.domPct?.toFixed(0)}%</div>
          <div className="text-xs font-medium" style={{ color: grade.color }}>Grade {item.grade}</div>
        </div>
      </div>

      {/* Dominance bar */}
      <DomBar buyPct={item.buyPct} sellPct={item.sellPct} liveData={item.liveData}/>

      {/* Signal sources */}
      <div className="flex flex-wrap gap-1 mt-2">
        {item.signals.map((s, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ backgroundColor: (SOURCE_COLOR[s.source]||'#64748b')+'18', color: SOURCE_COLOR[s.source]||'#64748b' }}>
            <span className="text-xs" style={{ color: STRENGTH_COLOR[s.strength] }}>●</span>
            {s.source}
          </span>
        ))}
      </div>

      {/* Key metrics */}
      <div className="flex gap-3 mt-2 text-xs text-slate-400">
        {item.deliveryPct != null && (
          <span>Del% <span className={item.deliveryPct >= 50 ? 'text-green-400' : 'text-yellow-400'}>{item.deliveryPct?.toFixed(0)}%</span></span>
        )}
        {item.volImbalance && (
          <span>Vol <span className={item.direction === 'BUY' ? 'text-green-400' : 'text-red-400'}>{item.volImbalance.buyPct}% up</span></span>
        )}
        {item.pricePressure != null && (
          <span>PP <span className={item.pricePressure >= 65 ? 'text-green-400' : item.pricePressure <= 35 ? 'text-red-400' : 'text-slate-300'}>{item.pricePressure}%</span></span>
        )}
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function DomDetail({ item, onClose }) {
  if (!item) return null;
  const isBuy = item.direction === 'BUY';
  const color = item.color;
  const ob    = item.orderBook;

  const fmtQty = q => q >= 1e6 ? (q/1e6).toFixed(2)+'M' : q >= 1e3 ? (q/1e3).toFixed(0)+'K' : String(q);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{item.symbol}</span>
              <span className="font-bold px-2 py-0.5 rounded-full text-sm" style={{ backgroundColor: color+'22', color }}>{item.label}</span>
              {item.liveData && <span className="text-xs text-emerald-400 font-medium">● LIVE ORDER BOOK</span>}
              {item.isFO
                ? <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-medium">F&O</span>
                : <span className="text-xs bg-slate-700 text-slate-500 px-2 py-0.5 rounded">Non F&O</span>
              }
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-300">₹{item.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className={item.change >= 0 ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color }}>{item.domPct?.toFixed(0)}%</div>
              <div className="text-xs" style={{ color }}>{isBuy ? 'Buyer' : 'Seller'} Dominance</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl p-1">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* Big dominance bar */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Users size={14} className="text-blue-400"/> Order Flow Balance
            </div>
            <DomBar buyPct={item.buyPct} sellPct={item.sellPct} liveData={item.liveData}/>
            <div className="grid grid-cols-2 gap-3 mt-3 text-center">
              <div className="bg-green-900/20 rounded-lg p-3">
                <div className="text-xs text-green-400 mb-1">Buy Pressure</div>
                <div className="text-2xl font-bold text-green-400">{item.buyPct?.toFixed(1)}%</div>
                {ob?.buyQty > 0 && <div className="text-xs text-green-600">{fmtQty(ob.buyQty)} qty</div>}
              </div>
              <div className="bg-red-900/20 rounded-lg p-3">
                <div className="text-xs text-red-400 mb-1">Sell Pressure</div>
                <div className="text-2xl font-bold text-red-400">{item.sellPct?.toFixed(1)}%</div>
                {ob?.sellQty > 0 && <div className="text-xs text-red-600">{fmtQty(ob.sellQty)} qty</div>}
              </div>
            </div>
          </div>

          {/* Live order book depth */}
          {ob?.bids?.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-sm font-semibold text-slate-300 mb-3">Live Order Book (Top 5)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-green-400 font-medium mb-2">BID (Buy Orders)</div>
                  {ob.bids.map((b, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                      <span className="text-green-400">₹{b.price?.toLocaleString('en-IN')}</span>
                      <span className="text-slate-300">{fmtQty(b.qty)}</span>
                    </div>
                  ))}
                  <div className="text-xs text-green-400 font-medium mt-1">Total: {fmtQty(ob.bidDepth)}</div>
                </div>
                <div>
                  <div className="text-xs text-red-400 font-medium mb-2">ASK (Sell Orders)</div>
                  {ob.asks.map((a, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-700/50">
                      <span className="text-red-400">₹{a.price?.toLocaleString('en-IN')}</span>
                      <span className="text-slate-300">{fmtQty(a.qty)}</span>
                    </div>
                  ))}
                  <div className="text-xs text-red-400 font-medium mt-1">Total: {fmtQty(ob.askDepth)}</div>
                </div>
              </div>
            </div>
          )}

          {/* All signals */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-slate-300 mb-3">
              Dominance Signals ({item.signalCount} sources confirming)
            </div>
            <div className="space-y-2">
              {item.signals.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: s.type === 'BUY' ? '#00c853' : '#ff5252' }}/>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: SOURCE_COLOR[s.source] || '#94a3b8' }}>
                        {s.source}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: s.type === 'BUY' ? '#00c853' : '#ff5252' }}>
                          {s.value?.toFixed(1)}%
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: STRENGTH_COLOR[s.strength]+'22', color: STRENGTH_COLOR[s.strength] }}>
                          {s.strength}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Delivery %',     value: item.deliveryPct != null ? item.deliveryPct.toFixed(1)+'%' : '-', color: item.deliveryPct >= 50 ? '#00c853' : '#ffd740' },
              { label: 'Vol Imbalance',  value: item.volImbalance ? item.volImbalance.buyPct+'% up' : '-',        color: item.volImbalance?.buyPct >= 60 ? '#00c853' : '#94a3b8' },
              { label: 'Price Pressure', value: item.pricePressure != null ? item.pricePressure+'%' : '-',        color: item.pricePressure >= 65 ? '#00c853' : item.pricePressure <= 35 ? '#ff5252' : '#94a3b8' },
            ].map((m, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400">{m.label}</div>
                <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Note */}
          <div className="bg-blue-900/15 border border-blue-800/30 rounded-xl p-3 text-xs text-blue-300">
            {item.liveData
              ? '● Live order book data. Refreshes every 5 minutes during market hours.'
              : '⚠ Order book empty (market closed). Showing volume & OI-based dominance from last session.'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrderDominance({ dominanceData, onRefresh }) {
  const [selected, setSelected]   = useState(null);
  const [dirFilter, setDirFilter] = useState('ALL');
  const [minPct, setMinPct]       = useState(70);
  const [foOnly, setFoOnly]       = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/dominance/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 5000);
  };

  const items = useMemo(() => {
    let list = dominanceData || [];
    if (dirFilter !== 'ALL') list = list.filter(i => i.direction === dirFilter);
    if (foOnly) list = list.filter(i => i.isFO);
    list = list.filter(i => i.domPct >= minPct);
    return list.sort((a, b) => b.domPct - a.domPct);
  }, [dominanceData, dirFilter, minPct, foOnly]);

  const buyCount  = (dominanceData||[]).filter(i => i.direction === 'BUY').length;
  const sellCount = (dominanceData||[]).filter(i => i.direction === 'SELL').length;
  const liveCount = (dominanceData||[]).filter(i => i.liveData).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Users size={16} className="text-blue-400"/>
            F&O Order Book Dominance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            F&O stocks where buyers or sellers control 70%+ · Live order book + Volume + OI + Delivery + Price Pressure
          </p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
          {isRefreshing ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Live data note */}
      <div className="mb-5 bg-blue-900/15 border border-blue-800/30 rounded-xl p-3 flex gap-2">
        <Activity size={14} className="text-blue-400 shrink-0 mt-0.5"/>
        <p className="text-xs text-blue-300">
          Live order book (bid/ask quantities) available only during market hours 9:15–15:30 IST.
          Outside hours, dominance is calculated from volume imbalance, OI signals, delivery % and price pressure.
          {liveCount > 0 && <span className="text-emerald-400 font-medium"> {liveCount} stocks have live data now.</span>}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Buyer Dominated (70%+)', value: buyCount,  color: '#00c853' },
          { label: 'Seller Dominated (70%+)',value: sellCount, color: '#ff5252' },
          { label: 'Live Order Book',         value: liveCount, color: '#0ea5e9' },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400 mb-1">{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { id: 'ALL',  label: `All (${(dominanceData||[]).length})` },
          { id: 'BUY',  label: `Buyers (${buyCount})`,  color: '#00c853' },
          { id: 'SELL', label: `Sellers (${sellCount})`, color: '#ff5252' },
        ].map(f => (
          <button key={f.id} onClick={() => setDirFilter(f.id)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={dirFilter === f.id
              ? { backgroundColor: (f.color||'#3b82f6')+'33', color: f.color||'#60a5fa', border: `1px solid ${(f.color||'#3b82f6')}55` }
              : { backgroundColor: '#1e293b', color: '#64748b' }}>
            {f.label}
          </button>
        ))}
        <button onClick={() => setFoOnly(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={foOnly
            ? { backgroundColor: '#7c3aed33', color: '#a78bfa', border: '1px solid #7c3aed55' }
            : { backgroundColor: '#1e293b', color: '#64748b' }}>
          F&O Only
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">Min dominance:</span>
          {[65, 70, 75, 80, 85].map(v => (
            <button key={v} onClick={() => setMinPct(v)}
              className={`text-xs px-2 py-1 rounded transition-colors ${minPct === v ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {v}%
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-4">{items.length} stocks with {minPct}%+ dominance</div>

      {/* Empty */}
      {(!dominanceData || dominanceData.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Users size={32} className="mb-3 opacity-30"/>
          <p className="text-sm">Dominance scan runs on startup and every 5 min during market hours.</p>
          <p className="text-xs mt-1 text-slate-600">Click Refresh to scan now.</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item, i) => (
          <DomCard key={`${item.symbol}-${i}`} item={item} onClick={setSelected}/>
        ))}
      </div>

      {items.length === 0 && dominanceData?.length > 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">No stocks at {minPct}%+ dominance threshold.</div>
      )}

      <DomDetail item={selected} onClose={() => setSelected(null)}/>
    </div>
  );
}
