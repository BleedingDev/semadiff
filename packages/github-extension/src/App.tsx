const items = [
  { label: "Insert", color: "bg-diff-add" },
  { label: "Delete", color: "bg-diff-delete" },
  { label: "Update", color: "bg-diff-update" },
  { label: "Move", color: "bg-diff-move" },
];

export function App() {
  return (
    <div className="min-h-screen px-8 py-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4">
          <p className="text-slate-400 text-xs uppercase tracking-[0.3em]">
            SemaDiff Extension
          </p>
          <h1 className="font-semibold text-4xl text-white">
            Semantic Diff Overlay
          </h1>
          <p className="max-w-2xl text-slate-300">
            Preview shell for the overlay UI. This verifies the React + Vite +
            Tailwind pipeline used by the extension surface.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-diff-glow">
            <h2 className="font-semibold text-lg text-white">Diff Tokens</h2>
            <p className="mt-2 text-slate-400 text-sm">
              Tailwind tokens for semantic operations.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"
                  key={item.label}
                >
                  <span className={`h-3 w-3 rounded-full ${item.color}`} />
                  <span className="text-slate-200 text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="font-semibold text-lg text-white">Status</h2>
            <ul className="mt-4 space-y-3 text-slate-300 text-sm">
              <li>Engine: awaiting parser registry</li>
              <li>Renderer: HTML scaffold ready</li>
              <li>Observability: spans and OTLP hooks pending</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
