import { useState, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, Package, Zap, RefreshCw } from 'lucide-react';
import axios from 'axios';

const GRADE_META = {
  A: { color: '#00c853', bg: '#00c85318', label: 'Strong Buyer Dominance' },
  B: { color: '#69f0ae', bg: '#69f0ae18', label: 'Buyers in Control' },
  C: { color: '#ffd740', bg: '#ffd74018', label: 'Balanced' },
  D: { color: '#ff5252', bg: '#ff525218', label: 'Sellers Dominating' },
};

const STRENGTH_COLOR = { HIGH: '#00c853', MEDIUM: '#ffd740', LOW: '#ff5252' };

function BuyerBar({ buyPct, buyQty, sellQty }) {
  const buy  = buyPct ?? 50;
  const sell = 100 - buy;
  const fmtQty = q => q >= 1e6 ? (q / 1e6).toFixed(2) + 'M' : q >= 1e3 ? (q / 1e3).toFixed(0) + 'K' : q;

  return (
    <div className="my-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-green-400 font-medium">
          Buyers {buyQty > 0 ? fmtQty(buyQty) : `${buy.toFixed(0)}%`}
        </span>
        <span className="text-red-400 font-medium">
          Sellers {sellQty > 0 ? fmtQty(sellQty) : `${sell.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${buy}%` }} />
        <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${sell}%` }} />
      </div>
      <div className="text-center text-xs text-slate-400 mt-1">
        {buy >= 60 ? `${buy.toFixed(0)}% buyer dominated` : buy <= 40 ? `${sell.toFixed(0)}% seller dominated` : 'Balanced order book'}
      </div>
    </div>
  );
}

function FlowCard({ item, onClick }) {
  const grade = GRADE_META[item.grade] || GRADE_META.C;
  const isUp  = item.change >= 0;
  const buyPct = item.details?.buyPct ?? (item.details?.volImbalance?.ratio
    ? Math.min((item.details.volImbalance.ratio / (item.details.volImbalance.ratio + 1)) * 100, 95)
    : 50);

  return (
    <div
      onClick={() => onClick(item)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:bg-slate-800 transition-all"
      style={{ borderLeft: `3px solid ${grade.color}` }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-white text-lg">{item.symbol}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{item.ltp?.toFixed(2)}</span>
            <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {item.change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: grade.color }}>{item.score}</div>
          <div className="text-xs px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: grade.bg, color: grade.color }}>
            {item.grade}
          </div>
        </div>
      </div>

      {/* Buyer/Seller bar */}
      <BuyerBar
        buyPct={buyPct}
        buyQty={item.details?.buyQty || 0}
        sellQty={item.details?.sellQty || 0}
      />

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {item.details?.deliveryPct != null && (
          <div className="bg-slate-700/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">Delivery</div>
            <div className={`text-sm font-bold ${item.details.deliveryPct >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
              {item.details.deliveryPct.toFixed(1)}%
            </div>
          </div>
        )}
        {item.details?.volImbalance && (
          <div className="bg-slate-700/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">Vol Ratio</div>
            <div className={`text-sm font-bold ${item.details.volImbalance.ratio >= 1.5 ? 'text-green-400' : 'text-slate-300'}`}>
              {item.details.volImbalance.ratio}x
            </div>
          </div>
        )}
        {item.details?.pricePressure != null && (
          <div className="bg-slate-700/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">Price Pressure</div>
            <div className={`text-sm font-bold ${item.details.pricePressure >= 65 ? 'text-green-400' : 'text-slate-300'}`}>
              {item.details.pricePressure}%
            </div>
          </div>
        )}
      </div>

      {/* Top signals */}
      <div className="flex flex-wrap gap-1">
        {(item.signals || []).filter(s => s.bullish).slice(0, 2).map((s, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: STRENGTH_COLOR[s.strength] + '18', color: STRENGTH_COLOR[s.strength] }}>
            {s.type}
          </span>
        ))}
      </div>
    </div>
  );
}

