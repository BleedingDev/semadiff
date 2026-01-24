import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import '../App.css'
import type {
  AuthStatus,
  FileDiffPayload,
  PrFileSummary,
  PrSummary,
  ServerResult,
} from '../shared/types'
import { getAuthStatus, getFileDiff, getPrSummary } from '../server/pr.server'

type SearchParams = {
  pr?: string
}

const NAVIGATION_SCRIPT = `
<script>
(function () {
  const selector = '.sd-line--insert, .sd-line--delete, .sd-line--replace, .sd-line--move';
  const MAX_MARKERS = 2000;
  const MINIMAP_ID = 'sd-minimap';
  const STYLE_ID = 'sd-minimap-style';

  function getChanges() {
    return Array.from(document.querySelectorAll(selector));
  }

  function getType(el) {
    if (el.classList.contains('sd-line--insert')) return 'insert';
    if (el.classList.contains('sd-line--delete')) return 'delete';
    if (el.classList.contains('sd-line--replace')) return 'replace';
    if (el.classList.contains('sd-line--move')) return 'move';
    return 'replace';
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      #\${MINIMAP_ID} {
        position: fixed;
        top: 16px;
        right: 10px;
        width: 12px;
        height: calc(100% - 32px);
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(148, 163, 184, 0.4);
        border-radius: 999px;
        padding: 4px 2px;
        z-index: 9999;
        box-sizing: border-box;
      }
      #\${MINIMAP_ID} .sd-minimap-track {
        position: relative;
        width: 100%;
        height: 100%;
      }
      #\${MINIMAP_ID} .sd-minimap-markers {
        position: absolute;
        inset: 0;
      }
      #\${MINIMAP_ID} .sd-minimap-tick {
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        opacity: 0.85;
        border-radius: 2px;
      }
      #\${MINIMAP_ID} .sd-minimap-tick--insert { background: #34d399; }
      #\${MINIMAP_ID} .sd-minimap-tick--delete { background: #f87171; }
      #\${MINIMAP_ID} .sd-minimap-tick--replace { background: #fbbf24; }
      #\${MINIMAP_ID} .sd-minimap-tick--move { background: #60a5fa; }
      #\${MINIMAP_ID} .sd-minimap-viewport {
        position: absolute;
        left: 0;
        right: 0;
        border: 1px solid rgba(45, 212, 191, 0.9);
        background: rgba(45, 212, 191, 0.12);
        border-radius: 4px;
        pointer-events: none;
      }
      @media (max-width: 960px) {
        #\${MINIMAP_ID} { display: none !important; }
      }
    \`;
    document.head.appendChild(style);
  }

  function scrollToEl(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function findNext(direction) {
    const items = getChanges();
    if (!items.length) return null;
    const viewportTop = window.scrollY + 8;
    const positions = items.map((el) => ({
      el,
      top: el.getBoundingClientRect().top + window.scrollY,
    }));
    if (direction === 'prev') {
      for (let i = positions.length - 1; i >= 0; i -= 1) {
        if (positions[i].top < viewportTop) return positions[i].el;
      }
      return positions[positions.length - 1].el;
    }
    for (const item of positions) {
      if (item.top > viewportTop) return item.el;
    }
    return positions[0].el;
  }

  let minimapState = null;
  let renderScheduled = false;
  let minimapEnabled = true;

  function buildMinimap() {
    ensureStyles();
    let minimap = document.getElementById(MINIMAP_ID);
    if (!minimap) {
      minimap = document.createElement('div');
      minimap.id = MINIMAP_ID;
      minimap.innerHTML =
        '<div class="sd-minimap-track"><div class="sd-minimap-markers"></div><div class="sd-minimap-viewport"></div></div>';
      document.body.appendChild(minimap);
      minimap.addEventListener('click', (event) => {
        const rect = minimap.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / rect.height;
        const scrollHeight = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        window.scrollTo({
          top: Math.max(0, ratio * scrollHeight),
          behavior: 'smooth',
        });
      });
    }
    const markers = minimap.querySelector('.sd-minimap-markers');
    const viewport = minimap.querySelector('.sd-minimap-viewport');
    if (!markers || !viewport) return null;
    return { minimap, markers, viewport };
  }

  function renderMarkers() {
    if (!minimapEnabled) {
      if (minimapState && minimapState.minimap) {
        minimapState.minimap.style.display = 'none';
      }
      return;
    }
    if (!minimapState) return;
    const { minimap, markers, viewport } = minimapState;
    const items = getChanges();
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollable = scrollHeight - window.innerHeight;
    if (!items.length || scrollable <= 0) {
      minimap.style.display = 'none';
      return;
    }
    minimap.style.display = '';
    markers.innerHTML = '';
    const trackHeight = minimap.clientHeight;
    const step = Math.max(1, Math.ceil(items.length / MAX_MARKERS));
    for (let i = 0; i < items.length; i += step) {
      const item = items[i];
      const top = item.getBoundingClientRect().top + window.scrollY;
      const ratio = Math.min(1, Math.max(0, top / scrollable));
      const tick = document.createElement('div');
      tick.className = \`sd-minimap-tick sd-minimap-tick--\${getType(item)}\`;
      tick.style.top = \`\${ratio * (trackHeight - 2)}px\`;
      markers.appendChild(tick);
    }
    updateViewport(minimap, viewport, scrollable, trackHeight);
  }

  function updateViewport(minimap, viewport, scrollable, trackHeight) {
    const heightRatio = window.innerHeight / document.documentElement.scrollHeight;
    const viewportHeight = Math.max(18, heightRatio * trackHeight);
    const scrollRatio = Math.max(0, window.scrollY / scrollable);
    viewport.style.height = \`\${viewportHeight}px\`;
    viewport.style.top = \`\${scrollRatio * (trackHeight - viewportHeight)}px\`;
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      minimapState = buildMinimap();
      renderMarkers();
    });
  }

  window.addEventListener('scroll', () => {
    if (!minimapEnabled || !minimapState) return;
    const { minimap, viewport } = minimapState;
    const scrollable = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const trackHeight = minimap.clientHeight;
    updateViewport(minimap, viewport, scrollable, trackHeight);
  }, { passive: true });

  window.addEventListener('resize', scheduleRender);
  scheduleRender();

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'semadiff:navigate') return;
    const dir = data.direction === 'prev' ? 'prev' : 'next';
    scrollToEl(findNext(dir));
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'semadiff:minimap') return;
    minimapEnabled = data.enabled !== false;
    if (!minimapEnabled) {
      if (minimapState && minimapState.minimap) {
        minimapState.minimap.style.display = 'none';
      }
      return;
    }
    scheduleRender();
  });
})();
</script>
`;

