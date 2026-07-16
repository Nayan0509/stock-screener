import { RefreshCw, Wifi, WifiOff, Activity, Clock, TrendingUp, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Header({ status, lastUpdated, total, filtered, onRefresh, statusMsg, mode }) {
  const isConnected = status === 'connected';
  const time = lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-IN') : '--:--';
  const isLive = mode === 'live';

  return (
    <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="text-green-400" size={20} />
            <span className="font-bold text-white text-lg">StockRadar</span>
            <span className="text-xs text-slate-500">NSE Screener</span>
          </div>
          {/* Live / Historical badge */}
          {mode && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isLive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-blue-500/20 text-blue-400'
            }`}>
              {isLive ? <TrendingUp size={10} /> : <Clock size={10} />}
              {isLive ? 'Live' : 'Historical'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {statusMsg && (
            <span className="text-xs text-yellow-400 animate-pulse hidden sm:block">{statusMsg}</span>
          )}
          {total > 0 && (
            <span className="text-xs text-slate-400 hidden sm:block">
              {filtered ?? total} safe / {total} scanned
            </span>
          )}
          <span className="text-xs text-slate-500 hidden sm:block">Updated: {time}</span>
          <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:block">{isConnected ? 'Connected' : status}</span>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <Link to="/swing"
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <TrendingUp size={12}/>
            Swing
          </Link>
          <Link to="/picks"
            className="flex items-center gap-1.5 bg-orange-700 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <Zap size={12}/>
            Picks
          </Link>
        </div>
      </div>
    </div>
  );
}
