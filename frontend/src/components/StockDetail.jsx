import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function StockDetail({ stock, onClose }) {
  if (!stock) return null;
  const { symbol, ltp, change, scores, patterns, oiSignals, rsi, macd, recommendation, near52High, volume, openInterest, oiChange } = stock;
  const isUp = change >= 0;
  const rec = recommendation || { action: 'WATCH', color: '#ffd740' };

  const radarData = [
    { subject: 'OI', value: scores?.oi || 0 },
    { subject: 'Volume', value: scores?.volume || 0 },
    { subject: 'Chart', value: scores?.chart || 0 },
    { subject: 'Fundamental', value: scores?.fundamental || 0 },
    { subject: 'Composite', value: scores?.composite || 0 },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{symbol}</h2>
              {near52High && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">52W High</span>}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xl text-slate-200">₹{ltp?.toFixed(2)}</span>
              <span className={`flex items-center gap-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {change?.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: rec.color }}>{scores?.composite}</div>
              <div className="text-xs px-2 py-0.5 rounded mt-1" style={{ backgroundColor: rec.color + '22', color: rec.color }}>
                {rec.action}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Radar dataKey="value" stroke={rec.color} fill={rec.color} fillOpacity={0.2} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'RSI', value: rsi, color: rsi > 70 ? '#ff5252' : rsi < 30 ? '#00c853' : '#94a3b8' },
            { label: 'MACD', value: macd?.macd?.toFixed(2), color: macd?.macd > 0 ? '#00c853' : '#ff5252' },
            { label: 'Volume', value: volume ? (volume / 1e6).toFixed(1) + 'M' : '-', color: '#0ea5e9' },
            { label: 'OI', value: openInterest ? (openInterest / 1e6).toFixed(1) + 'M' : '-', color: '#7c3aed' },
            { label: 'OI Change', value: oiChange ? (oiChange > 0 ? '+' : '') + (oiChange / 1e3).toFixed(0) + 'K' : '-', color: oiChange > 0 ? '#00c853' : '#ff5252' },
            { label: 'Score', value: scores?.composite, color: rec.color },
          ].map((item, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">{item.label}</div>
              <div className="font-bold" style={{ color: item.color }}>{item.value ?? '-'}</div>
            </div>
          ))}
        </div>

        {/* Chart Patterns */}
        {patterns?.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-slate-400 mb-2">Chart Patterns</div>
            <div className="flex flex-wrap gap-2">
              {patterns.map((p, i) => (
                <div key={i} className="bg-slate-800 rounded-lg px-3 py-2">
                  <div className="text-sm text-white">{p.name}</div>
                  <div className="text-xs text-green-400">{p.signal} · Strength: {p.strength}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OI Signals */}
        {oiSignals?.length > 0 && (
          <div>
            <div className="text-sm text-slate-400 mb-2">OI Signals</div>
            <div className="space-y-2">
              {oiSignals.map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.bullish ? '#00c853' : '#ff5252' }} />
                  <div>
                    <div className="text-sm text-white">{s.type}</div>
                    <div className="text-xs text-slate-400">{s.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