const injectNavigation = (html: string) => {
  if (!html || html.includes('semadiff:navigate')) {
    return html;
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${NAVIGATION_SCRIPT}</body>`);
  }
  return `${html}${NAVIGATION_SCRIPT}`;
};

const formatPercent = (value?: number) =>
  typeof value === 'number' ? `${value}%` : '—'

const formatStatus = (file: PrFileSummary) =>
  `${file.additions}+ / ${file.deletions}-`

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    pr: typeof search.pr === 'string' ? search.pr : undefined,
  }),
  component: App,
})

function App() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [summaryResult, setSummaryResult] =
    useState<ServerResult<PrSummary> | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [authResult, setAuthResult] =
    useState<ServerResult<AuthStatus> | null>(null)

  const [input, setInput] = useState(search.pr ?? '')
  const [fileFilter, setFileFilter] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffCache, setDiffCache] = useState<
    Record<string, ServerResult<FileDiffPayload>>
  >({})
  const [prefetchState, setPrefetchState] = useState({
    active: false,
    loaded: 0,
    total: 0,
  })
  const [view, setView] = useState<'semantic' | 'lines'>('semantic')
  const [lineLayout, setLineLayout] = useState<'split' | 'unified'>('split')
  const [lineContextLines, setLineContextLines] = useState(3)
  const [refreshToken, setRefreshToken] = useState(0)
  const [minimapEnabled, setMinimapEnabled] = useState(true)
  const [compareMoves, setCompareMoves] = useState(true)

  const summary = summaryResult?.ok ? summaryResult.data : null
  const summaryError =
    summaryResult && !summaryResult.ok ? summaryResult.error : null
  const authStatus = authResult?.ok ? authResult.data : null
  const authError = authResult && !authResult.ok ? authResult.error : null
  const selectedSummary = summary?.files.find(
    (file) => file.filename === selectedFile,
  )

  const filteredFiles = useMemo(() => {
    if (!summary) return []
    const query = fileFilter.trim().toLowerCase()
    if (!query) return summary.files
    return summary.files.filter((file) => {
      const filenameMatch = file.filename.toLowerCase().includes(query)
      const previousMatch = file.previousFilename
        ? file.previousFilename.toLowerCase().includes(query)
        : false
      return filenameMatch || previousMatch
    })
  }, [summary, fileFilter])

  useEffect(() => {
    let active = true
    getAuthStatus()
      .then((result) => {
        if (active) {
          setAuthResult(result)
        }
      })
      .catch(() => {
        if (active) {
          setAuthResult({
            ok: false,
            error: {
              code: 'AuthStatusError',
              message: 'Failed to load auth status.',
            },
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!search.pr) {
      setSummaryResult(null)
      setSummaryLoading(false)
      return
    }
    let active = true
    setSummaryLoading(true)
    getPrSummary({ data: { prUrl: search.pr } })
      .then((result) => {
        if (active) {
          setSummaryResult(result)
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [search.pr])

  useEffect(() => {
    if (!summary?.files.length) {
      setSelectedFile(null)
      return
    }
    setSelectedFile((current) => {
      if (current && summary.files.find((file) => file.filename === current)) {
        return current
      }
      return summary.files[0]?.filename ?? null
    })
  }, [summary?.files])

  useEffect(() => {
    if (!summary || !fileFilter.trim()) {
      return
    }
    if (!filteredFiles.length) {
      setSelectedFile(null)
      return
    }
    if (selectedFile && filteredFiles.some((file) => file.filename === selectedFile)) {
      return
    }
    setSelectedFile(filteredFiles[0]?.filename ?? null)
  }, [fileFilter, filteredFiles, selectedFile, summary])

  useEffect(() => {
    if (!summary || !search.pr) {
      setDiffCache({})
      setPrefetchState({ active: false, loaded: 0, total: 0 })
      return
    }

    let active = true
    const controllers = new Map<string, AbortController>()
    const files = summary.files.map((file) => file.filename)
    const total = files.length
    const concurrency = Math.max(1, files.length)
    let index = 0
    let inFlight = 0
    let loaded = 0

    setDiffCache({})
    setPrefetchState({ active: true, loaded: 0, total })

    const runNext = () => {
      if (!active) {
        return
      }
      while (inFlight < concurrency && index < files.length) {
        const filename = files[index]
        index += 1
        inFlight += 1

        const controller = new AbortController()
        controllers.set(filename, controller)

        getFileDiff({
          data: {
            prUrl: search.pr,
            filename,
            contextLines: lineContextLines,
            lineLayout,
            detectMoves: compareMoves,
          },
          signal: controller.signal,
        })
          .then((result) => {
            if (!active) {
              return
            }
            setDiffCache((prev) => ({ ...prev, [filename]: result }))
          })
          .finally(() => {
            if (!active) {
              return
            }
            loaded += 1
            inFlight -= 1
            setPrefetchState((prev) => ({
              ...prev,
              loaded,
              active: loaded < total,
            }))
            if (index >= files.length && inFlight === 0) {
              setPrefetchState((prev) => ({ ...prev, active: false }))
              return
            }
            runNext()
          })
      }
    }

    runNext()

    return () => {
      active = false
      controllers.forEach((controller) => controller.abort())
      setPrefetchState((prev) => ({ ...prev, active: false }))
    }
  }, [summary, search.pr, lineLayout, lineContextLines, refreshToken, compareMoves])

  const aggregate = useMemo(() => {
    if (!summary) {
      return { percent: null as number | null, totalOps: 0, totalLines: 0 }
    }
    const hasOps = summary.files.every(
      (file) => typeof file.operations === 'number',
    )
    const totalOps = summary.files.reduce(
      (sum, file) =>
        sum + (typeof file.operations === 'number' ? file.operations : 0),
      0,
    )
    const totalLines = summary.files.reduce(
      (sum, file) => sum + file.additions + file.deletions,
      0,
    )
    if (!hasOps || totalLines === 0) {
      return { percent: null, totalOps, totalLines }
    }
    const percent = Math.round((1 - totalOps / totalLines) * 100)
    return { percent: Math.max(0, percent), totalOps, totalLines }
  }, [summary])

  const diffResult = selectedFile ? diffCache[selectedFile] ?? null : null
  const diffData = diffResult?.ok ? diffResult.data : null
  const diffError = diffResult && !diffResult.ok ? diffResult.error : null
  const diffLoading =
    !!selectedFile &&
    (!diffResult || (prefetchState.active && !diffCache[selectedFile]))
  const diffHtmlRaw =
    diffData && view === 'semantic' ? diffData.semanticHtml : diffData?.linesHtml
  const diffHtml = diffHtmlRaw ? injectNavigation(diffHtmlRaw) : diffHtmlRaw

  const hasDiff = Boolean(diffHtml)

  const sendNavigate = (direction: 'next' | 'prev') => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'semadiff:navigate', direction },
      '*',
    )
  }

  const sendMinimapState = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'semadiff:minimap', enabled: minimapEnabled },
      '*',
    )
  }

  useEffect(() => {
    if (!diffHtml) return
    sendMinimapState()
  }, [diffHtml, minimapEnabled])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim()) {
      return
    }
    navigate({ search: { pr: input.trim() } })
  }

  return (
    <div className="sd-app">
      <header className="sd-topbar">
        <div className="sd-topbar-inner">
          <div className="sd-brand">
            <span className="sd-badge">SemaDiff</span>
            <div className="sd-title">PR Diff Explorer</div>
          </div>
          <form className="sd-input-row" onSubmit={handleSubmit}>
            <input
              className="sd-input"
              placeholder="https://github.com/owner/repo/pull/123"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="sd-button" type="submit">
              Analyze PR
            </button>
          </form>
        </div>
        {authStatus && (
          <div className="sd-inline-meta">
            GitHub token {authStatus.hasToken ? 'detected' : 'missing'}
          </div>
        )}
        {authError && (
          <div className="sd-inline-meta sd-inline-meta--error">
            {authError.message}
          </div>
        )}
        {summaryLoading && (
          <div className="sd-inline-meta">Loading PR summary…</div>
        )}
        {!summaryLoading && prefetchState.total > 0 && (
          <div className="sd-inline-meta">
            Prefetching diffs {prefetchState.loaded}/{prefetchState.total}
          </div>
        )}
        {summary && !summaryLoading && (
          <div className="sd-inline-meta">
            <span>{summary.pr.title}</span>
            <span>
              {summary.pr.additions}+ / {summary.pr.deletions}- ·{' '}
              {summary.pr.changedFiles} files
            </span>
            <span>
              {typeof aggregate.percent === 'number'
                ? `${aggregate.percent}% smaller`
                : 'Reduction —'}
            </span>
            <a href={summary.pr.url} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          </div>
        )}
        {summaryError && !summaryLoading && (
          <div className="sd-inline-meta sd-inline-meta--error">
            Error: {summaryError.message}
          </div>
        )}
      </header>

      <main className="sd-main">
        <aside className="sd-panel">
          <div className="sd-panel-header">
            <div className="sd-panel-header-main">
              <div className="sd-panel-title">Changed Files</div>
              {summary && (
                <div className="sd-inline-meta">
                  {filteredFiles.length}/{summary.files.length} files
                </div>
              )}
            </div>
            <div className="sd-panel-header-actions">
              <input
                className="sd-input sd-input--compact sd-input--search"
                placeholder="Filter files"
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
              />
            </div>
          </div>
          <div className="sd-file-list">
            {!summary && (
              <div className="sd-empty">
                Paste a PR link to load file diffs.
              </div>
            )}
            {summary && filteredFiles.length === 0 && (
              <div className="sd-empty">No files match that filter.</div>
            )}
            {filteredFiles.map((file) => {
              const percent = formatPercent(file.reductionPercent)
              const isActive = selectedFile === file.filename
              return (
                <div
                  key={file.filename}
                  className={`sd-file-row${isActive ? ' sd-file-row--active' : ''}`}
                  onClick={() => setSelectedFile(file.filename)}
                >
                  <div className="sd-file-name">{file.filename}</div>
                  <div className="sd-file-meta">
                    <span className={`sd-status sd-status--${file.status}`}>
                      {file.status}
                    </span>
                    <span>{formatStatus(file)}</span>
                    <span>{percent}</span>
                  </div>
                  <div className="sd-bar">
                    <div
                      className="sd-bar-fill"
                      style={{ width: file.reductionPercent ? `${file.reductionPercent}%` : '0%' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <section className="sd-panel">
          <div className="sd-panel-header">
            <div className="sd-panel-title">
              {selectedFile ?? 'Diff Viewer'}
            </div>
            {selectedSummary && (
              <div className="sd-inline-meta">
                <span>
                  {selectedSummary.additions}+ / {selectedSummary.deletions}-
                </span>
                {typeof selectedSummary.reductionPercent === 'number' && (
                  <span>{selectedSummary.reductionPercent}% smaller</span>
                )}
              </div>
            )}
            <div className="sd-diff-controls">
              {summary && selectedSummary && (
                <a
                  className="sd-button sd-button--ghost"
                  href={`${summary.pr.url}/files#diff-${selectedSummary.sha}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on GitHub
                </a>
              )}
              <button
                className="sd-button sd-button--ghost"
                onClick={() => setRefreshToken((value) => value + 1)}
                type="button"
                disabled={!summary}
              >
                Recompute
              </button>
              <button
                className={`sd-toggle${view === 'semantic' ? ' sd-toggle--active' : ''}`}
                onClick={() => setView('semantic')}
                type="button"
              >
                Semantic
              </button>
              <button
                className={`sd-toggle${view === 'lines' ? ' sd-toggle--active' : ''}`}
                onClick={() => setView('lines')}
                type="button"
              >
                Lines
              </button>
              <>
                <button
                  className={`sd-toggle${lineLayout === 'split' ? ' sd-toggle--active' : ''}`}
                  onClick={() => setLineLayout('split')}
                  type="button"
                >
                  Split
                </button>
                <button
                  className={`sd-toggle${lineLayout === 'unified' ? ' sd-toggle--active' : ''}`}
                  onClick={() => setLineLayout('unified')}
                  type="button"
                >
                  Unified
                </button>
              </>
              <div className="sd-control-group">
                <span className="sd-control-label">Context</span>
                <button
                  className={`sd-toggle${lineContextLines === 0 ? ' sd-toggle--active' : ''}`}
                  onClick={() => setLineContextLines(0)}
                  type="button"
                >
                  Collapse
                </button>
                <button
                  className={`sd-toggle${lineContextLines === 3 ? ' sd-toggle--active' : ''}`}
                  onClick={() => setLineContextLines(3)}
                  type="button"
                >
                  Default
                </button>
                <button
                  className={`sd-toggle${lineContextLines === 10 ? ' sd-toggle--active' : ''}`}
                  onClick={() => setLineContextLines(10)}
                  type="button"
                >
                  Expand
                </button>
              </div>
              <div className="sd-control-group">
                <span className="sd-control-label">Changes</span>
                <button
                  className="sd-toggle"
                  onClick={() => sendNavigate('prev')}
                  type="button"
                  disabled={!hasDiff}
                >
                  Prev
                </button>
                <button
                  className="sd-toggle"
                  onClick={() => sendNavigate('next')}
                  type="button"
                  disabled={!hasDiff}
                >
                  Next
                </button>
              </div>
              <div className="sd-control-group">
                <span className="sd-control-label">Minimap</span>
                <button
                  className={`sd-toggle${minimapEnabled ? ' sd-toggle--active' : ''}`}
                  onClick={() => setMinimapEnabled((value) => !value)}
                  type="button"
                  disabled={!hasDiff}
                >
                  {minimapEnabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="sd-control-group">
                <span className="sd-control-label">Moves</span>
                <button
                  className={`sd-toggle${compareMoves ? ' sd-toggle--active' : ''}`}
                  onClick={() => setCompareMoves(true)}
                  type="button"
                  disabled={!summary}
                >
                  On
                </button>
                <button
                  className={`sd-toggle${!compareMoves ? ' sd-toggle--active' : ''}`}
                  onClick={() => setCompareMoves(false)}
                  type="button"
                  disabled={!summary}
                >
                  Off
                </button>
              </div>
            </div>
          </div>
          <div className="sd-panel-body">
            {diffLoading && <div className="sd-empty">Loading diff…</div>}
            {!diffLoading && diffError && (
              <div className="sd-empty">Error: {diffError.message}</div>
            )}
            {!diffLoading && diffData && diffHtml && (
              <>
                {view === 'lines' && (
                  <div className="sd-review-card">
                    <div className="sd-review-title">
                      Review changes with <span className="sd-review-badge">SemaDiff</span>
                    </div>
                    {typeof diffData.file.reductionPercent === 'number' && (
                      <div className="sd-review-metric">
                        <span className="sd-review-percent">
                          {diffData.file.reductionPercent}%
                        </span>
                        <span className="sd-review-label">smaller</span>
                      </div>
                    )}
                  </div>
                )}
                <iframe
                  className="sd-diff-frame"
                  title={`diff-${diffData.file.filename}`}
                  srcDoc={diffHtml}
                  ref={iframeRef}
                  onLoad={sendMinimapState}
                />
              </>
            )}
            {!diffLoading && diffData && !diffHtml && (
              <div className="sd-empty">
                {diffData.file.binary
                  ? 'Binary file detected; semantic diff skipped.'
                  : diffData.file.oversized
                    ? 'File too large for semantic diff (over 1MB).'
                    : 'No semantic changes detected.'}
              </div>
            )}
            {!diffLoading && !diffData && (
              <div className="sd-empty">
                Select a file to see its semantic diff.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
