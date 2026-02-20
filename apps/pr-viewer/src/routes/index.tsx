import { useSemaDiffExplorer } from "@semadiff/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../App.css";
import { getFileDiff, getPrSummary } from "../server/pr.server";
import type {
  FileDiffPayload,
  PrFileSummary,
  PrSummary,
  ServerError,
} from "../shared/types";

interface SearchParams {
  pr?: string;
}

const formatPercent = (value?: number) =>
  typeof value === "number" ? `${value}%` : "—";

const getToggleClass = (active: boolean) =>
  active ? "sd-toggle sd-toggle--active" : "sd-toggle";

const getFileRowClass = (active: boolean) =>
  active ? "sd-file-row sd-file-row--active" : "sd-file-row";

const getDiffEmptyMessage = (file: PrFileSummary) => {
  if (file.binary) {
    return "Binary file detected; semantic diff skipped.";
  }
  if (file.oversized) {
    return "File too large for semantic diff (over 1MB).";
  }
  return "No changes detected.";
};

const FIRST_CHANGED_LINE_SELECTOR =
  ".sd-line--insert, .sd-line--delete, .sd-line--replace, .sd-line--move";

export const findFirstChangedLine = (doc: Document | null) =>
  doc?.querySelector(FIRST_CHANGED_LINE_SELECTOR) ?? null;

export const scrollDiffDocumentToFirstChange = (doc: Document | null) => {
  const firstChanged = findFirstChangedLine(doc);
  if (!firstChanged) {
    return false;
  }
  firstChanged.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
};

export const focusFirstDiffChange = (iframe: HTMLIFrameElement | null) => {
  if (!iframe) {
    return false;
  }
  return scrollDiffDocumentToFirstChange(
    iframe.contentDocument ?? iframe.contentWindow?.document ?? null
  );
};

interface ToggleButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

interface ChangeTotalsProps {
  additions: number;
  deletions: number;
}

interface HeaderProps {
  input: string;
  onInputChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  summaryLoading: boolean;
  summary: PrSummary | null;
  summaryError: ServerError | null;
}

interface FilePanelProps {
  summary: PrSummary | null;
  filteredFiles: PrFileSummary[];
  fileFilter: string;
  onFileFilterChange: (next: string) => void;
  selectedFile: string | null;
  onSelectFile: (filename: string) => void;
}

interface DiffPanelHeaderProps {
  summary: PrSummary | null;
  selectedSummary: PrFileSummary | null;
  selectedFile: string | null;
  lineLayout: "split" | "unified";
  hideComments: boolean;
  compareMoves: boolean;
  onRefresh: () => void;
  onLineLayoutChange: (layout: "split" | "unified") => void;
  onHideCommentsChange: (value: boolean) => void;
  onCompareMovesChange: (value: boolean) => void;
}

