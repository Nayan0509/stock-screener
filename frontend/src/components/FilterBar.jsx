export default function FilterBar({ filter, setFilter, sort, setSort }) {
  const actions = ['ALL', 'STRONG BUY', 'BUY', 'WATCH'];

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div className="flex gap-2 flex-wrap">
        {actions.map(a => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              filter === a
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="ml-auto">
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 outline-none"
        >
          <option value="composite">Sort: Composite Score</option>
          <option value="safety">Sort: Safety Score</option>
          <option value="patterns">Sort: Pattern Count</option>
          <option value="chart">Sort: Chart Score</option>
          <option value="volume">Sort: Volume Score</option>
          <option value="fundamental">Sort: Fundamental</option>
          <option value="change">Sort: % Change</option>
        </select>
      </div>
    </div>
  );
}
