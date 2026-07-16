import ScoreBar from './ScoreBar';
import { TrendingUp, TrendingDown, Activity, ShieldCheck } from 'lucide-react';

const scoreColor = (s) => {
  if (s >= 75) return '#00c853';
  if (s >= 60) return '#69f0ae';
  if (s >= 45) return '#ffd740';
  return '#90a4ae';
};

export default function StockCard({ stock, onClick }) {
  const { symbol, ltp, change, scores, recommendation, patterns, oiSignals, rsi, near52High, lastTradeDate, patternCount } = stock;
  const isUp = change >= 0;
  const rec = recommendation || { action: 'WATCH', color: '#ffd740' };

  return (
    <div
      onClick={() => onClick(stock)}
      className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-slate-500 transition-all hover:bg-slate-800"
      style={{ borderLeft: `3px solid ${rec.color}` }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-lg">{symbol}</span>
            {near52High && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">52W High</span>
            )}
            {lastTradeDate && (
              <span className="text-xs text-slate-500">{lastTradeDate}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-300 text-sm">₹{ltp?.toFixed(2)}</span>
            <span className={`text-sm flex items-center gap-0.5 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-xs font-bold px-2 py-1 rounded"
            style={{ backgroundColor: rec.color + '22', color: rec.color }}
          >
            {rec.action}
          </div>
          <div className="text-2xl font-bold mt-1" style={{ color: scoreColor(scores?.composite) }}>
            {scores?.composite}
          </div>
        </div>
      </div>

      {/* Score bars */}
      <div className="mb-3">
        <ScoreBar label="Safety"      value={scores?.safety}      color="#00c853" />
        <ScoreBar label="Chart"       value={scores?.chart}       color="#f59e0b" />
        <ScoreBar label="Volume"      value={scores?.volume}      color="#0ea5e9" />
        <ScoreBar label="Fundamental" value={scores?.fundamental} color="#10b981" />
      </div>

      {/* RSI + Pattern count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Activity size={12} className="text-slate-400" />
            <span className="text-xs text-slate-400">RSI:</span>
            <span className={`text-xs font-medium ${rsi > 70 ? 'text-red-400' : rsi < 30 ? 'text-green-400' : 'text-slate-300'}`}>
              {rsi}
            </span>
          </div>
          {patternCount > 0 && (
            <div className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-400" />
              <span className="text-xs text-green-400">{patternCount} pattern{patternCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {(patterns || []).slice(0, 2).map((p, i) => (
            <span key={i} className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
              {p.name}
            </span>
          ))}
        </div>
      </div>

      {/* OI Signals */}
      {oiSignals?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {oiSignals.slice(0, 2).map((s, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: s.bullish ? '#00c85322' : '#ff525222',
                color: s.bullish ? '#00c853' : '#ff5252',
              }}
            >
              {s.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