interface DiffPanelBodyProps {
  diffLoading: boolean;
  diffError: ServerError | null;
  diffData: FileDiffPayload | null;
  diffHtml: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

interface DiffPanelProps extends DiffPanelHeaderProps, DiffPanelBodyProps {}

function ToggleButton({
  active = false,
  disabled = false,
  onClick,
  children,
}: ToggleButtonProps) {
  return (
    <button
      className={getToggleClass(active)}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ChangeTotals({ additions, deletions }: ChangeTotalsProps) {
  return (
    <span className="sd-counts" data-testid="change-totals">
      <span className="sd-count sd-count--add">+{additions}</span>
      <span className="sd-count sd-count--del">-{deletions}</span>
    </span>
  );
}

function Header({
  input,
  onInputChange,
  onSubmit,
  summaryLoading,
  summary,
  summaryError,
}: HeaderProps) {
  return (
    <header className="sd-topbar">
      <div className="sd-topbar-inner">
        <div className="sd-brand">
          <span className="sd-badge">SemaDiff</span>
          <div className="sd-title">PR Diff Explorer</div>
        </div>
        <form className="sd-input-row" onSubmit={onSubmit}>
          <input
            className="sd-input"
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            value={input}
          />
          <button className="sd-button" type="submit">
            Analyze PR
          </button>
        </form>
      </div>
      {summaryLoading && (
        <div className="sd-inline-meta">Loading PR summary…</div>
      )}
      {summary && !summaryLoading && (
        <div className="sd-inline-meta">
          <span>{summary.pr.title}</span>
          <ChangeTotals
            additions={summary.pr.additions}
            deletions={summary.pr.deletions}
          />
          <span>{summary.pr.changedFiles} files</span>
          <a href={summary.pr.url} rel="noreferrer" target="_blank">
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
  );
}

function FilePanel({
  summary,
  filteredFiles,
  fileFilter,
  onFileFilterChange,
  selectedFile,
  onSelectFile,
}: FilePanelProps) {
  return (
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
            onChange={(event) => onFileFilterChange(event.target.value)}
            placeholder="Filter files"
            value={fileFilter}
          />
        </div>
      </div>
      <div className="sd-file-list">
        {!summary && (
          <div className="sd-empty">Paste a PR link to load file diffs.</div>
        )}
        {summary && filteredFiles.length === 0 && (
          <div className="sd-empty">No files match that filter.</div>
        )}
        {filteredFiles.map((file) => {
          const percent = formatPercent(file.reductionPercent);
          const isActive = selectedFile === file.filename;
          return (
            <button
              className={getFileRowClass(isActive)}
              key={file.filename}
              onClick={() => onSelectFile(file.filename)}
              type="button"
            >
              <div className="sd-file-name">{file.filename}</div>
              <div className="sd-file-meta">
                <span className={`sd-status sd-status--${file.status}`}>
                  {file.status}
                </span>
                <ChangeTotals
                  additions={file.additions}
                  deletions={file.deletions}
                />
                <span>{percent}</span>
              </div>
              <div className="sd-bar">
                <div
                  className="sd-bar-fill"
                  style={{
                    width: file.reductionPercent
                      ? `${file.reductionPercent}%`
                      : "0%",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function DiffPanelHeader({
  summary,
  selectedSummary,
  selectedFile,
  lineLayout,
  hideComments,
  compareMoves,
  onRefresh,
  onLineLayoutChange,
  onHideCommentsChange,
  onCompareMovesChange,
}: DiffPanelHeaderProps) {
  return (
    <div className="sd-panel-header">
      <div className="sd-panel-title">{selectedFile ?? "Diff Viewer"}</div>
      {selectedSummary && (
        <div className="sd-inline-meta">
          <ChangeTotals
            additions={selectedSummary.additions}
            deletions={selectedSummary.deletions}
          />
          {typeof selectedSummary.reductionPercent === "number" && (
            <span>{selectedSummary.reductionPercent}% smaller</span>
          )}
        </div>
      )}
      <div className="sd-diff-controls">
        {summary && selectedSummary && (
          <a
            className="sd-button sd-button--ghost"
            href={`${summary.pr.url}/files#diff-${selectedSummary.sha}`}
            rel="noreferrer"
            target="_blank"
          >
            Open on GitHub
          </a>
        )}
        <button
          className="sd-button sd-button--ghost"
          disabled={!summary}
          onClick={onRefresh}
          type="button"
        >
          Recompute
        </button>
        <div className="sd-control-group">
          <span className="sd-control-label">Comments</span>
          <ToggleButton
            active={!hideComments}
            onClick={() => onHideCommentsChange(false)}
          >
            Show
          </ToggleButton>
          <ToggleButton
            active={hideComments}
            onClick={() => onHideCommentsChange(true)}
          >
            Hide
          </ToggleButton>
        </div>
        <div className="sd-control-group">
          <span className="sd-control-label">Layout</span>
          <ToggleButton
            active={lineLayout === "unified"}
            onClick={() => onLineLayoutChange("unified")}
          >
            Unified
          </ToggleButton>
          <ToggleButton
            active={lineLayout === "split"}
            onClick={() => onLineLayoutChange("split")}
          >
            Split
          </ToggleButton>
        </div>
        <div className="sd-control-group">
          <span className="sd-control-label">Moves</span>
          <ToggleButton
            active={compareMoves}
            disabled={!summary}
            onClick={() => onCompareMovesChange(true)}
          >
            On
          </ToggleButton>
          <ToggleButton
            active={!compareMoves}
            disabled={!summary}
            onClick={() => onCompareMovesChange(false)}
          >
            Off
          </ToggleButton>
        </div>
      </div>
    </div>
  );
}

export function DiffPanelBody({
  diffLoading,
  diffError,
  diffData,
  diffHtml,
  iframeRef,
}: DiffPanelBodyProps) {
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    const handleLoad = () => {
      focusFirstDiffChange(iframe);
    };
    iframe.addEventListener("load", handleLoad);
    handleLoad();
    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [iframeRef]);

  const warnings = diffData?.file.warnings ?? [];
  const warningBanner =
    warnings.length > 0 ? (
      <div className="sd-warning">
        <div className="sd-warning-title">Semantic Warning</div>
        <div className="sd-warning-body">
          {warnings.map((warning) => (
            <div className="sd-warning-item" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  let content: ReactNode = (
    <div className="sd-empty">Select a file to see its semantic diff.</div>
  );

  if (diffLoading) {
    content = <div className="sd-empty">Loading diff…</div>;
  } else if (diffError) {
    content = <div className="sd-empty">Error: {diffError.message}</div>;
  } else if (diffData && diffHtml) {
    content = (
      <iframe
        className="sd-diff-frame"
        ref={iframeRef}
        srcDoc={diffHtml}
        title={`diff-${diffData.file.filename}`}
      />
    );
  } else if (diffData) {
    content = (
      <div className="sd-empty">{getDiffEmptyMessage(diffData.file)}</div>
    );
  }

  return (
    <div className="sd-panel-body">
      {warningBanner}
      {content}
    </div>
  );
}

function DiffPanel({
  summary,
  selectedSummary,
  selectedFile,
  lineLayout,
  hideComments,
  compareMoves,
  onRefresh,
  onLineLayoutChange,
  onHideCommentsChange,
  onCompareMovesChange,
  diffLoading,
  diffError,
  diffData,
  diffHtml,
  iframeRef,
}: DiffPanelProps) {
  return (
    <section className="sd-panel">
      <DiffPanelHeader
        compareMoves={compareMoves}
        hideComments={hideComments}
        lineLayout={lineLayout}
        onCompareMovesChange={onCompareMovesChange}
        onHideCommentsChange={onHideCommentsChange}
        onLineLayoutChange={onLineLayoutChange}
        onRefresh={onRefresh}
        selectedFile={selectedFile}
        selectedSummary={selectedSummary}
        summary={summary}
      />
      <DiffPanelBody
        diffData={diffData}
        diffError={diffError}
        diffHtml={diffHtml}
        diffLoading={diffLoading}
        iframeRef={iframeRef}
      />
    </section>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    pr: typeof search.pr === "string" ? search.pr : undefined,
  }),
  component: App,
});

function App() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [input, setInput] = useState(search.pr ?? "");
  const client = useMemo(
    () => ({
      getPrSummary: (payload: { prUrl: string }) =>
        getPrSummary({ data: payload }),
      getFileDiff: (
        payload: {
          prUrl: string;
          filename: string;
          contextLines?: number;
          lineLayout?: "split" | "unified";
          lineMode?: "semantic" | "raw";
          hideComments?: boolean;
          detectMoves?: boolean;
        },
        request?: { signal?: AbortSignal }
      ) => getFileDiff({ data: payload, signal: request?.signal }),
    }),
    []
  );

  const {
    summary,
    summaryLoading,
    summaryError,
    selectedSummary,
    filteredFiles,
    fileFilter,
    setFileFilter,
    selectedFile,
    setSelectedFile,
    diffData,
    diffError,
    diffLoading,
    diffHtml,
    lineLayout,
    setLineLayout,
    hideComments,
    setHideComments,
    compareMoves,
    setCompareMoves,
    refresh,
  } = useSemaDiffExplorer({
    client,
    prUrl: search.pr,
    contextLines: -1,
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    navigate({ search: { pr: input.trim() } });
  };

  return (
    <div className="sd-app">
      <Header
        input={input}
        onInputChange={(next) => setInput(next)}
        onSubmit={handleSubmit}
        summary={summary}
        summaryError={summaryError}
        summaryLoading={summaryLoading}
      />

      <main className="sd-main">
        <FilePanel
          fileFilter={fileFilter}
          filteredFiles={filteredFiles}
          onFileFilterChange={(next) => setFileFilter(next)}
          onSelectFile={(filename) => setSelectedFile(filename)}
          selectedFile={selectedFile}
          summary={summary}
        />
        <DiffPanel
          compareMoves={compareMoves}
          diffData={diffData}
          diffError={diffError}
          diffHtml={diffHtml ?? null}
          diffLoading={diffLoading}
          hideComments={hideComments}
          iframeRef={iframeRef}
          lineLayout={lineLayout}
          onCompareMovesChange={(next) => setCompareMoves(next)}
          onHideCommentsChange={setHideComments}
          onLineLayoutChange={(next) => setLineLayout(next)}
          onRefresh={refresh}
          selectedFile={selectedFile}
          selectedSummary={selectedSummary ?? null}
          summary={summary}
        />
      </main>
    </div>
  );
}
