import { useState, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Header from './components/Header';
import StockCard from './components/StockCard';
import StockDetail from './components/StockDetail';
import FilterBar from './components/FilterBar';
import ScanProgress from './components/ScanProgress';
import PatternLab from './components/PatternLab';
import OrderFlow from './components/OrderFlow';
import Intraday15m from './components/Intraday15m';
import IndexAnalysis from './components/IndexAnalysis';
import OptionSignals from './components/OptionSignals';
import FOStockSignals from './components/FOStockSignals';
import OrderDominance from './components/OrderDominance';
import { ShieldCheck, FlaskConical, Users, Clock, BarChart2, Zap, Package, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

const WS_URL = `ws://${window.location.hostname}:5000`;
const TABS = [
  { id: 'screener',   label: 'Screener',        icon: ShieldCheck },
  { id: 'patterns',   label: 'Pattern Lab',     icon: FlaskConical },
  { id: 'orderflow',  label: 'Order Flow',      icon: Users },
  { id: 'intraday',   label: '15m Intraday',    icon: Clock },
  { id: 'indices',    label: 'Nifty/Sensex',    icon: BarChart2 },
  { id: 'options',    label: 'Index CE/PE',     icon: Zap },
  { id: 'fo',         label: 'F&O Stock CE/PE', icon: Package },
  { id: 'dominance',  label: 'Order Dominance', icon: Activity },
];

export default function App() {
  const { data, orderFlowData, intradayData, indexData, optionSignals, foSignals, dominanceData, status, statusMsg, progress, refresh } = useWebSocket(WS_URL);
  const [tab, setTab]             = useState('screener');
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [sort, setSort]           = useState('composite');
  const [search, setSearch]       = useState('');
  const [minPatterns, setMinPatterns] = useState(0);

  const stocks = data?.data || [];

  const filtered = useMemo(() => {
    let list = [...stocks];
    if (search)           list = list.filter(s => s.symbol.includes(search.toUpperCase()));
    if (filter !== 'ALL') list = list.filter(s => s.recommendation?.action === filter);
    if (minPatterns > 0)  list = list.filter(s => (s.patternCount || 0) >= minPatterns);
    list.sort((a, b) => {
      if (sort === 'change')   return b.change - a.change;
      if (sort === 'patterns') return (b.patternCount || 0) - (a.patternCount || 0);
      return (b.scores?.[sort] || 0) - (a.scores?.[sort] || 0);
    });
    return list;
  }, [stocks, filter, sort, search, minPatterns]);

  const topPicks   = filtered.filter(s => s.recommendation?.action === 'STRONG BUY').slice(0, 5);
  const isScanning = progress && progress.pct < 100;

  return (
    <div className="min-h-screen">
      <Header
        status={status}
        lastUpdated={data?.lastUpdated}
        total={data?.total || 0}
        filtered={data?.filtered || stocks.length}
        onRefresh={refresh}
        statusMsg={statusMsg}
        mode={data?.mode}
      />

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-slate-800/50 p-1 rounded-xl w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                  tab === t.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Icon size={14} />
                {t.label}
                {t.id === 'patterns' && stocks.length > 0 && (
                  <span className="text-xs bg-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded-full">45</span>
                )}
                {t.id === 'orderflow' && orderFlowData?.length > 0 && (
                  <span className="text-xs bg-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full">{orderFlowData.length}</span>
                )}
                {t.id === 'intraday' && intradayData?.length > 0 && (
                  <span className="text-xs bg-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded-full">{intradayData.length}</span>
                )}
                {t.id === 'indices' && indexData?.length > 0 && (
                  <span className="text-xs bg-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded-full">{indexData.length}</span>
                )}
                {t.id === 'options' && optionSignals?.length > 0 && (
                  <span className="text-xs bg-yellow-500/30 text-yellow-400 px-1.5 py-0.5 rounded-full">{optionSignals.length}</span>
                )}
                {t.id === 'fo' && foSignals?.length > 0 && (
                  <span className="text-xs bg-orange-500/30 text-orange-400 px-1.5 py-0.5 rounded-full">{foSignals.length}</span>
                )}
                {t.id === 'dominance' && dominanceData?.length > 0 && (
                  <span className="text-xs bg-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded-full">{dominanceData.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── SCREENER TAB ── */}
        {tab === 'screener' && (
          <>
            {/* Top Picks Banner */}
            {topPicks.length > 0 && (
              <div className="mb-6 bg-gradient-to-r from-green-900/30 to-slate-800/30 border border-green-800/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-green-400" />
                  <span className="text-sm font-semibold text-green-400">
                    Top Safe Picks — {topPicks.length} STRONG BUY
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {topPicks.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => setSelected(s)}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="font-bold text-white">{s.symbol}</span>
                      <span className="text-green-400 text-sm">{s.scores?.composite}</span>
                      <span className={`text-xs ${s.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.change?.toFixed(1)}%
                      </span>
                      {s.patternCount > 0 && (
                        <span className="text-xs text-yellow-400">{s.patternCount}P</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search + Pattern filter */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                type="text"
                placeholder="Search symbol..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full sm:w-56 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm px-4 py-2 rounded-lg outline-none focus:border-blue-500"
              />
              <select
                value={minPatterns}
                onChange={e => setMinPatterns(parseInt(e.target.value))}
                className="bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 outline-none"
              >
                <option value={0}>All patterns</option>
                <option value={1}>≥ 1 pattern</option>
                <option value={2}>≥ 2 patterns</option>
                <option value={3}>≥ 3 patterns</option>
              </select>
              <div className="text-xs text-slate-500 self-center ml-auto">
                {filtered.length} of {stocks.length} safe stocks
                {data?.total > 0 && ` (scanned ${data.total})`}
              </div>
            </div>

            <FilterBar filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} />

            {stocks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-slate-500">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm">{statusMsg || 'Scanning all NSE stocks...'}</p>
                <p className="text-xs mt-2 text-slate-600">First scan takes 3–5 minutes for 750 stocks</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(stock => (
                <StockCard key={stock.symbol} stock={stock} onClick={setSelected} />
              ))}
            </div>

            {filtered.length === 0 && stocks.length > 0 && (
              <div className="text-center py-16 text-slate-500">No stocks match the current filter.</div>
            )}
          </>
        )}

        {/* ── PATTERN LAB TAB ── */}
        {tab === 'patterns' && (
          <PatternLab stocks={stocks} onSelectStock={setSelected} />
        )}

        {/* ── ORDER FLOW TAB ── */}
        {tab === 'orderflow' && (
          <OrderFlow orderFlowData={orderFlowData} onRefresh={refresh} />
        )}

        {/* ── 15m INTRADAY TAB ── */}
        {tab === 'intraday' && (
          <Intraday15m intradayData={intradayData} onRefresh={refresh} />
        )}

        {/* ── NIFTY / SENSEX INDEX TAB ── */}
        {tab === 'indices' && (
          <IndexAnalysis indexData={indexData} onRefresh={refresh} />
        )}

        {/* ── CE/PE OPTION SIGNALS TAB ── */}
        {tab === 'options' && (
          <OptionSignals optionSignals={optionSignals} onRefresh={refresh} />
        )}

        {/* ── F&O STOCK CE/PE SIGNALS TAB ── */}
        {tab === 'fo' && (
          <FOStockSignals foSignals={foSignals} onRefresh={refresh} />
        )}

        {/* ── ORDER DOMINANCE TAB ── */}
        {tab === 'dominance' && (
          <OrderDominance dominanceData={dominanceData} onRefresh={refresh} />
        )}
      </div>

      <StockDetail stock={selected} onClose={() => setSelected(null)} />
      <ScanProgress progress={progress} statusMsg={isScanning ? statusMsg : null} />
    </div>
  );
}
