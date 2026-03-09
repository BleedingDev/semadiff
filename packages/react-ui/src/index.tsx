import type {
  FileDiffPayload,
  FileReviewGuide,
  PrFileSummary,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-client";
import type {
  SemaDiffFileDiffClient,
  SemaDiffFileReviewGuideClient,
  SemaDiffReviewSummaryClient,
  SemaDiffSummaryClient,
} from "@semadiff/react";
import { useSemaDiffExplorer } from "@semadiff/react";
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

const formatPriorityLabel = (priority: string) =>
  priority
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const formatCategoryLabel = (category: string) =>
  category
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const formatActionLabel = (action: string) =>
  action
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

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
  summaryError: { message: string } | null;
  title?: string | undefined;
  inputPlaceholder?: string | undefined;
  submitLabel?: string | undefined;
}

interface FilePanelProps {
  summary: PrSummary | null;
  reviewSummary: PrReviewSummary | null;
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
  selectedFile: string | null;
  onSelectFile: (filename: string) => void;
  reviewSummary: PrReviewSummary | null;
  reviewSummaryLoading: boolean;
  reviewSummaryError: { message: string } | null;
  reviewGuideData: FileReviewGuide | null;
  reviewGuideError: { message: string } | null;
  reviewGuideLoading: boolean;
  diffLoading: boolean;
  diffError: { message: string } | null;
  diffData: FileDiffPayload | null;
  diffHtml: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

interface DiffPanelProps extends DiffPanelHeaderProps, DiffPanelBodyProps {}

export interface SemaDiffExplorerProps {
  client: SemaDiffSummaryClient &
    SemaDiffFileDiffClient &
    SemaDiffReviewSummaryClient &
    SemaDiffFileReviewGuideClient;
  prUrl?: string;
  onPrUrlSubmit?: (prUrl: string) => void;
  selectedFile?: string;
  onSelectedFileChange?: (filename: string | null) => void;
  contextLines?: number;
  title?: string;
  inputPlaceholder?: string;
  submitLabel?: string;
  className?: string;
  debugLogger?:
    | ((event: string, details: Record<string, unknown>) => void)
    | undefined;
}

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
  title,
  inputPlaceholder,
  submitLabel,
}: HeaderProps) {
  return (
    <header className="sd-topbar">
      <div className="sd-topbar-inner">
        <div className="sd-brand">
          <span className="sd-badge">SemaDiff</span>
          <div className="sd-title">{title ?? "PR Diff Explorer"}</div>
        </div>
        <form className="sd-input-row" onSubmit={onSubmit}>
          <input
            className="sd-input"
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={
              inputPlaceholder ?? "https://github.com/owner/repo/pull/123"
            }
            value={input}
          />
          <button className="sd-button" type="submit">
            {submitLabel ?? "Analyze PR"}
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
  reviewSummary,
  filteredFiles,
  fileFilter,
  onFileFilterChange,
  selectedFile,
  onSelectFile,
}: FilePanelProps) {
  const reviewEntries = useMemo(
    () =>
      new Map(
        [
          ...(reviewSummary?.queue ?? []),
          ...(reviewSummary?.deprioritized ?? []),
        ].map((entry) => [entry.filename, entry])
      ),
    [reviewSummary]
  );

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
        <div className="sd-panel-header-actions sd-panel-header-actions--search">
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
          const reviewEntry = reviewEntries.get(file.filename);
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
                {reviewEntry && (
                  <span
                    className={`sd-review-pill sd-review-pill--${reviewEntry.priority}`}
                  >
                    {formatPriorityLabel(reviewEntry.priority)}
                  </span>
                )}
                {reviewEntry && (
                  <span className="sd-review-pill sd-review-pill--category">
                    {formatCategoryLabel(
                      reviewEntry.classification.primaryCategory
                    )}
                  </span>
                )}
                <ChangeTotals
                  additions={file.additions}
                  deletions={file.deletions}
                />
                <span>{percent}</span>
              </div>
              {reviewEntry?.reasons[0] && (
                <div className="sd-file-review-copy">
                  {reviewEntry.reasons[0].message}
                </div>
              )}
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

function DiffPanelHeader({
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

function ReviewSummaryStrip({
  reviewSummary,
  reviewSummaryLoading,
  reviewSummaryError,
  selectedFile,
  onSelectFile,
}: {
  reviewSummary: PrReviewSummary | null;
  reviewSummaryLoading: boolean;
  reviewSummaryError: { message: string } | null;
  selectedFile: string | null;
  onSelectFile: (filename: string) => void;
}) {
  if (reviewSummaryLoading && !reviewSummary) {
    return (
      <section className="sd-review-card">
        <div className="sd-review-card-kicker">Review Queue</div>
        <div className="sd-review-card-copy">Building PR review guidance…</div>
      </section>
    );
  }

  if (reviewSummaryError) {
    return (
      <section className="sd-review-card sd-review-card--error">
        <div className="sd-review-card-kicker">Review Queue</div>
        <div className="sd-review-card-copy">
          Error loading review guidance: {reviewSummaryError.message}
        </div>
      </section>
    );
  }

  if (!reviewSummary) {
    return null;
  }

  return (
    <section className="sd-review-card">
      <div className="sd-review-card-header">
        <div>
          <div className="sd-review-card-kicker">Review Queue</div>
          <div className="sd-review-card-title">
            Start with the files carrying the highest review weight.
          </div>
        </div>
        <div className="sd-review-card-meta">
          {reviewSummary.queue.length} queued
        </div>
      </div>
      {reviewSummary.themes.length > 0 && (
        <div className="sd-review-card-copy">
          {reviewSummary.themes.join(" ")}
        </div>
      )}
      <div className="sd-review-chip-row">
        {reviewSummary.queue.slice(0, 4).map((entry) => (
          <button
            className={
              selectedFile === entry.filename
                ? "sd-review-chip sd-review-chip--active"
                : "sd-review-chip"
            }
            key={entry.filename}
            onClick={() => onSelectFile(entry.filename)}
            type="button"
          >
            <span
              className={`sd-review-pill sd-review-pill--${entry.priority}`}
            >
              {formatPriorityLabel(entry.priority)}
            </span>
            <span>{entry.filename}</span>
          </button>
        ))}
      </div>
      {reviewSummary.warnings.length > 0 && (
        <div className="sd-review-note">
          {reviewSummary.warnings.slice(0, 2).map((warning) => (
            <div className="sd-review-note-item" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewGuideCard({
  selectedFile,
  reviewGuideData,
  reviewGuideError,
  reviewGuideLoading,
}: {
  selectedFile: string | null;
  reviewGuideData: FileReviewGuide | null;
  reviewGuideError: { message: string } | null;
  reviewGuideLoading: boolean;
}) {
  if (!selectedFile) {
    return null;
  }

  if (reviewGuideLoading && !reviewGuideData) {
    return (
      <section className="sd-review-card">
        <div className="sd-review-card-kicker">File Guide</div>
        <div className="sd-review-card-copy">
          Loading review guide for {selectedFile}…
        </div>
      </section>
    );
  }

  if (reviewGuideError) {
    return (
      <section className="sd-review-card sd-review-card--error">
        <div className="sd-review-card-kicker">File Guide</div>
        <div className="sd-review-card-copy">
          Error loading file guidance: {reviewGuideError.message}
        </div>
      </section>
    );
  }

  if (!reviewGuideData) {
    return null;
  }

  return (
    <section className="sd-review-card">
      <div className="sd-review-card-header">
        <div>
          <div className="sd-review-card-kicker">File Guide</div>
          <div className="sd-review-card-title">{reviewGuideData.filename}</div>
        </div>
        <div className="sd-review-chip-row">
          <span
            className={`sd-review-pill sd-review-pill--${reviewGuideData.priority}`}
          >
            {formatPriorityLabel(reviewGuideData.priority)}
          </span>
          <span className="sd-review-pill sd-review-pill--category">
            {formatCategoryLabel(
              reviewGuideData.classification.primaryCategory
            )}
          </span>
        </div>
      </div>
      <div className="sd-review-card-copy">{reviewGuideData.summary}</div>
      {reviewGuideData.reasons.length > 0 && (
        <div className="sd-review-section">
          <div className="sd-review-section-title">Why this file matters</div>
          <div className="sd-review-list">
            {reviewGuideData.reasons.slice(0, 3).map((reason) => (
              <div className="sd-review-list-item" key={reason.id}>
                {reason.message}
              </div>
            ))}
          </div>
        </div>
      )}
      {reviewGuideData.questions.length > 0 && (
        <div className="sd-review-section">
          <div className="sd-review-section-title">Review questions</div>
          <div className="sd-review-list">
            {reviewGuideData.questions.slice(0, 3).map((question) => (
              <div className="sd-review-list-item" key={question.id}>
                <strong>{question.question}</strong>
                <span className="sd-review-inline-tag">
                  {formatActionLabel(question.suggestedAction)}
                </span>
                <div className="sd-review-list-copy">{question.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {reviewGuideData.warnings.length > 0 && (
        <div className="sd-review-note">
          {reviewGuideData.warnings.map((warning) => (
            <div className="sd-review-note-item" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      )}
      {reviewGuideData.diagnostics && (
        <details className="sd-review-diagnostics">
          <summary>Diagnostics</summary>
          <div className="sd-review-diagnostics-grid">
            <span>
              Rule hits: {reviewGuideData.diagnostics.traceSummary.ruleHitCount}
            </span>
            <span>
              Evidence refs:{" "}
              {reviewGuideData.diagnostics.traceSummary.evidenceCount}
            </span>
            <span>
              Score entries:{" "}
              {reviewGuideData.diagnostics.traceSummary.scoreEntryCount}
            </span>
          </div>
          {reviewGuideData.diagnostics.consistency.warnings.length > 0 && (
            <div className="sd-review-note">
              {reviewGuideData.diagnostics.consistency.warnings.map(
                (warning) => (
                  <div className="sd-review-note-item" key={warning}>
                    {warning}
                  </div>
                )
              )}
            </div>
          )}
        </details>
      )}
    </section>
  );
}

function DiffPanelBody({
  selectedFile,
  onSelectFile,
  reviewSummary,
  reviewSummaryLoading,
  reviewSummaryError,
  reviewGuideData,
  reviewGuideError,
  reviewGuideLoading,
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
          {warnings.map((warning: string) => (
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
      <ReviewSummaryStrip
        onSelectFile={onSelectFile}
        reviewSummary={reviewSummary}
        reviewSummaryError={reviewSummaryError}
        reviewSummaryLoading={reviewSummaryLoading}
        selectedFile={selectedFile}
      />
      <ReviewGuideCard
        reviewGuideData={reviewGuideData}
        reviewGuideError={reviewGuideError}
        reviewGuideLoading={reviewGuideLoading}
        selectedFile={selectedFile}
      />
      {warningBanner}
      {content}
    </div>
  );
}

function DiffPanel({
  summary,
  selectedSummary,
  selectedFile,
  onSelectFile,
  lineLayout,
  hideComments,
  compareMoves,
  onRefresh,
  onLineLayoutChange,
  onHideCommentsChange,
  onCompareMovesChange,
  reviewSummary,
  reviewSummaryLoading,
  reviewSummaryError,
  reviewGuideData,
  reviewGuideError,
  reviewGuideLoading,
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
        onSelectFile={onSelectFile}
        reviewGuideData={reviewGuideData}
        reviewGuideError={reviewGuideError}
        reviewGuideLoading={reviewGuideLoading}
        reviewSummary={reviewSummary}
        reviewSummaryError={reviewSummaryError}
        reviewSummaryLoading={reviewSummaryLoading}
        selectedFile={selectedFile}
      />
    </section>
  );
}

export function SemaDiffExplorer({
  client,
  prUrl,
  onPrUrlSubmit,
  selectedFile: controlledSelectedFile,
  onSelectedFileChange,
  contextLines = -1,
  title,
  inputPlaceholder,
  submitLabel,
  className,
  debugLogger,
}: SemaDiffExplorerProps) {
  const [localPrUrl, setLocalPrUrl] = useState(prUrl ?? "");
  const [input, setInput] = useState(prUrl ?? "");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setInput(prUrl ?? "");
    if (prUrl !== undefined) {
      setLocalPrUrl(prUrl);
    }
  }, [prUrl]);

  const effectivePrUrl = prUrl ?? localPrUrl;
  const stableClient = useMemo(() => client, [client]);
  const {
    summary,
    summaryLoading,
    summaryError,
    reviewSummary,
    reviewSummaryLoading,
    reviewSummaryError,
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
    reviewGuideData,
    reviewGuideError,
    reviewGuideLoading,
    lineLayout,
    setLineLayout,
    hideComments,
    setHideComments,
    compareMoves,
    setCompareMoves,
    refresh,
  } = useSemaDiffExplorer({
    client: stableClient,
    prUrl: effectivePrUrl,
    contextLines,
    debugLogger,
  });
  const effectiveSelectedFile = controlledSelectedFile ?? selectedFile;

  useEffect(() => {
    if (controlledSelectedFile === undefined) {
      return;
    }
    if (selectedFile === controlledSelectedFile) {
      return;
    }
    setSelectedFile(controlledSelectedFile);
  }, [controlledSelectedFile, selectedFile, setSelectedFile]);

  useEffect(() => {
    if (!(summary && onSelectedFileChange)) {
      return;
    }
    if (
      controlledSelectedFile !== undefined &&
      selectedFile === controlledSelectedFile
    ) {
      return;
    }
    onSelectedFileChange(selectedFile);
  }, [summary, onSelectedFileChange, controlledSelectedFile, selectedFile]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    if (!next) {
      return;
    }
    if (onPrUrlSubmit) {
      onPrUrlSubmit(next);
      return;
    }
    setLocalPrUrl(next);
  };

  return (
    <div className={className ?? "sd-app"}>
      <Header
        input={input}
        inputPlaceholder={inputPlaceholder}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        submitLabel={submitLabel}
        summary={summary}
        summaryError={summaryError}
        summaryLoading={summaryLoading}
        title={title}
      />
      <main className="sd-main">
        <FilePanel
          fileFilter={fileFilter}
          filteredFiles={filteredFiles}
          onFileFilterChange={setFileFilter}
          onSelectFile={setSelectedFile}
          reviewSummary={reviewSummary}
          selectedFile={effectiveSelectedFile}
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
          onCompareMovesChange={setCompareMoves}
          onHideCommentsChange={setHideComments}
          onLineLayoutChange={setLineLayout}
          onRefresh={refresh}
          onSelectFile={setSelectedFile}
          reviewGuideData={reviewGuideData}
          reviewGuideError={reviewGuideError}
          reviewGuideLoading={reviewGuideLoading}
          reviewSummary={reviewSummary}
          reviewSummaryError={reviewSummaryError}
          reviewSummaryLoading={reviewSummaryLoading}
          selectedFile={effectiveSelectedFile}
          selectedSummary={selectedSummary ?? null}
          summary={summary}
        />
      </main>
    </div>
  );
}