function FlowDetail({ item, onClose }) {
  if (!item) return null;
  const grade = GRADE_META[item.grade] || GRADE_META.C;
  const buyPct = item.details?.buyPct ?? (item.details?.volImbalance?.ratio
    ? Math.min((item.details.volImbalance.ratio / (item.details.volImbalance.ratio + 1)) * 100, 95)
    : 50);
  const fmtQty = q => q >= 1e6 ? (q / 1e6).toFixed(2) + 'M' : q >= 1e3 ? (q / 1e3).toFixed(0) + 'K' : String(q);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{item.symbol}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-300">₹{item.ltp?.toFixed(2)}</span>
              <span className={item.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                {item.change?.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: grade.color }}>{item.score}</div>
              <div className="text-xs mt-1" style={{ color: grade.color }}>{item.verdict}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 text-xl">✕</button>
          </div>
        </div>

        {/* Big buyer/seller bar */}
        <div className="bg-slate-800 rounded-xl p-4 mb-4">
          <div className="text-sm text-slate-400 mb-2 flex items-center gap-2">
            <Users size={14} /> Order Book Imbalance
          </div>
          <BuyerBar
            buyPct={buyPct}
            buyQty={item.details?.buyQty || 0}
            sellQty={item.details?.sellQty || 0}
          />
          {item.details?.bidDepth > 0 && (
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>Bid depth: {fmtQty(item.details.bidDepth)}</span>
              <span>Ask depth: {fmtQty(item.details.askDepth)}</span>
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Delivery %', value: item.details?.deliveryPct != null ? item.details.deliveryPct.toFixed(1) + '%' : '-', color: item.details?.deliveryPct >= 50 ? '#00c853' : '#ffd740', icon: Package },
            { label: 'Vol Imbalance', value: item.details?.volImbalance ? item.details.volImbalance.ratio + 'x' : '-', color: item.details?.volImbalance?.ratio >= 1.5 ? '#00c853' : '#94a3b8', icon: Zap },
            { label: 'Price Pressure', value: item.details?.pricePressure != null ? item.details.pricePressure + '%' : '-', color: item.details?.pricePressure >= 65 ? '#00c853' : '#94a3b8', icon: TrendingUp },
            { label: 'Vol Ratio', value: item.details?.volRatio != null ? item.details.volRatio + 'x avg' : '-', color: item.details?.volRatio >= 2 ? '#00c853' : '#94a3b8', icon: TrendingUp },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="bg-slate-800 rounded-lg p-3 flex items-center gap-3">
                <Icon size={16} style={{ color: m.color }} />
                <div>
                  <div className="text-xs text-slate-400">{m.label}</div>
                  <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* All signals */}
        <div className="text-sm text-slate-400 mb-2">Order Flow Signals</div>
        <div className="space-y-2">
          {(item.signals || []).map((s, i) => (
            <div key={i} className="flex items-start gap-3 bg-slate-800 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: s.bullish ? '#00c853' : '#ff5252' }} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">{s.type}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: STRENGTH_COLOR[s.strength] + '22', color: STRENGTH_COLOR[s.strength] }}>
                    {s.strength}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
          {(!item.signals || item.signals.length === 0) && (
            <div className="text-xs text-slate-500 text-center py-4">No signals detected</div>
          )}
        </div>

        {item.deliveryDate && (
          <div className="text-xs text-slate-600 mt-3 text-center">Delivery data: {item.deliveryDate}</div>
        )}
      </div>
    </div>
  );
}

export default function OrderFlow({ orderFlowData, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [sort, setSort] = useState('score');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await axios.post('/api/orderflow/refresh'); } catch {}
    setTimeout(() => setIsRefreshing(false), 3000);
  };

  const items = useMemo(() => {
    let list = [...(orderFlowData || [])];
    if (gradeFilter !== 'ALL') list = list.filter(i => i.grade === gradeFilter);
    list.sort((a, b) => {
      if (sort === 'delivery') return (b.details?.deliveryPct || 0) - (a.details?.deliveryPct || 0);
      if (sort === 'volume')   return (b.details?.volImbalance?.ratio || 0) - (a.details?.volImbalance?.ratio || 0);
      return b.score - a.score;
    });
    return list;
  }, [orderFlowData, gradeFilter, sort]);

  const grades = ['ALL', 'A', 'B', 'C'];
  const gradeCount = g => (orderFlowData || []).filter(i => i.grade === g).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            Order Flow & Buyer Dominance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Stocks where buyers massively outnumber sellers — delivery %, volume imbalance, order book depth
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="ml-auto flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Grade filter + sort */}
      <div className="flex flex-wrap gap-2 mb-5">
        {grades.map(g => {
          const meta = GRADE_META[g] || { color: '#94a3b8', bg: '#94a3b818' };
          const count = g === 'ALL' ? (orderFlowData || []).length : gradeCount(g);
          return (
            <button key={g} onClick={() => setGradeFilter(g)}
              className="text-xs px-3 py-1.5 rounded-lg transition-all"
              style={gradeFilter === g
                ? { backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.color}55` }
                : { backgroundColor: '#1e293b', color: '#64748b' }}>
              {g === 'ALL' ? 'All' : `Grade ${g} — ${meta.label}`}
              <span className="ml-1 opacity-60">({count})</span>
            </button>
          );
        })}
        <div className="ml-auto">
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 outline-none">
            <option value="score">Sort: Flow Score</option>
            <option value="delivery">Sort: Delivery %</option>
            <option value="volume">Sort: Volume Imbalance</option>
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {Object.entries(GRADE_META).map(([g, m]) => (
          <div key={g} className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: m.bg, border: `1px solid ${m.color}33` }}>
            <span className="font-bold" style={{ color: m.color }}>Grade {g}</span>
            <span className="text-slate-400 ml-1">— {m.label}</span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {(!orderFlowData || orderFlowData.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Users size={32} className="mb-3 opacity-30" />
          <p className="text-sm">Order flow scan runs after screener completes.</p>
          <p className="text-xs mt-1 text-slate-600">Or click Refresh to start now.</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(item => (
          <FlowCard key={item.symbol} item={item} onClick={setSelected} />
        ))}
      </div>

      {items.length === 0 && orderFlowData?.length > 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">No stocks match this grade filter.</div>
      )}

      <FlowDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
