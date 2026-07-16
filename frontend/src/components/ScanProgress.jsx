export default function ScanProgress({ progress, statusMsg }) {
  if (!progress && !statusMsg) return null;
  const pct = progress?.pct || 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-600 rounded-xl p-4 w-72 shadow-xl">
      <div className="flex justify-between text-xs mb-2">
        <span className="text-slate-300 font-medium">{progress?.phase || statusMsg || 'Scanning...'}</span>
        <span className="text-blue-400">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress?.current > 0 && (
        <div className="text-xs text-slate-500 mt-1.5">
          {progress.current} / {progress.total} stocks
        </div>
      )}
    </div>
  );
}
