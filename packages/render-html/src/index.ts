import {
  type DiffDocument,
  type DiffOperation,
  defaultConfig,
  type NormalizerLanguage,
  normalizeTextForLanguage,
  type Range,
} from "@semadiff/core";
import { Schema } from "effect";

export interface HtmlRenderOptions {
  maxOperations?: number;
  batchSize?: number;
  virtualize?: boolean;
  filePath?: string;
  title?: string;
  view?: "semantic" | "lines";
  lineMode?: "raw" | "semantic";
  hideComments?: boolean;
  oldText?: string;
  newText?: string;
  contextLines?: number;
  lineLayout?: "split" | "unified";
  language?: NormalizerLanguage;
  showBanner?: boolean;
  showSummary?: boolean;
  showFilePath?: boolean;
  layout?: "full" | "embed";
}

const baseStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --sd-bg: #050812;
  --sd-surface: #0b1224;
  --sd-panel: #101b33;
  --sd-border: rgba(148, 163, 184, 0.22);
  --sd-text: #e2e8f0;
  --sd-muted: #9fb0c6;
  --sd-accent: #2dd4bf;
  --sd-add: #22e58f;
  --sd-del: #ff5c77;
  --sd-update: #ffd166;
  --sd-move: #59a6ff;
  --sd-shadow: 0 18px 40px rgba(2, 6, 23, 0.55);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: "Space Grotesk", "Segoe UI Variable", "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, rgba(45, 212, 191, 0.08), transparent 45%),
    linear-gradient(180deg, #050815 0%, #070b16 100%);
  color: var(--sd-text);
}

body.sd-embed {
  background: transparent;
}

.sd-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px;
}

.sd-shell--embed {
  max-width: none;
  padding: 0;
}

.sd-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--sd-border);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.6));
  box-shadow: var(--sd-shadow);
}

.sd-brand {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sd-badge {
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  color: var(--sd-accent);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.sd-metric {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sd-metric-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--sd-accent);
}

.sd-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--sd-muted);
}

.sd-file {
  margin-top: 14px;
  font-size: 13px;
  color: var(--sd-muted);
}

.sd-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 20px 0 8px;
}

.sd-summary-card {
  border: 1px solid var(--sd-border);
  border-radius: 14px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.7);
}

.sd-summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--sd-muted);
}

.sd-summary-value {
  font-size: 18px;
  font-weight: 600;
  margin-top: 6px;
}

.sd-warning {
  margin: 18px 0 10px;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid rgba(255, 153, 51, 0.7);
  background: linear-gradient(135deg, rgba(255, 153, 51, 0.22), rgba(15, 23, 42, 0.88));
  box-shadow: 0 14px 30px rgba(255, 94, 0, 0.18);
}

.sd-warning-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.26em;
  font-weight: 700;
  color: #ffcc80;
}

.sd-warning-body {
  font-size: 14px;
  margin-top: 8px;
  color: #ffe1b3;
}

.sd-highlight {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.sd-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--sd-border);
  background: rgba(15, 23, 42, 0.5);
  font-size: 12px;
  color: var(--sd-muted);
}

.sd-diff {
  margin-top: 18px;
}

.sd-op {
  border: 1px solid var(--sd-border);
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 16px;
  background: rgba(11, 18, 36, 0.9);
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.45);
}

.sd-op-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.sd-op-tag {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-weight: 600;
  border: 1px solid transparent;
}

.sd-op--insert .sd-op-tag {
  color: var(--sd-add);
  border-color: rgba(52, 211, 153, 0.5);
  background: rgba(52, 211, 153, 0.1);
}

.sd-op--delete .sd-op-tag {
  color: var(--sd-del);
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.1);
}

.sd-op--update .sd-op-tag {
  color: var(--sd-update);
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.12);
}

.sd-op--move .sd-op-tag {
  color: var(--sd-move);
  border-color: rgba(96, 165, 250, 0.5);
  background: rgba(96, 165, 250, 0.12);
}

.sd-op-range {
  font-size: 12px;
  color: var(--sd-muted);
}

.sd-op-meta {
  font-size: 12px;
  color: var(--sd-muted);
}

.sd-op-body {
  display: grid;
  gap: 12px;
}

.sd-op-body--split {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.sd-side {
  border-radius: 12px;
  padding: 12px;
  background: rgba(8, 12, 24, 0.9);
  border: 1px solid var(--sd-border);
}

.sd-side--old {
  border-color: rgba(248, 113, 113, 0.4);
}

.sd-side--new {
  border-color: rgba(52, 211, 153, 0.4);
}

.sd-side-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--sd-muted);
  margin-bottom: 8px;
}

.sd-side pre {
  margin: 0;
  font-family: "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.sd-truncate {
  margin-top: 8px;
  font-size: 11px;
  color: var(--sd-muted);
}

.sd-truncated {
  margin-top: 16px;
  font-size: 12px;
  color: var(--sd-muted);
}

.sd-lines {
  margin-top: 18px;
  border: 1px solid var(--sd-border);
  border-radius: 0;
  overflow: hidden;
  background: rgba(11, 18, 36, 0.95);
  box-shadow: var(--sd-shadow);
}

body.sd-embed .sd-lines {
  margin-top: 0;
  border-radius: 0;
  box-shadow: none;
}

.sd-line {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px minmax(0, 1fr);
  font-family: "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.6;
  border-bottom: none;
}

.sd-line--unified {
  grid-template-columns: 56px 56px 20px minmax(0, 1fr);
}

.sd-line--hunk {
  grid-template-columns: 1fr;
  background: rgba(15, 23, 42, 0.6);
}

.sd-cell {
  padding: 4px 8px;
}

.sd-hunk {
  padding: 6px 12px;
  font-family: "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;
  font-size: 11px;
  color: var(--sd-muted);
}

.sd-gutter {
  text-align: right;
  color: rgba(148, 163, 184, 0.65);
  background: rgba(5, 8, 21, 0.45);
  border-right: none;
}

.sd-prefix {
  text-align: center;
  color: rgba(148, 163, 184, 0.7);
  background: rgba(5, 8, 21, 0.45);
  border-right: none;
  font-weight: 600;
}

.sd-code {
  white-space: pre;
  color: #e2e8f0;
}

.sd-line--equal .sd-cell {
  background: transparent;
}

.sd-line--delete .sd-cell--old,
.sd-line--replace .sd-cell--old {
  background: rgba(255, 92, 119, 0.18);
  border-left: 3px solid rgba(255, 92, 119, 0.55);
}

.sd-line--insert .sd-cell--new,
.sd-line--replace .sd-cell--new {
  background: rgba(34, 229, 143, 0.18);
  border-left: 3px solid rgba(34, 229, 143, 0.55);
}

.sd-line--move .sd-cell--old,
.sd-line--move .sd-cell--new {
  background: rgba(89, 166, 255, 0.18);
  border-left: 3px solid rgba(89, 166, 255, 0.55);
}

.sd-line--delete .sd-cell--code {
  background: rgba(255, 92, 119, 0.18);
}

.sd-line--insert .sd-cell--code {
  background: rgba(34, 229, 143, 0.18);
}

.sd-line--move .sd-cell--code {
  background: rgba(89, 166, 255, 0.18);
}

.sd-line--replace .sd-cell--code {
  background: transparent;
}

.sd-line--replace .sd-cell--old,
.sd-line--replace .sd-cell--new {
  background: transparent;
  border-left: none;
}

.sd-inline-del {
  background: rgba(255, 92, 119, 0.45);
  border-radius: 0;
  padding: 0 1px;
}

.sd-inline-add {
  background: rgba(34, 229, 143, 0.45);
  border-radius: 0;
  padding: 0 1px;
}

.sd-line--delete .sd-prefix {
  color: var(--sd-del);
}

.sd-line--insert .sd-prefix {
  color: var(--sd-add);
}

.sd-line--move .sd-prefix {
  color: var(--sd-move);
}

.sd-line--gap {
  grid-template-columns: 1fr;
  text-align: center;
}

.sd-gap {
  padding: 10px 0;
  color: var(--sd-muted);
  background: rgba(8, 12, 24, 0.7);
  font-size: 12px;
}

#sd-status {
  margin-top: 16px;
  font-size: 12px;
  color: var(--sd-muted);
}
`;

const LINE_SPLIT_RE = /\r?\n/;
const INLINE_TOKEN_RE = /([A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s])/g;

interface LineEdit {
  type: "equal" | "insert" | "delete";
  line: string;
}

interface LineRow {
  type: "equal" | "insert" | "delete" | "replace" | "gap" | "hunk" | "move";
  oldLine?: number | null;
  newLine?: number | null;
  text?: string;
  hidden?: number;
  oldText?: string;
  newText?: string;
  header?: string;
}

const LineNumberSchema = Schema.Union([Schema.Number, Schema.Null] as const);
const LineRowSchema = Schema.Struct({
  type: Schema.Literals([
    "equal",
    "insert",
    "delete",
    "replace",
    "gap",
    "hunk",
    "move",
  ] as const),
  oldLine: Schema.optional(LineNumberSchema),
  newLine: Schema.optional(LineNumberSchema),
  text: Schema.optional(Schema.String),
  hidden: Schema.optional(Schema.Number),
  oldText: Schema.optional(Schema.String),
  newText: Schema.optional(Schema.String),
  header: Schema.optional(Schema.String),
});
const LinePayloadSchema = Schema.Struct({
  rows: Schema.Array(LineRowSchema),
  batchSize: Schema.Number,
  lineLayout: Schema.Literals(["split", "unified"] as const),
});
const OpsRangeSchema = Schema.Struct({
  start: Schema.Struct({
    line: Schema.Number,
    column: Schema.Number,
  }),
  end: Schema.Struct({
    line: Schema.Number,
    column: Schema.Number,
  }),
});
const OpsPayloadSchema = Schema.Struct({
  operations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      type: Schema.Literals(["insert", "delete", "update", "move"] as const),
      oldText: Schema.String,
      newText: Schema.String,
      confidence: Schema.Union([Schema.Number, Schema.Null] as const),
      oldRange: Schema.Union([OpsRangeSchema, Schema.Null] as const),
      newRange: Schema.Union([OpsRangeSchema, Schema.Null] as const),
    })
  ),
  batchSize: Schema.Number,
});
const LinePayloadJson = Schema.fromJsonString(LinePayloadSchema);
const OpsPayloadJson = Schema.fromJsonString(OpsPayloadSchema);

function normalizeLineForSemantic(line: string, language?: NormalizerLanguage) {
  return normalizeTextForLanguage(line, defaultConfig.normalizers, language);
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScript(input: string) {
  return input.replace(/<\/script>/g, "<\\/script>");
}

function formatRangeDetail(range?: Range) {
  if (!range) {
    return "";
  }
  const start = `L${range.start.line}:${range.start.column}`;
  const end = `L${range.end.line}:${range.end.column}`;
  return `${start}-${end}`;
}

function formatRangeLabel(range?: Range) {
  if (!range) {
    return "";
  }
  if (range.start.line === range.end.line) {
    return `L${range.start.line}`;
  }
  return `L${range.start.line}-${range.end.line}`;
}

function countLines(text?: string) {
  if (!text) {
    return 0;
  }
  return text.split(LINE_SPLIT_RE).length;
}

function previewText(text?: string, limit = 400) {
  if (!text) {
    return { value: "", truncated: false };
  }
  if (text.length <= limit) {
    return { value: text, truncated: false };
  }
  return { value: `${text.slice(0, limit)}\n…`, truncated: true };
}

function estimateReduction(diff: DiffDocument) {
  const operations = diff.operations.length;
  const changeLines = diff.operations.reduce((total, op) => {
    return total + countLines(op.oldText) + countLines(op.newText);
  }, 0);
  if (operations === 0 || changeLines === 0) {
    return { percent: 0, operations, changeLines };
  }
  const ratio = 1 - operations / changeLines;
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    percent: Math.round(clamped * 100),
    operations,
    changeLines,
  };
}

function buildSummary(diff: DiffDocument) {
  const counts = {
    insert: 0,
    delete: 0,
    update: 0,
    move: 0,
  };
  for (const op of diff.operations) {
    counts[op.type] += 1;
  }
  const touchedLines = diff.operations.reduce((total, op) => {
    return total + countLines(op.oldText) + countLines(op.newText);
  }, 0);
  return {
    counts,
    touchedLines,
    operations: diff.operations.length,
    moves: diff.moves.length,
    renames: diff.renames.length,
  };
}

function renderSummary(diff: DiffDocument) {
  const summary = buildSummary(diff);
  const cards = [
    { label: "Operations", value: summary.operations },
    { label: "Touched Lines", value: summary.touchedLines },
    { label: "Updates", value: summary.counts.update },
    { label: "Insertions", value: summary.counts.insert },
    { label: "Deletions", value: summary.counts.delete },
    { label: "Moves", value: summary.counts.move },
  ];

  const cardMarkup = cards
    .map(
      (card) => `
        <div class="sd-summary-card">
          <div class="sd-summary-label">${escapeHtml(card.label)}</div>
          <div class="sd-summary-value">${card.value}</div>
        </div>
      `
    )
    .join("\n");

  const highlights: string[] = [];
  if (diff.renames.length > 0) {
    const renames = diff.renames
      .map(
        (rename) =>
          `${escapeHtml(rename.from)} → ${escapeHtml(rename.to)} (${rename.occurrences})`
      )
      .join(", ");
    highlights.push(`<span class="sd-pill">Renames: ${renames}</span>`);
  }
  if (diff.moves.length > 0) {
    highlights.push(`<span class="sd-pill">Moves: ${diff.moves.length}</span>`);
  }

  return `
    <section class="sd-summary">${cardMarkup}</section>
    ${highlights.length > 0 ? `<div class="sd-highlight">${highlights.join(" ")}</div>` : ""}
  `;
}

function renderSemanticFallbackWarning() {
  return `
    <section class="sd-warning" role="alert">
      <div class="sd-warning-title">Semantic line view hid edits</div>
      <div class="sd-warning-body">
        Raw line diff is shown to avoid hiding edits. This file needs a stronger semantic normalizer.
      </div>
    </section>
  `;
}

function renderSemanticNoiseWarning() {
  return `
    <section class="sd-warning" role="alert">
      <div class="sd-warning-title">Semantic line view was noisier</div>
      <div class="sd-warning-body">
        Raw line diff is shown because it has fewer edits. This keeps the diff minimal while we improve semantic rules.
      </div>
    </section>
  `;
}

function renderSide(
  title: string,
  text: string,
  variant: "old" | "new",
  truncated: boolean
) {
  return `
    <div class="sd-side sd-side--${variant}">
      <div class="sd-side-title">${escapeHtml(title)}</div>
      <pre>${escapeHtml(text)}</pre>
      ${truncated ? `<div class="sd-truncate">Preview truncated</div>` : ""}
    </div>
  `;
}

function renderOperation(op: DiffOperation) {
  const typeLabel = op.type.toUpperCase();
  const oldPreview = previewText(op.oldText);
  const newPreview = previewText(op.newText);
  const oldLabel = formatRangeLabel(op.oldRange);
  const newLabel = formatRangeLabel(op.newRange);
  const rangeLabel = [oldLabel, newLabel].filter(Boolean).join(" → ");
  const rangeDetail = [
    formatRangeDetail(op.oldRange),
    formatRangeDetail(op.newRange),
  ]
    .filter(Boolean)
    .join(" → ");

  const parts: string[] = [];
  if (op.type === "insert") {
    if (newPreview.value) {
      parts.push(
        renderSide("After", newPreview.value, "new", newPreview.truncated)
      );
    }
  } else if (op.type === "delete") {
    if (oldPreview.value) {
      parts.push(
        renderSide("Before", oldPreview.value, "old", oldPreview.truncated)
      );
    }
  } else {
    if (oldPreview.value) {
      parts.push(
        renderSide("Before", oldPreview.value, "old", oldPreview.truncated)
      );
    }
    if (newPreview.value) {
      parts.push(
        renderSide("After", newPreview.value, "new", newPreview.truncated)
      );
    }
  }

  const confidence =
    typeof op.meta?.confidence === "number"
      ? `Confidence ${(op.meta.confidence * 100).toFixed(0)}%`
      : "";

  return `
    <article class="sd-op sd-op--${escapeHtml(op.type)}" data-op-id="${escapeHtml(op.id)}">
      <div class="sd-op-header">
        <span class="sd-op-tag">${escapeHtml(typeLabel)}</span>
        <span class="sd-op-range" title="${escapeHtml(rangeDetail)}">${escapeHtml(rangeLabel)}</span>
        ${confidence ? `<span class="sd-op-meta">${escapeHtml(confidence)}</span>` : ""}
      </div>
      <div class="sd-op-body ${parts.length > 1 ? "sd-op-body--split" : ""}">
        ${parts.join("\n")}
      </div>
    </article>
  `;
}

function splitLines(text: string) {
  if (text.length === 0) {
    return [""];
  }
  const lines = text.split(LINE_SPLIT_RE);
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function tokenizeInline(text: string) {
  const tokens = text.match(INLINE_TOKEN_RE);
  if (!tokens || tokens.length === 0) {
    return [text];
  }
  return tokens;
}

function renderInlineDiff(oldText: string, newText: string) {
  const oldTokens = tokenizeInline(oldText);
  const newTokens = tokenizeInline(newText);
  const edits = diffLines(oldTokens, newTokens, oldTokens, newTokens);
  let oldHtml = "";
  let newHtml = "";
  for (const edit of edits) {
    const token = escapeHtml(edit.line);
    if (edit.type === "equal") {
      oldHtml += token;
      newHtml += token;
    } else if (edit.type === "delete") {
      oldHtml += `<span class="sd-inline-del">${token}</span>`;
    } else {
      newHtml += `<span class="sd-inline-add">${token}</span>`;
    }
  }
  return { oldHtml, newHtml };
}

function diffLines(
  oldLines: string[],
  newLines: string[],
  oldComparable?: string[],
  newComparable?: string[]
): LineEdit[] {
  const n = oldLines.length;
  const m = newLines.length;
  const compareOld = oldComparable ?? oldLines;
  const compareNew = newComparable ?? newLines;
  const max = n + m;
  const offset = max;
  const v = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    const vSnapshot = v.slice();
    trace.push(vSnapshot);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const left = v[offset + k - 1] ?? 0;
      const right = v[offset + k + 1] ?? 0;
      if (k === -d || (k !== d && left < right)) {
        x = right;
      } else {
        x = left + 1;
      }
      let y = x - k;
      while (x < n && y < m && compareOld[x] === compareNew[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrackEdits(trace, oldLines, newLines, n, m);
      }
    }
  }

  return backtrackEdits(trace, oldLines, newLines, n, m);
}

function selectPrevK(v: number[], offset: number, k: number, d: number) {
  const left = v[offset + k - 1] ?? 0;
  const right = v[offset + k + 1] ?? 0;
  if (k === -d || (k !== d && left < right)) {
    return k + 1;
  }
  return k - 1;
}

function drainEqualEdits(
  edits: LineEdit[],
  oldLines: string[],
  x: number,
  y: number,
  prevX: number,
  prevY: number
) {
  let nextX = x;
  let nextY = y;
  while (nextX > prevX && nextY > prevY) {
    edits.push({ type: "equal", line: oldLines[nextX - 1] ?? "" });
    nextX -= 1;
    nextY -= 1;
  }
  return { x: nextX, y: nextY };
}

function drainRemainingEdits(
  edits: LineEdit[],
  oldLines: string[],
  newLines: string[],
  x: number,
  y: number
) {
  let nextX = x;
  let nextY = y;
  while (nextX > 0 && nextY > 0) {
    edits.push({ type: "equal", line: oldLines[nextX - 1] ?? "" });
    nextX -= 1;
    nextY -= 1;
  }
  while (nextX > 0) {
    edits.push({ type: "delete", line: oldLines[nextX - 1] ?? "" });
    nextX -= 1;
  }
  while (nextY > 0) {
    edits.push({ type: "insert", line: newLines[nextY - 1] ?? "" });
    nextY -= 1;
  }
  return { x: nextX, y: nextY };
}

function backtrackEdits(
  trace: number[][],
  oldLines: string[],
  newLines: string[],
  n: number,
  m: number
): LineEdit[] {
  let x = n;
  let y = m;
  const edits: LineEdit[] = [];

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d];
    if (!v) {
      continue;
    }
    const offset = (v.length - 1) / 2;
    const k = x - y;
    const prevK = selectPrevK(v, offset, k, d);
    const prevX = v[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    const drained = drainEqualEdits(edits, oldLines, x, y, prevX, prevY);
    x = drained.x;
    y = drained.y;

    if (x === prevX && y > prevY) {
      edits.push({ type: "insert", line: newLines[y - 1] ?? "" });
      y -= 1;
    } else if (y === prevY && x > prevX) {
      edits.push({ type: "delete", line: oldLines[x - 1] ?? "" });
      x -= 1;
    }
  }

  const drained = drainRemainingEdits(edits, oldLines, newLines, x, y);
  x = drained.x;
  y = drained.y;

  edits.reverse();
  return edits;
}

function getLineIndent(line: string) {
  const match = line.match(LINE_INDENT_RE);
  return match ? match[0] : "";
}

function collectDuplicateLineKeys(
  oldLines: string[],
  newLines: string[],
  normalizeLine: (line: string) => string
) {
  const counts = new Map<string, number>();
  const add = (line: string) => {
    const key = normalizeLine(line).trim();
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const line of oldLines) {
    add(line);
  }
  for (const line of newLines) {
    add(line);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) {
      duplicates.add(key);
    }
  }
  return duplicates;
}

function buildComparableLines(
  lines: string[],
  normalizeLine: (line: string) => string,
  duplicates: Set<string>,
  importKeys?: (string | null)[]
) {
  const findNeighbor = (start: number, step: number, skipComments: boolean) => {
    for (
      let index = start + step;
      index >= 0 && index < lines.length;
      index += step
    ) {
      const candidate = normalizeLine(lines[index] ?? "").trim();
      if (candidate) {
        if (skipComments && COMMENT_ONLY_RE.test(candidate)) {
          continue;
        }
        return candidate.slice(0, 120);
      }
    }
    return "";
  };
  return lines.map((line, index) => {
    const normalized = normalizeLine(line);
    const trimmed = normalized.trim();
    if (!trimmed) {
      return "";
    }
    const importKey = importKeys?.[index];
    if (importKey) {
      return `${trimmed}__${importKey}`;
    }
    if (!duplicates.has(trimmed)) {
      return trimmed;
    }
    const indent = getLineIndent(line);
    if (COMMENT_ONLY_RE.test(trimmed)) {
      const prev = findNeighbor(index, -1, true);
      const next = findNeighbor(index, 1, true);
      const context = prev || next ? `${prev}__${next}` : "";
      return context
        ? `${indent}${trimmed}__${context}`
        : `${indent}${trimmed}`;
    }
    return `${indent}${trimmed}`;
  });
}

function buildMultilineImportKeys(lines: string[]) {
  const keys = new Array<string | null>(lines.length).fill(null);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!MULTILINE_IMPORT_START_RE.test(line)) {
      continue;
    }
    const scanLimit = Math.min(lines.length, index + 20);
    for (let next = index + 1; next < scanLimit; next += 1) {
      const candidate = lines[next] ?? "";
      const match = MULTILINE_IMPORT_FROM_RE.exec(candidate);
      if (match) {
        keys[index] = match[1] ?? null;
        break;
      }
      if (candidate.includes(";")) {
        break;
      }
    }
  }
  return keys;
}

function buildRawLineRows(
  oldLines: string[],
  newLines: string[],
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string,
  useKeyMatching?: boolean,
  useYamlComparable?: boolean
): LineRow[] {
  let oldComparable = oldLines;
  let newComparable = newLines;
  if (normalizeLine) {
    const duplicates = useKeyMatching
      ? new Set<string>()
      : collectDuplicateLineKeys(oldLines, newLines, normalizeLine);
    const importKeys = useKeyMatching
      ? null
      : {
          old: buildMultilineImportKeys(oldLines),
          next: buildMultilineImportKeys(newLines),
        };
    if (useKeyMatching) {
      oldComparable = buildYamlComparableLines(oldLines, normalizeLine, true);
      newComparable = buildYamlComparableLines(newLines, normalizeLine, true);
    } else if (useYamlComparable) {
      oldComparable = buildYamlComparableLines(oldLines, normalizeLine, false);
      newComparable = buildYamlComparableLines(newLines, normalizeLine, false);
    } else {
      oldComparable = buildComparableLines(
        oldLines,
        normalizeLine,
        duplicates,
        importKeys?.old ?? undefined
      );
      newComparable = buildComparableLines(
        newLines,
        normalizeLine,
        duplicates,
        importKeys?.next ?? undefined
      );
    }
  }
  const edits = diffLines(oldLines, newLines, oldComparable, newComparable);
  const blocks = buildLineBlocks(edits);
  return buildRowsFromBlocks(
    blocks,
    lineLayout,
    normalizeLine,
    newLines,
    useKeyMatching,
    useYamlComparable,
    normalizeLine ? oldComparable : undefined,
    normalizeLine ? newComparable : undefined
  );
}

function isMoveCandidateLine(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return MOVE_CANDIDATE_RE.test(trimmed);
}

function getMoveKey(text: string, normalizeLine: (line: string) => string) {
  if (!isMoveCandidateLine(text)) {
    return null;
  }
  return normalizeLine(text);
}

function collectInsertMoveCandidates(
  rows: LineRow[],
  normalizeLine: (line: string) => string
) {
  const insertByKey = new Map<string, number[]>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row?.type !== "insert") {
      continue;
    }
    const key = getMoveKey(row.text ?? "", normalizeLine);
    if (!key) {
      continue;
    }
    const list = insertByKey.get(key);
    if (list) {
      list.push(index);
    } else {
      insertByKey.set(key, [index]);
    }
  }
  return insertByKey;
}

function takeFirstAvailable(list: number[] | undefined, used: Set<number>) {
  if (!list || list.length === 0) {
    return null;
  }
  let matchIndex = list[0];
  while (matchIndex !== undefined && used.has(matchIndex)) {
    list.shift();
    matchIndex = list[0];
  }
  return matchIndex ?? null;
}

function pairIdenticalLineMoves(
  rows: LineRow[],
  normalizeLine?: (line: string) => string
) {
  if (!normalizeLine) {
    return rows;
  }
  const insertByKey = collectInsertMoveCandidates(rows, normalizeLine);
  if (insertByKey.size === 0) {
    return rows;
  }
  const used = new Set<number>();
  const output: LineRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (used.has(index)) {
      continue;
    }
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (row.type !== "delete") {
      output.push(row);
      continue;
    }
    const text = row.text ?? "";
    const key = getMoveKey(text, normalizeLine);
    if (!key) {
      output.push(row);
      continue;
    }
    const matchIndex = takeFirstAvailable(insertByKey.get(key), used);
    if (matchIndex === null) {
      output.push(row);
      continue;
    }
    used.add(matchIndex);
    const insertRow = rows[matchIndex];
    output.push({
      type: "equal",
      oldLine: row.oldLine ?? null,
      newLine: insertRow?.newLine ?? null,
      text,
    });
  }
  return output;
}

function buildNormalizedLineCounts(
  lines: string[],
  normalizeLine: (line: string) => string
) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = normalizeLine(line);
    if (!key.trim()) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function suppressBalancedLineChanges(
  rows: LineRow[],
  oldLines: string[],
  newLines: string[],
  normalizeLine?: (line: string) => string,
  useYamlComparable?: boolean
) {
  if (!normalizeLine || useYamlComparable) {
    return rows;
  }
  const oldCounts = buildNormalizedLineCounts(oldLines, normalizeLine);
  const newCounts = buildNormalizedLineCounts(newLines, normalizeLine);
  const balanced = new Set<string>();
  for (const [key, count] of oldCounts) {
    if (count > 0 && count === (newCounts.get(key) ?? 0)) {
      balanced.add(key);
    }
  }
  if (balanced.size === 0) {
    return rows;
  }
  return rows.filter((row) => {
    if (row?.type !== "insert" && row?.type !== "delete") {
      return true;
    }
    const text = row.text ?? "";
    if (!isMoveCandidateLine(text)) {
      return true;
    }
    return !balanced.has(normalizeLine(text));
  });
}

function suppressImportBlockStarts(rows: LineRow[]) {
  return rows.filter((row) => {
    if (row?.type !== "insert" && row?.type !== "delete") {
      return true;
    }
    const text = row.text ?? "";
    return !IMPORT_BLOCK_START_RE.test(text.trim());
  });
}

function suppressInlinePropChanges(
  rows: LineRow[],
  normalizeLine?: (line: string) => string
) {
  const insertLines = new Set<string>();
  const deleteLines = new Set<string>();
  const normalize = (text: string) =>
    (normalizeLine ? normalizeLine(text) : text).trim();

  const recordLine = (text: string, target: Set<string>) => {
    if (!text) {
      return;
    }
    const trimmed = text.trim();
    const match = JSX_PROP_LINE_RE.exec(trimmed);
    if (!match) {
      return;
    }
    const key = normalize(text);
    if (!key) {
      return;
    }
    target.add(key);
  };

  for (const row of rows) {
    if (!row) {
      continue;
    }
    if (row.type === "replace") {
      recordLine(row.newText ?? "", insertLines);
      recordLine(row.oldText ?? "", deleteLines);
    } else if (row.type === "insert") {
      recordLine(row.text ?? "", insertLines);
    } else if (row.type === "delete") {
      recordLine(row.text ?? "", deleteLines);
    }
  }

  return rows.filter((row) => {
    if (!row) {
      return false;
    }
    if (row.type === "delete") {
      const text = row.text ?? "";
      if (!JSX_PROP_LINE_RE.test(text.trim())) {
        return true;
      }
      const key = normalize(text);
      return !(deleteLines.has(key) && insertLines.has(key));
    }
    if (row.type === "insert") {
      const text = row.text ?? "";
      if (!JSX_PROP_LINE_RE.test(text.trim())) {
        return true;
      }
      const key = normalize(text);
      return !(insertLines.has(key) && deleteLines.has(key));
    }
    return true;
  });
}

function suppressRepeatedYamlChanges(
  rows: LineRow[],
  oldLines: string[],
  newLines: string[],
  normalizeLine?: (line: string) => string
) {
  if (!normalizeLine) {
    return rows;
  }
  const oldCounts = new Map<string, number>();
  const newCounts = new Map<string, number>();
  for (const line of oldLines) {
    const key = normalizeLine(line).trim();
    if (!key) {
      continue;
    }
    oldCounts.set(key, (oldCounts.get(key) ?? 0) + 1);
  }
  for (const line of newLines) {
    const key = normalizeLine(line).trim();
    if (!key) {
      continue;
    }
    newCounts.set(key, (newCounts.get(key) ?? 0) + 1);
  }
  const shared = new Set<string>();
  for (const [key, count] of oldCounts) {
    const nextCount = newCounts.get(key) ?? 0;
    if (count < YAML_SHARED_THRESHOLD || nextCount < YAML_SHARED_THRESHOLD) {
      continue;
    }
    const ratio = Math.abs(count - nextCount) / Math.max(count, nextCount);
    if (ratio <= YAML_SHARED_DIFF_RATIO) {
      shared.add(key);
    }
  }
  if (shared.size === 0) {
    return rows;
  }
  return rows.filter((row) => {
    if (row?.type !== "insert" && row?.type !== "delete") {
      return true;
    }
    const text = row.text ?? "";
    const key = normalizeLine(text).trim();
    if (!key) {
      return true;
    }
    return !shared.has(key);
  });
}

interface LineBlock {
  type: "equal" | "delete" | "insert";
  lines: string[];
}

function buildLineBlocks(edits: LineEdit[]): LineBlock[] {
  const blocks: LineBlock[] = [];
  for (const edit of edits) {
    const last = blocks.at(-1);
    if (last && last.type === edit.type) {
      last.lines.push(edit.line);
    } else {
      blocks.push({ type: edit.type, lines: [edit.line] });
    }
  }
  return blocks;
}

const REORDERABLE_LINE_RE =
  /^[A-Za-z_$][\w$-]*\s*(?:[:=]|\?|$)|^\{?\.\.\.[^}]+}?\s*,?$/;
const IMPORT_LINE_RE = /^\s*import\s+/;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+['"]/;

function isReorderableLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (
    trimmed.startsWith("<") ||
    trimmed.startsWith("</") ||
    trimmed === ">" ||
    trimmed === "/>"
  ) {
    return false;
  }
  return REORDERABLE_LINE_RE.test(trimmed);
}

function isImportLine(line: string) {
  return IMPORT_LINE_RE.test(line.trim());
}

function isSideEffectImportLine(line: string) {
  return SIDE_EFFECT_IMPORT_RE.test(line.trim());
}

function buildLineKeyCounts(
  lines: string[],
  normalizeLine?: (line: string) => string
) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = (normalizeLine ? normalizeLine(line) : line).trim();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectReorderableKeys(
  lines: string[],
  normalizeLine: (line: string) => string
) {
  const keys: string[] = [];
  const keyByIndex: (string | null)[] = [];
  for (const line of lines) {
    if (!isReorderableLine(line)) {
      keyByIndex.push(null);
      continue;
    }
    const key = normalizeLine(line).trim();
    keys.push(key);
    keyByIndex.push(key);
  }
  return { keys, keyByIndex };
}

function collectImportKeys(
  lines: string[],
  normalizeLine: (line: string) => string
) {
  const keys: string[] = [];
  const keyByIndex: (string | null)[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }
    if (!isImportLine(trimmed)) {
      return null;
    }
    if (isSideEffectImportLine(trimmed)) {
      return null;
    }
    const key = normalizeLine(trimmed).trim();
    keys.push(key);
    keyByIndex.push(key);
  }
  return { keys, keyByIndex };
}

function lineKeyCountsMatch(oldKeys: string[], newKeys: string[]) {
  const oldCounts = buildLineKeyCounts(oldKeys, (line) => line);
  const newCounts = buildLineKeyCounts(newKeys, (line) => line);
  if (oldCounts.size !== newCounts.size) {
    return false;
  }
  for (const [key, count] of oldCounts) {
    if ((newCounts.get(key) ?? 0) !== count) {
      return false;
    }
  }
  return true;
}

function buildLineBuckets(lines: string[], keyByIndex: (string | null)[]) {
  const buckets = new Map<string, string[]>();
  for (let idx = 0; idx < lines.length; idx += 1) {
    const key = keyByIndex[idx];
    if (!key) {
      continue;
    }
    const list = buckets.get(key);
    if (list) {
      list.push(lines[idx] ?? "");
    } else {
      buckets.set(key, [lines[idx] ?? ""]);
    }
  }
  return buckets;
}

function applyReorderedLines(
  lines: string[],
  keyByIndex: (string | null)[],
  desiredKeys: string[],
  buckets: Map<string, string[]>
) {
  const reordered = [...lines];
  let cursor = 0;
  for (let idx = 0; idx < keyByIndex.length; idx += 1) {
    if (!keyByIndex[idx]) {
      continue;
    }
    const desiredKey = desiredKeys[cursor++];
    if (!desiredKey) {
      return null;
    }
    const bucket = buckets.get(desiredKey);
    if (!bucket || bucket.length === 0) {
      return null;
    }
    const nextValue = bucket.shift();
    if (!nextValue) {
      return null;
    }
    reordered[idx] = nextValue;
  }
  return reordered;
}

function reorderInsertLines(
  oldLines: string[],
  newLines: string[],
  normalizeLine?: (line: string) => string
) {
  if (!normalizeLine) {
    return null;
  }
  const importOld = collectImportKeys(oldLines, normalizeLine);
  const importNew = collectImportKeys(newLines, normalizeLine);
  if (importOld && importNew) {
    if (!lineKeyCountsMatch(importOld.keys, importNew.keys)) {
      return null;
    }
    const buckets = buildLineBuckets(newLines, importNew.keyByIndex);
    return applyReorderedLines(
      newLines,
      importNew.keyByIndex,
      importOld.keys,
      buckets
    );
  }
  const old = collectReorderableKeys(oldLines, normalizeLine);
  const next = collectReorderableKeys(newLines, normalizeLine);
  if (old.keys.length === 0 || old.keys.length !== next.keys.length) {
    return null;
  }
  if (!lineKeyCountsMatch(old.keys, next.keys)) {
    return null;
  }
  const buckets = buildLineBuckets(newLines, next.keyByIndex);
  return applyReorderedLines(newLines, next.keyByIndex, old.keys, buckets);
}

const LINE_MATCH_KEYWORDS = new Set([
  "import",
  "export",
  "from",
  "return",
  "const",
  "let",
  "var",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "async",
  "await",
  "if",
  "else",
  "switch",
  "case",
  "default",
  "for",
  "while",
  "do",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "extends",
  "implements",
  "public",
  "private",
  "protected",
  "readonly",
  "static",
  "get",
  "set",
  "yield",
  "typeof",
  "instanceof",
  "in",
  "of",
  "as",
  "asserts",
  "satisfies",
  "void",
  "null",
  "true",
  "false",
]);
const LINE_MATCH_IDENTIFIER_RE = /[A-Za-z_$][\w$]*/g;
const LINE_MATCH_NUMBER_RE = /\b\d+(?:\.\d+)?\b/g;
const LINE_MATCH_STRING_RE = /(["'])(?:\\.|(?!\1).)*\1/g;
const SIMPLE_ASSIGN_RE = /^([A-Za-z_$][\w$-]*)(\s*[?:=])([\s\S]*)$/;
const LINE_MATCH_CODE_HINT_RE =
  /\b(import|export|return|const|let|var|function|class|interface|type|enum|async|await|throw|new)\b|=>|=/;
const YAML_KEY_RE = /^(\s*)([^:]+):(?:\s|$)/;
const MOVE_CANDIDATE_RE = /[A-Za-z0-9]/;
const LINE_INDENT_RE = /^\s*/;
const MULTILINE_IMPORT_START_RE = /^\s*import\s+(?:type\s+)?\{\s*$/;
const MULTILINE_IMPORT_FROM_RE = /\bfrom\s+["']([^"']+)["']/;
const IMPORT_BLOCK_START_RE = /^(?:import|export)\s+\{$/;
const JSX_PROP_LINE_RE = /^([A-Za-z_$][\w$-]*)\s*=/;
const COMMENT_ONLY_RE = /^(?:\/\/|\/\*|\*\/|\*)/;
const COMMENT_DELIMITER_LINES = new Set(["//", "/*", "/**", "*/", "*"]);
const LOW_INFO_PUNCTUATION_RE = /^[\]{}(),;[]+$/;
const ALNUM_RE = /[A-Za-z0-9]/;
const YAML_LIST_ITEM_RE = /^-\s*([^:]+):\s*(.*)$/;
const YAML_NAME_KEY_RE = /^name:\s*(.+)$/;
const YAML_USES_KEY_RE = /^uses:\s*(.+)$/;
const YAML_SHARED_THRESHOLD = 10;
const YAML_SHARED_DIFF_RATIO = 0.058;

function isLineComment(line: string) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

function isCommentLineForLanguage(line: string, language?: NormalizerLanguage) {
  if (!language || language === "*" || language === "text") {
    return false;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  switch (language) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("*/") ||
        trimmed.startsWith("{/*")
      );
    case "css":
      return (
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("*/")
      );
    case "yaml":
    case "toml":
      return trimmed.startsWith("#");
    case "md":
      return trimmed.startsWith("<!--");
    default:
      return false;
  }
}

function isLowInfoSemanticLine(normalized: string) {
  if (COMMENT_DELIMITER_LINES.has(normalized)) {
    return true;
  }
  if (isDecorativeComment(normalized)) {
    return true;
  }
  if (LOW_INFO_PUNCTUATION_RE.test(normalized)) {
    return true;
  }
  return false;
}

function isDecorativeComment(normalized: string) {
  const trimmed = normalized.trim();
  let rest = "";
  if (trimmed.startsWith("//")) {
    rest = trimmed.slice(2).trim();
  } else if (trimmed.startsWith("/*")) {
    rest = trimmed.slice(2).trim();
  } else if (trimmed.startsWith("*")) {
    rest = trimmed.slice(1).trim();
  } else {
    return false;
  }
  if (!rest) {
    return true;
  }
  return !ALNUM_RE.test(rest);
}

function nonEmptyLines(text: string | undefined) {
  if (!text) {
    return [];
  }
  return splitLines(text).filter((line) => line.trim().length > 0);
}

function isCommentOnlyOperation(
  op: DiffOperation,
  language?: NormalizerLanguage
) {
  if (!language || language === "*" || language === "text") {
    return false;
  }
  const lines = [...nonEmptyLines(op.oldText), ...nonEmptyLines(op.newText)];
  if (lines.length === 0) {
    return false;
  }
  return lines.every((line) => isCommentLineForLanguage(line, language));
}

function filterDiffForComments(
  diff: DiffDocument,
  language?: NormalizerLanguage
) {
  if (!language || language === "*" || language === "text") {
    return diff;
  }
  let hasFiltered = false;
  const operations = diff.operations.filter((op) => {
    const commentOnly = isCommentOnlyOperation(op, language);
    if (commentOnly) {
      hasFiltered = true;
    }
    return !commentOnly;
  });
  if (!hasFiltered) {
    return diff;
  }
  const opIds = new Set(operations.map((op) => op.id));
  const moves = diff.moves.flatMap((move) => {
    const filteredOps = move.operations.filter((id) => opIds.has(id));
    if (filteredOps.length === 0) {
      return [];
    }
    return [{ ...move, operations: filteredOps }];
  });
  const renameIds = new Set(
    operations
      .map((op) => op.meta?.renameGroupId)
      .filter((id): id is string => Boolean(id))
  );
  const renames =
    renameIds.size === 0
      ? []
      : diff.renames.filter((rename) => renameIds.has(rename.id));
  return { ...diff, operations, moves, renames };
}

function buildLineMatchKey(
  line: string,
  normalizeLine: (line: string) => string
) {
  const normalized = normalizeLine(line);
  const trimmed = normalized.trim();
  if (!trimmed) {
    return "";
  }
  const yamlMatch = YAML_KEY_RE.exec(line);
  if (yamlMatch) {
    const indent = yamlMatch[1] ?? "";
    const key = (yamlMatch[2] ?? "").trim();
    if (key) {
      return `${indent}${key}:`;
    }
  }
  if (isLineComment(trimmed)) {
    if (trimmed.startsWith("//")) {
      return "//__COMMENT__";
    }
    if (trimmed.startsWith("/*")) {
      return "/*__COMMENT__";
    }
    return "*__COMMENT__";
  }
  const assignMatch = SIMPLE_ASSIGN_RE.exec(trimmed);
  if (assignMatch) {
    const identifier = assignMatch[1] ?? "";
    if (identifier && !LINE_MATCH_KEYWORDS.has(identifier)) {
      const separator = assignMatch[2] ?? "=";
      let output = assignMatch[3] ?? "";
      output = output.replace(LINE_MATCH_STRING_RE, '"__STR__"');
      output = output.replace(LINE_MATCH_NUMBER_RE, "__NUM__");
      output = output.replace(LINE_MATCH_IDENTIFIER_RE, (token) =>
        LINE_MATCH_KEYWORDS.has(token) ? token : "__ID__"
      );
      return `${identifier}${separator}${output}`;
    }
  }
  if (!LINE_MATCH_CODE_HINT_RE.test(trimmed)) {
    return trimmed;
  }
  let output = normalized.replace(LINE_MATCH_STRING_RE, '"__STR__"');
  output = output.replace(LINE_MATCH_NUMBER_RE, "__NUM__");
  output = output.replace(LINE_MATCH_IDENTIFIER_RE, (token) =>
    LINE_MATCH_KEYWORDS.has(token) ? token : "__ID__"
  );
  return output;
}

function getSimpleYamlComparable(trimmed: string) {
  if (!trimmed) {
    return "";
  }
  if (isLineComment(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseYamlKey(line: string) {
  const match = YAML_KEY_RE.exec(line);
  if (!match) {
    return null;
  }
  const indent = (match[1] ?? "").length;
  const key = (match[2] ?? "").trim();
  if (!key) {
    return null;
  }
  return { indent, key };
}

function resolveLooseYamlComparable(
  topKey: string,
  indent: number,
  key: string
) {
  if (topKey === "packages" && indent === 2) {
    return `__PKG__${key}`;
  }
  return key;
}

function resolveLooseYamlComparableWithPackages(
  topKey: string,
  indent: number,
  key: string,
  currentPackage: string,
  packageStack: { indent: number; key: string }[]
) {
  if (topKey !== "packages") {
    return {
      key: resolveLooseYamlComparable(topKey, indent, key),
      currentPackage,
    };
  }
  if (indent === 2) {
    packageStack.length = 0;
    return { key: `__PKG__${key}`, currentPackage: key };
  }
  if (!currentPackage || indent <= 2) {
    return {
      key: resolveLooseYamlComparable(topKey, indent, key),
      currentPackage,
    };
  }
  while (
    packageStack.length > 0 &&
    (packageStack.at(-1)?.indent ?? 0) >= indent
  ) {
    packageStack.pop();
  }
  packageStack.push({ indent, key });
  const path = packageStack.map((entry) => entry.key).join(">");
  return { key: `${currentPackage}::${path}`, currentPackage };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: YAML heuristics are inherently branchy.
function buildYamlComparableLines(
  lines: string[],
  normalizeLine: (line: string) => string,
  looseKeys?: boolean
) {
  const comparables: string[] = [];
  const stack: { indent: number; key: string }[] = [];
  const packageStack: { indent: number; key: string }[] = [];
  let topKey = "";
  let currentPackage = "";
  const findUsesKey = (startIndex: number, baseIndent: number) => {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? "";
      const normalized = normalizeLine(rawLine);
      const indent = (rawLine.match(LINE_INDENT_RE)?.[0] ?? "").length;
      if (indent <= baseIndent) {
        break;
      }
      const trimmed = normalized.trim();
      const match = YAML_USES_KEY_RE.exec(trimmed);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return null;
  };
  const findNameKey = (startIndex: number, baseIndent: number) => {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? "";
      const normalized = normalizeLine(rawLine);
      const indent = (rawLine.match(LINE_INDENT_RE)?.[0] ?? "").length;
      if (indent <= baseIndent) {
        break;
      }
      const trimmed = normalized.trim();
      const match = YAML_NAME_KEY_RE.exec(trimmed);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return null;
  };
  const listAnchorInfo = new Map<number, { listKey: string; anchor: string }>();
  const listAnchorCounts = new Map<string, number>();
  if (!looseKeys) {
    const listContextStack: { indent: number; key: string }[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const normalized = normalizeLine(line);
      const trimmed = normalized.trim();
      const listMatch = YAML_LIST_ITEM_RE.exec(trimmed);
      if (listMatch) {
        const indent = (line.match(LINE_INDENT_RE)?.[0] ?? "").length;
        while (
          listContextStack.length > 0 &&
          (listContextStack.at(-1)?.indent ?? 0) >= indent
        ) {
          listContextStack.pop();
        }
        const contextKey = listContextStack.map((entry) => entry.key).join(">");
        const key = listMatch[1]?.trim() ?? "";
        const value = listMatch[2]?.trim() ?? "";
        const nameValue = key === "name" ? value : findNameKey(index, indent);
        const usesValue = key === "uses" ? value : findUsesKey(index, indent);
        let anchorBase = value ? `__ITEM__${key}::${value}` : `__ITEM__${key}`;
        if (usesValue) {
          anchorBase = `__ITEM__uses::${usesValue}`;
        } else if (nameValue) {
          anchorBase = `__ITEM__name::${nameValue}`;
        }
        const anchor = contextKey ? `${contextKey}::${anchorBase}` : anchorBase;
        const listKey = anchor;
        listAnchorInfo.set(index, { listKey, anchor });
        listAnchorCounts.set(listKey, (listAnchorCounts.get(listKey) ?? 0) + 1);
      }
      const parsed = parseYamlKey(line);
      if (parsed) {
        const { indent, key } = parsed;
        while (
          listContextStack.length > 0 &&
          (listContextStack.at(-1)?.indent ?? 0) >= indent
        ) {
          listContextStack.pop();
        }
        listContextStack.push({ indent, key });
      }
    }
  }
  const listAnchorRemaining = new Map(listAnchorCounts);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const normalized = normalizeLine(line);
    const trimmed = normalized.trim();
    const simple = getSimpleYamlComparable(trimmed);
    if (simple !== null) {
      comparables.push(simple);
      continue;
    }
    const listMatch = YAML_LIST_ITEM_RE.exec(trimmed);
    if (listMatch) {
      const indent = (line.match(LINE_INDENT_RE)?.[0] ?? "").length;
      const key = listMatch[1]?.trim() ?? "";
      const value = listMatch[2]?.trim() ?? "";
      let comparable = value ? `__ITEM__${key}::${value}` : `__ITEM__${key}`;
      if (!looseKeys) {
        const listInfo = listAnchorInfo.get(index);
        if (listInfo) {
          const remaining = listAnchorRemaining.get(listInfo.listKey);
          if (remaining !== undefined) {
            comparable = `${listInfo.anchor}::__IDX__${remaining}`;
            listAnchorRemaining.set(listInfo.listKey, remaining - 1);
          } else {
            comparable = listInfo.anchor;
          }
        } else {
          const usesValue = findUsesKey(index, indent);
          if (usesValue) {
            comparable = `__ITEM__uses::${usesValue}`;
          }
        }
      }
      if (looseKeys) {
        comparables.push(`${indent}:${comparable}`);
      } else {
        while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) {
          stack.pop();
        }
        stack.push({ indent, key: comparable });
        const path = stack.map((entry) => entry.key).join(">");
        comparables.push(path);
      }
      continue;
    }
    const parsed = parseYamlKey(line);
    if (!parsed) {
      const contextPath = stack.map((entry) => entry.key).join(">");
      comparables.push(
        contextPath ? `${contextPath}::${normalized}` : normalized
      );
      continue;
    }
    const { indent, key } = parsed;
    if (indent === 0) {
      topKey = key;
      currentPackage = "";
      packageStack.length = 0;
    }
    if (looseKeys) {
      const resolved = resolveLooseYamlComparableWithPackages(
        topKey,
        indent,
        key,
        currentPackage,
        packageStack
      );
      currentPackage = resolved.currentPackage;
      comparables.push(resolved.key);
      continue;
    }
    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) {
      stack.pop();
    }
    stack.push({ indent, key });
    const path = stack.map((entry) => entry.key).join(">");
    comparables.push(path);
  }
  return comparables;
}

function appendUnifiedReplaceRows(
  rows: LineRow[],
  deleteLines: string[],
  insertLines: string[],
  oldLine: number,
  newLine: number
) {
  let nextOld = oldLine;
  let nextNew = newLine;
  for (const line of deleteLines) {
    rows.push({ type: "delete", oldLine: nextOld, newLine: null, text: line });
    nextOld += 1;
  }
  for (const line of insertLines) {
    rows.push({ type: "insert", oldLine: null, newLine: nextNew, text: line });
    nextNew += 1;
  }
  return { oldLine: nextOld, newLine: nextNew };
}

function computeAlignedCost(
  edits: LineEdit[],
  deleteLines: string[],
  insertLines: string[],
  lineLayout: "split" | "unified"
) {
  let alignedCost = 0;
  let equalCount = 0;
  let oldIndex = 0;
  let newIndex = 0;
  for (const edit of edits) {
    if (edit.type === "equal") {
      equalCount += 1;
      const oldText = deleteLines[oldIndex] ?? "";
      const newText = insertLines[newIndex] ?? "";
      if (oldText !== newText) {
        alignedCost += lineLayout === "unified" ? 2 : 1;
      }
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (edit.type === "delete") {
      alignedCost += 1;
      oldIndex += 1;
      continue;
    }
    alignedCost += 1;
    newIndex += 1;
  }
  return { alignedCost, equalCount };
}

function appendAlignedEditsRows(
  rows: LineRow[],
  edits: LineEdit[],
  deleteLines: string[],
  insertLines: string[],
  oldLine: number,
  newLine: number,
  lineLayout: "split" | "unified"
) {
  let nextOld = oldLine;
  let nextNew = newLine;
  let oldIndex = 0;
  let newIndex = 0;
  for (const edit of edits) {
    if (edit.type === "equal") {
      const oldText = deleteLines[oldIndex] ?? "";
      const newText = insertLines[newIndex] ?? "";
      if (lineLayout === "unified") {
        if (oldText === newText) {
          rows.push({
            type: "equal",
            oldLine: nextOld,
            newLine: nextNew,
            text: oldText,
          });
        } else {
          rows.push({
            type: "delete",
            oldLine: nextOld,
            newLine: null,
            text: oldText,
          });
          rows.push({
            type: "insert",
            oldLine: null,
            newLine: nextNew,
            text: newText,
          });
        }
      } else if (oldText === newText) {
        rows.push({
          type: "equal",
          oldLine: nextOld,
          newLine: nextNew,
          text: oldText,
        });
      } else {
        rows.push({
          type: "replace",
          oldLine: nextOld,
          newLine: nextNew,
          oldText,
          newText,
        });
      }
      nextOld += 1;
      nextNew += 1;
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (edit.type === "delete") {
      const oldText = deleteLines[oldIndex] ?? "";
      rows.push({
        type: "delete",
        oldLine: nextOld,
        newLine: null,
        text: oldText,
      });
      nextOld += 1;
      oldIndex += 1;
      continue;
    }
    const newText = insertLines[newIndex] ?? "";
    rows.push({
      type: "insert",
      oldLine: null,
      newLine: nextNew,
      text: newText,
    });
    nextNew += 1;
    newIndex += 1;
  }

  return { oldLine: nextOld, newLine: nextNew };
}

function appendAlignedReplaceRows(
  rows: LineRow[],
  deleteLines: string[],
  insertLines: string[],
  oldLine: number,
  newLine: number,
  lineLayout: "split" | "unified",
  normalizeLine: (line: string) => string,
  preferIndexPairing?: boolean,
  useYamlComparable?: boolean,
  oldComparableOverride?: string[],
  newComparableOverride?: string[]
) {
  const importOldKeys = useYamlComparable
    ? null
    : buildMultilineImportKeys(deleteLines);
  const importNewKeys = useYamlComparable
    ? null
    : buildMultilineImportKeys(insertLines);
  const hasYamlOverride =
    useYamlComparable &&
    oldComparableOverride &&
    newComparableOverride &&
    oldComparableOverride.length === deleteLines.length &&
    newComparableOverride.length === insertLines.length;
  let oldComparable: string[];
  let newComparable: string[];
  if (useYamlComparable) {
    if (hasYamlOverride && oldComparableOverride && newComparableOverride) {
      oldComparable = oldComparableOverride;
      newComparable = newComparableOverride;
    } else {
      oldComparable = buildYamlComparableLines(
        deleteLines,
        normalizeLine,
        false
      );
      newComparable = buildYamlComparableLines(
        insertLines,
        normalizeLine,
        false
      );
    }
  } else {
    oldComparable = deleteLines.map((line, index) => {
      const key = buildLineMatchKey(line, normalizeLine);
      const importKey = importOldKeys?.[index] ?? null;
      return importKey ? `${key}__${importKey}` : key;
    });
    newComparable = insertLines.map((line, index) => {
      const key = buildLineMatchKey(line, normalizeLine);
      const importKey = importNewKeys?.[index] ?? null;
      return importKey ? `${key}__${importKey}` : key;
    });
  }
  const oldKeyCounts = buildLineKeyCounts(oldComparable, (line) => line);
  const newKeyCounts = buildLineKeyCounts(newComparable, (line) => line);
  const disambiguate = (
    line: string,
    key: string,
    oldCount: number,
    newCount: number
  ) => (oldCount > 1 || newCount > 1 ? `${key}__${normalizeLine(line)}` : key);
  const resolvedOldComparable = oldComparable.map((key, index) =>
    key
      ? disambiguate(
          deleteLines[index] ?? "",
          key,
          oldKeyCounts.get(key) ?? 0,
          newKeyCounts.get(key) ?? 0
        )
      : key
  );
  const resolvedNewComparable = newComparable.map((key, index) =>
    key
      ? disambiguate(
          insertLines[index] ?? "",
          key,
          oldKeyCounts.get(key) ?? 0,
          newKeyCounts.get(key) ?? 0
        )
      : key
  );
  const edits = diffLines(
    deleteLines,
    insertLines,
    resolvedOldComparable,
    resolvedNewComparable
  );
  const indexCost =
    lineLayout === "unified"
      ? deleteLines.length + insertLines.length
      : Math.max(deleteLines.length, insertLines.length);
  const { alignedCost, equalCount } = computeAlignedCost(
    edits,
    deleteLines,
    insertLines,
    lineLayout
  );
  const maxLen = Math.max(deleteLines.length, insertLines.length);
  const matchRatio = maxLen > 0 ? equalCount / maxLen : 0;
  const hasReorderableLines =
    deleteLines.some(isReorderableLine) && insertLines.some(isReorderableLine);
  const shouldIndexPair =
    !(useYamlComparable || hasReorderableLines) &&
    (alignedCost > indexCost ||
      (preferIndexPairing && matchRatio > 0 && matchRatio < 0.35));
  if (shouldIndexPair) {
    return lineLayout === "unified"
      ? appendUnifiedReplaceRows(
          rows,
          deleteLines,
          insertLines,
          oldLine,
          newLine
        )
      : appendSplitReplaceRows(
          rows,
          deleteLines,
          insertLines,
          oldLine,
          newLine
        );
  }
  return appendAlignedEditsRows(
    rows,
    edits,
    deleteLines,
    insertLines,
    oldLine,
    newLine,
    lineLayout
  );
}

function appendSplitReplaceRows(
  rows: LineRow[],
  deleteLines: string[],
  insertLines: string[],
  oldLine: number,
  newLine: number
) {
  let nextOld = oldLine;
  let nextNew = newLine;
  const max = Math.max(deleteLines.length, insertLines.length);
  for (let idx = 0; idx < max; idx += 1) {
    const oldTextLine = deleteLines[idx];
    const newTextLine = insertLines[idx];
    if (oldTextLine !== undefined && newTextLine !== undefined) {
      rows.push({
        type: "replace",
        oldLine: nextOld,
        newLine: nextNew,
        oldText: oldTextLine,
        newText: newTextLine,
      });
      nextOld += 1;
      nextNew += 1;
      continue;
    }
    if (oldTextLine !== undefined) {
      rows.push({
        type: "delete",
        oldLine: nextOld,
        newLine: null,
        text: oldTextLine,
      });
      nextOld += 1;
      continue;
    }
    if (newTextLine !== undefined) {
      rows.push({
        type: "insert",
        oldLine: null,
        newLine: nextNew,
        text: newTextLine,
      });
      nextNew += 1;
    }
  }
  return { oldLine: nextOld, newLine: nextNew };
}

function appendBlockRows(
  rows: LineRow[],
  block: LineBlock,
  oldLine: number,
  newLine: number,
  lineLayout: "split" | "unified",
  newLines?: string[],
  allowKeyReplace?: boolean
) {
  let nextOld = oldLine;
  let nextNew = newLine;
  for (const line of block.lines) {
    if (block.type === "equal") {
      const newText =
        newLines && newLines[nextNew - 1] !== undefined
          ? (newLines[nextNew - 1] ?? "")
          : line;
      if (allowKeyReplace && newLines && line !== newText) {
        if (lineLayout === "unified") {
          rows.push({
            type: "delete",
            oldLine: nextOld,
            newLine: null,
            text: line,
          });
          rows.push({
            type: "insert",
            oldLine: null,
            newLine: nextNew,
            text: newText,
          });
        } else {
          rows.push({
            type: "replace",
            oldLine: nextOld,
            newLine: nextNew,
            oldText: line,
            newText,
          });
        }
      } else {
        rows.push({
          type: "equal",
          oldLine: nextOld,
          newLine: nextNew,
          text: line,
        });
      }
      nextOld += 1;
      nextNew += 1;
      continue;
    }
    if (block.type === "delete") {
      rows.push({
        type: "delete",
        oldLine: nextOld,
        newLine: null,
        text: line,
      });
      nextOld += 1;
      continue;
    }
    rows.push({ type: "insert", oldLine: null, newLine: nextNew, text: line });
    nextNew += 1;
  }
  return { oldLine: nextOld, newLine: nextNew };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: block merging is clearer inline.
function buildRowsFromBlocks(
  blocks: LineBlock[],
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string,
  newLines?: string[],
  useKeyMatching?: boolean,
  useYamlComparable?: boolean,
  oldComparable?: string[],
  newComparable?: string[]
) {
  const rows: LineRow[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block) {
      continue;
    }
    const next = blocks[i + 1];

    if (block.type === "delete" && next?.type === "insert") {
      const reorderedLines = reorderInsertLines(
        block.lines,
        next.lines,
        normalizeLine
      );
      const insertLines = reorderedLines ?? next.lines;
      const shouldAlign =
        normalizeLine !== undefined &&
        !useYamlComparable &&
        block.lines.length + insertLines.length <= 4000;
      const oldComparableSlice =
        useYamlComparable && oldComparable
          ? oldComparable.slice(oldLine - 1, oldLine - 1 + block.lines.length)
          : undefined;
      const newComparableSlice =
        useYamlComparable && newComparable
          ? newComparable.slice(newLine - 1, newLine - 1 + insertLines.length)
          : undefined;
      let result: { oldLine: number; newLine: number };
      if (shouldAlign && normalizeLine) {
        result = appendAlignedReplaceRows(
          rows,
          block.lines,
          insertLines,
          oldLine,
          newLine,
          lineLayout,
          normalizeLine,
          useKeyMatching,
          useYamlComparable,
          oldComparableSlice,
          newComparableSlice
        );
      } else if (lineLayout === "unified") {
        result = appendUnifiedReplaceRows(
          rows,
          block.lines,
          insertLines,
          oldLine,
          newLine
        );
      } else {
        result = appendSplitReplaceRows(
          rows,
          block.lines,
          insertLines,
          oldLine,
          newLine
        );
      }
      oldLine = result.oldLine;
      newLine = result.newLine;
      i += 1;
      continue;
    }

    const result = appendBlockRows(
      rows,
      block,
      oldLine,
      newLine,
      lineLayout,
      newLines,
      useKeyMatching
    );
    oldLine = result.oldLine;
    newLine = result.newLine;
  }

  return rows;
}

function rowText(row: LineRow) {
  return row.text ?? row.oldText ?? row.newText ?? "";
}

function rowOldText(row: LineRow) {
  return row.oldText ?? row.text ?? "";
}

function rowNewText(row: LineRow) {
  return row.newText ?? row.text ?? "";
}

function addRangeLines(
  range: Range | undefined,
  target: Set<number>,
  maxLine: number
) {
  if (!range || maxLine <= 0) {
    return;
  }
  let start = Math.max(1, Math.min(maxLine, range.start.line));
  let end = Math.max(1, Math.min(maxLine, range.end.line));
  if (range.end.column <= 1 && end > start) {
    end -= 1;
  }
  if (end < start) {
    [start, end] = [end, start];
  }
  for (let line = start; line <= end; line += 1) {
    target.add(line);
  }
}

function buildLineMarkSets(
  operations: readonly DiffOperation[],
  oldLineCount: number,
  newLineCount: number
) {
  const changedOld = new Set<number>();
  const changedNew = new Set<number>();
  const movedOld = new Set<number>();
  const movedNew = new Set<number>();

  for (const op of operations) {
    switch (op.type) {
      case "insert":
        addRangeLines(op.newRange, changedNew, newLineCount);
        break;
      case "delete":
        addRangeLines(op.oldRange, changedOld, oldLineCount);
        break;
      case "update":
        addRangeLines(op.oldRange, changedOld, oldLineCount);
        addRangeLines(op.newRange, changedNew, newLineCount);
        break;
      case "move":
        addRangeLines(op.oldRange, movedOld, oldLineCount);
        addRangeLines(op.newRange, movedNew, newLineCount);
        break;
      default:
        break;
    }
  }

  return { changedOld, changedNew, movedOld, movedNew };
}

function expandRangeLines(range: Range | undefined, maxLine: number) {
  if (!range || maxLine <= 0) {
    return [];
  }
  let start = Math.max(1, Math.min(maxLine, range.start.line));
  let end = Math.max(1, Math.min(maxLine, range.end.line));
  if (range.end.column <= 1 && end > start) {
    end -= 1;
  }
  if (end < start) {
    [start, end] = [end, start];
  }
  const lines: number[] = [];
  for (let line = start; line <= end; line += 1) {
    lines.push(line);
  }
  return lines;
}

function buildMoveLineMap(
  operations: readonly DiffOperation[],
  oldLineCount: number,
  newLineCount: number
) {
  const oldToNew = new Map<number, number>();
  const newToOld = new Map<number, number>();
  for (const op of operations) {
    if (op.type !== "move") {
      continue;
    }
    const oldLines = expandRangeLines(op.oldRange, oldLineCount);
    const newLines = expandRangeLines(op.newRange, newLineCount);
    const total = Math.min(oldLines.length, newLines.length);
    for (let idx = 0; idx < total; idx += 1) {
      const oldLine = oldLines[idx];
      const newLine = newLines[idx];
      if (!(oldLine && newLine)) {
        continue;
      }
      if (oldToNew.has(oldLine) || newToOld.has(newLine)) {
        continue;
      }
      oldToNew.set(oldLine, newLine);
      newToOld.set(newLine, oldLine);
    }
  }
  return { oldToNew, newToOld };
}

interface MoveRowEntry {
  row: LineRow;
  index: number;
}

function collectMoveRows(rows: LineRow[]) {
  const oldMoves = new Map<number, MoveRowEntry>();
  const newMoves = new Map<number, MoveRowEntry>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.type !== "move") {
      continue;
    }
    const hasOld = row.oldLine != null;
    const hasNew = row.newLine != null;
    if (hasOld && !hasNew) {
      oldMoves.set(row.oldLine ?? 0, { row, index });
      continue;
    }
    if (hasNew && !hasOld) {
      newMoves.set(row.newLine ?? 0, { row, index });
    }
  }
  return { oldMoves, newMoves };
}

function buildMergedMoveRow(
  oldLine: number,
  newLine: number,
  oldText: string,
  newText: string,
  normalizeLine: (line: string) => string
): LineRow {
  if (normalizeLine(oldText) === normalizeLine(newText)) {
    return { type: "equal", oldLine, newLine, text: oldText };
  }
  return { type: "move", oldLine, newLine, oldText, newText };
}

function mergeMoveFromOld(
  row: LineRow,
  newMoves: Map<number, MoveRowEntry>,
  oldToNew: Map<number, number>,
  used: Set<number>,
  oldLines: string[],
  newLines: string[],
  normalizeLine: (line: string) => string
): LineRow | null {
  if (row.oldLine == null || row.newLine != null) {
    return null;
  }
  const oldLine = row.oldLine;
  const newLine = oldToNew.get(oldLine) ?? null;
  if (!newLine) {
    return null;
  }
  const match = newMoves.get(newLine) ?? null;
  if (!match) {
    return null;
  }
  used.add(match.index);
  const oldText = oldLines[oldLine - 1] ?? row.oldText ?? row.text ?? "";
  const newText =
    newLines[newLine - 1] ?? match.row.newText ?? match.row.text ?? "";
  return buildMergedMoveRow(oldLine, newLine, oldText, newText, normalizeLine);
}

function mergeMoveFromNew(
  row: LineRow,
  oldMoves: Map<number, MoveRowEntry>,
  newToOld: Map<number, number>,
  used: Set<number>,
  oldLines: string[],
  newLines: string[],
  normalizeLine: (line: string) => string
): LineRow | null {
  if (row.newLine == null || row.oldLine != null) {
    return null;
  }
  const newLine = row.newLine;
  const oldLine = newToOld.get(newLine) ?? null;
  if (!oldLine) {
    return null;
  }
  const match = oldMoves.get(oldLine) ?? null;
  if (!match) {
    return null;
  }
  used.add(match.index);
  const oldText =
    oldLines[oldLine - 1] ?? match.row.oldText ?? match.row.text ?? "";
  const newText = newLines[newLine - 1] ?? row.newText ?? row.text ?? "";
  return buildMergedMoveRow(oldLine, newLine, oldText, newText, normalizeLine);
}

function collapseMoveRows(
  rows: LineRow[],
  operations: readonly DiffOperation[],
  oldLines: string[],
  newLines: string[],
  normalizeLine?: (line: string) => string
) {
  if (!normalizeLine || rows.length === 0) {
    return rows;
  }
  const { oldToNew, newToOld } = buildMoveLineMap(
    operations,
    oldLines.length,
    newLines.length
  );
  if (oldToNew.size === 0) {
    return rows;
  }

  const { oldMoves, newMoves } = collectMoveRows(rows);
  if (oldMoves.size === 0 && newMoves.size === 0) {
    return rows;
  }

  const used = new Set<number>();
  const output: LineRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (used.has(index)) {
      continue;
    }
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (row.type !== "move") {
      output.push(row);
      continue;
    }
    const merged =
      mergeMoveFromOld(
        row,
        newMoves,
        oldToNew,
        used,
        oldLines,
        newLines,
        normalizeLine
      ) ??
      mergeMoveFromNew(
        row,
        oldMoves,
        newToOld,
        used,
        oldLines,
        newLines,
        normalizeLine
      );
    output.push(merged ?? row);
  }
  return output;
}

function toEqualRow(row: LineRow): LineRow {
  return {
    type: "equal",
    oldLine: row.oldLine ?? null,
    newLine: row.newLine ?? null,
    text: rowText(row),
  };
}

function toInsertRow(row: LineRow): LineRow {
  return {
    type: "insert",
    oldLine: null,
    newLine: row.newLine ?? null,
    text: rowNewText(row),
  };
}

function toDeleteRow(row: LineRow): LineRow {
  return {
    type: "delete",
    oldLine: row.oldLine ?? null,
    newLine: null,
    text: rowOldText(row),
  };
}

function toReplaceRow(row: LineRow): LineRow {
  return {
    type: "replace",
    oldLine: row.oldLine ?? null,
    newLine: row.newLine ?? null,
    oldText: rowOldText(row),
    newText: rowNewText(row),
  };
}

function toMoveRow(
  row: LineRow,
  includeOld: boolean,
  includeNew: boolean
): LineRow {
  const oldLine = includeOld ? (row.oldLine ?? null) : null;
  const newLine = includeNew ? (row.newLine ?? null) : null;
  const oldText = includeOld ? rowOldText(row) : undefined;
  const newText = includeNew ? rowNewText(row) : undefined;
  const output: LineRow = {
    type: "move",
    oldLine,
    newLine,
  };
  if (oldText !== undefined) {
    output.oldText = oldText;
  }
  if (newText !== undefined) {
    output.newText = newText;
  }
  return output;
}

function applyLineOperationToRow(
  row: LineRow,
  marks: ReturnType<typeof buildLineMarkSets>,
  normalizeLine?: (line: string) => string
) {
  if (row.type === "gap" || row.type === "hunk") {
    return row;
  }
  const oldLine = row.oldLine ?? null;
  const newLine = row.newLine ?? null;
  const oldChanged = oldLine !== null && marks.changedOld.has(oldLine);
  const newChanged = newLine !== null && marks.changedNew.has(newLine);
  const oldMoved = oldLine !== null && marks.movedOld.has(oldLine);
  const newMoved = newLine !== null && marks.movedNew.has(newLine);

  if (row.type !== "equal") {
    return row;
  }

  if (normalizeLine) {
    const hasBothLines = row.oldLine != null && row.newLine != null;
    const oldText = rowOldText(row);
    const newText = rowNewText(row);
    if (
      hasBothLines &&
      oldText !== undefined &&
      newText !== undefined &&
      normalizeLine(oldText) === normalizeLine(newText)
    ) {
      return toEqualRow(row);
    }
  }

  if (oldChanged && newChanged) {
    return toReplaceRow(row);
  }
  if (oldChanged) {
    return toDeleteRow(row);
  }
  if (newChanged) {
    return toInsertRow(row);
  }

  if (oldMoved || newMoved) {
    return toMoveRow(row, oldMoved, newMoved);
  }

  return toEqualRow(row);
}

function applyLineOperations(
  rows: LineRow[],
  operations: readonly DiffOperation[],
  oldLineCount: number,
  newLineCount: number,
  normalizeLine?: (line: string) => string
): LineRow[] {
  if (operations.length === 0) {
    return rows;
  }

  const marks = buildLineMarkSets(operations, oldLineCount, newLineCount);

  return rows.map((row) => applyLineOperationToRow(row, marks, normalizeLine));
}

function applyLineContext(rows: LineRow[], contextLines: number): LineRow[] {
  const changeIndices = rows
    .map((row, index) =>
      row.type === "equal" || row.type === "gap" || row.type === "hunk"
        ? null
        : index
    )
    .filter((value): value is number => value !== null);

  if (changeIndices.length === 0) {
    return rows;
  }

  const visible = new Array(rows.length).fill(false);
  for (const index of changeIndices) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(rows.length - 1, index + contextLines);
    for (let i = start; i <= end; i += 1) {
      visible[i] = true;
    }
  }

  const output: LineRow[] = [];
  let hiddenCount = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (visible[i]) {
      if (hiddenCount > 0) {
        output.push({ type: "gap", hidden: hiddenCount });
        hiddenCount = 0;
      }
      const row = rows[i];
      if (row) {
        output.push(row);
      }
      continue;
    }
    if (rows[i]?.type === "equal") {
      hiddenCount += 1;
    }
  }
  if (hiddenCount > 0) {
    output.push({ type: "gap", hidden: hiddenCount });
  }
  return addHunks(output);
}

function buildLineRows(
  oldText: string,
  newText: string,
  contextLines: number,
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string,
  operations: readonly DiffOperation[] = [],
  useKeyMatching?: boolean,
  useYamlComparable?: boolean,
  applyOperations = true,
  applySuppression = true
): LineRow[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let rows = buildRawLineRows(
    oldLines,
    newLines,
    lineLayout,
    normalizeLine,
    useKeyMatching,
    useYamlComparable
  );
  if (!useYamlComparable) {
    rows = pairIdenticalLineMoves(rows, normalizeLine);
  }
  if (applyOperations) {
    rows = applyLineOperations(
      rows,
      operations,
      oldLines.length,
      newLines.length,
      normalizeLine
    );
    rows = collapseMoveRows(
      rows,
      operations,
      oldLines,
      newLines,
      normalizeLine
    );
    if (applySuppression) {
      rows = suppressBalancedLineChanges(
        rows,
        oldLines,
        newLines,
        normalizeLine,
        useYamlComparable
      );
      rows = suppressImportBlockStarts(rows);
      rows = suppressInlinePropChanges(rows, normalizeLine);
      if (useKeyMatching) {
        rows = suppressRepeatedYamlChanges(
          rows,
          oldLines,
          newLines,
          normalizeLine
        );
      }
    }
  }
  return applyLineContext(rows, contextLines);
}

function addHunks(rows: LineRow[]): LineRow[] {
  const output: LineRow[] = [];
  let block: LineRow[] = [];

  const flush = () => {
    if (block.length === 0) {
      return;
    }
    let startOld: number | null = null;
    let startNew: number | null = null;
    let oldCount = 0;
    let newCount = 0;
    for (const row of block) {
      if (row.oldLine != null) {
        if (startOld === null) {
          startOld = row.oldLine;
        }
        oldCount += 1;
      }
      if (row.newLine != null) {
        if (startNew === null) {
          startNew = row.newLine;
        }
        newCount += 1;
      }
    }
    const header = `@@ -${startOld ?? 0},${oldCount} +${startNew ?? 0},${newCount} @@`;
    output.push({ type: "hunk", header });
    output.push(...block);
    block = [];
  };

  for (const row of rows) {
    if (row.type === "gap") {
      flush();
      output.push(row);
      continue;
    }
    block.push(row);
  }
  flush();
  return output;
}

function renderHunkRow(row: LineRow) {
  return `
    <div class="sd-line sd-line--hunk">
      <div class="sd-hunk">${escapeHtml(row.header ?? "")}</div>
    </div>
  `;
}

function renderGapRow(row: LineRow) {
  const count = row.hidden ?? 0;
  const label = count === 1 ? "1 line hidden" : `${count} lines hidden`;
  return `
    <div class="sd-line sd-line--gap">
      <div class="sd-gap">… ${label} …</div>
    </div>
  `;
}

function getUnifiedPrefix(row: LineRow) {
  if (row.type === "insert") {
    return "+";
  }
  if (row.type === "delete") {
    return "-";
  }
  if (row.type === "move") {
    return ">";
  }
  return "";
}

function getUnifiedText(row: LineRow, oldText: string, newText: string) {
  if (row.type === "insert") {
    return newText;
  }
  if (row.type === "delete") {
    return oldText;
  }
  if (row.type === "move") {
    if (row.newLine !== null && row.oldLine === null) {
      return newText;
    }
    if (row.oldLine !== null && row.newLine === null) {
      return oldText;
    }
    return row.text ?? oldText ?? newText;
  }
  return row.text ?? oldText;
}

function renderUnifiedRow(row: LineRow) {
  const oldNumber = row.oldLine?.toString() ?? "";
  const newNumber = row.newLine?.toString() ?? "";
  const oldText = row.oldText ?? row.text ?? "";
  const newText = row.newText ?? row.text ?? "";
  const rowClass = `sd-line sd-line--${row.type} sd-line--unified`;
  const prefix = getUnifiedPrefix(row);
  const text = getUnifiedText(row, oldText, newText);
  return `
    <div class="${rowClass}">
      <div class="sd-cell sd-gutter">${escapeHtml(oldNumber)}</div>
      <div class="sd-cell sd-gutter">${escapeHtml(newNumber)}</div>
      <div class="sd-cell sd-prefix">${escapeHtml(prefix)}</div>
      <div class="sd-cell sd-code sd-cell--code">${escapeHtml(text)}</div>
    </div>
  `;
}

function renderSplitRow(row: LineRow) {
  const oldNumber = row.oldLine?.toString() ?? "";
  const newNumber = row.newLine?.toString() ?? "";
  const oldText = row.oldText ?? row.text ?? "";
  const newText = row.newText ?? row.text ?? "";
  const rowClass = `sd-line sd-line--${row.type}`;

  if (row.type === "replace") {
    const { oldHtml, newHtml } = renderInlineDiff(oldText, newText);
    return `
      <div class="${rowClass}">
        <div class="sd-cell sd-gutter">${escapeHtml(oldNumber)}</div>
        <div class="sd-cell sd-code sd-cell--old">${oldHtml}</div>
        <div class="sd-cell sd-gutter">${escapeHtml(newNumber)}</div>
        <div class="sd-cell sd-code sd-cell--new">${newHtml}</div>
      </div>
    `;
  }

  return `
    <div class="${rowClass}">
      <div class="sd-cell sd-gutter">${escapeHtml(oldNumber)}</div>
      <div class="sd-cell sd-code sd-cell--old">${escapeHtml(oldText)}</div>
      <div class="sd-cell sd-gutter">${escapeHtml(newNumber)}</div>
      <div class="sd-cell sd-code sd-cell--new">${escapeHtml(newText)}</div>
    </div>
  `;
}

function renderLineRow(row: LineRow, lineLayout: "split" | "unified") {
  if (row.type === "hunk") {
    return renderHunkRow(row);
  }
  if (row.type === "gap") {
    return renderGapRow(row);
  }
  if (lineLayout === "unified") {
    return renderUnifiedRow(row);
  }
  return renderSplitRow(row);
}

const METRIC_TITLE = "Estimated vs raw line changes";

interface RenderContext {
  maxOps: number;
  batchSize: number;
  virtualize: boolean;
  layout: "full" | "embed";
  summaryHtml: string;
  headerHtml: string;
  filePathHtml: string;
  view: "lines" | "semantic";
  lineMode: "raw" | "semantic";
  contextLines: number;
  lineLayout: "split" | "unified";
  canRenderLines: boolean;
  useLineView: boolean;
  title: string;
}

interface HtmlShellOptions {
  title: string;
  layout: "full" | "embed";
  headerHtml: string;
  filePathHtml: string;
  summaryHtml: string;
  sectionHtml: string;
  statusHtml?: string;
  payload?: string;
  script?: string;
}

function buildHeaderHtml(showBanner: boolean, reductionPercent: number) {
  if (!showBanner) {
    return "";
  }
  return `
    <div class="sd-banner">
      <div class="sd-brand">
        <span>Review changes with</span>
        <span class="sd-badge">SemaDiff</span>
      </div>
      <div class="sd-metric" title="${METRIC_TITLE}">
        <span class="sd-metric-value">${reductionPercent}%</span>
        <span class="sd-metric-label">smaller</span>
      </div>
    </div>
  `;
}

function buildFilePathHtml(showFilePath: boolean, filePath?: string) {
  if (!showFilePath) {
    return "";
  }
  if (!filePath) {
    return "";
  }
  return `<div class="sd-file">${escapeHtml(filePath)}</div>`;
}

function buildHtmlShell({
  title,
  layout,
  headerHtml,
  filePathHtml,
  summaryHtml,
  sectionHtml,
  statusHtml,
  payload,
  script,
}: HtmlShellOptions) {
  const bodyClass = layout === "embed" ? "sd-embed" : "";
  const shellClass =
    layout === "embed" ? "sd-shell sd-shell--embed" : "sd-shell";
  const status = statusHtml ?? "";
  const data = payload
    ? `<script>globalThis.__SEMADIFF_DATA__ = ${payload};</script>`
    : "";
  const scripts = script ? `<script>${script}</script>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>${baseStyles}</style>
  </head>
  <body class="${bodyClass}">
    <main class="${shellClass}">
      ${headerHtml}
      ${filePathHtml}
      ${summaryHtml}
      ${sectionHtml}
      ${status}
    </main>
    ${data}
    ${scripts}
  </body>
</html>`;
}

function buildRenderContext(
  diff: DiffDocument,
  options: HtmlRenderOptions
): RenderContext {
  const maxOps = options.maxOperations ?? diff.operations.length;
  const batchSize = options.batchSize ?? Math.min(maxOps, 200);
  const virtualize =
    options.virtualize ?? diff.operations.length > batchSize * 2;
  const showBanner = options.showBanner ?? true;
  const showSummary = options.showSummary ?? true;
  const showFilePath = options.showFilePath ?? true;
  const layout = options.layout ?? "full";
  const summaryHtml = showSummary ? renderSummary(diff) : "";
  const reduction = estimateReduction(diff);
  const headerHtml = buildHeaderHtml(showBanner, reduction.percent);
  const filePathHtml = buildFilePathHtml(showFilePath, options.filePath);
  const title = escapeHtml(options.title ?? "SemaDiff");

  const view =
    options.view ?? (options.oldText && options.newText ? "lines" : "semantic");
  const contextLines = options.contextLines ?? 3;
  const lineLayout = options.lineLayout ?? "split";
  const lineMode = options.lineMode ?? "raw";

  const canRenderLines =
    options.oldText !== undefined && options.newText !== undefined;
  const useLineView = view === "lines" && canRenderLines;

  return {
    maxOps,
    batchSize,
    virtualize,
    layout,
    summaryHtml,
    headerHtml,
    filePathHtml,
    view,
    lineMode,
    contextLines,
    lineLayout,
    canRenderLines,
    useLineView,
    title,
  };
}

function filterSemanticRows(
  rows: LineRow[],
  normalizeLine: (line: string) => string
) {
  const filtered: LineRow[] = [];
  for (const row of rows) {
    if (row.type === "gap" || row.type === "hunk") {
      continue;
    }
    if (row.type === "insert" || row.type === "delete") {
      const text = rowText(row);
      const normalized = normalizeLine(text).trim();
      if (!normalized || isLowInfoSemanticLine(normalized)) {
        continue;
      }
    }
    if (row.type === "replace") {
      const oldValue = row.oldText ?? "";
      const newValue = row.newText ?? "";
      if (normalizeLine(oldValue) === normalizeLine(newValue)) {
        continue;
      }
    }
    filtered.push(row);
  }
  return filtered;
}

const LOCKFILE_HEADER_KEYS = new Set(["dependencies:", "peerDependencies:"]);

function filterLockfileRows(rows: LineRow[]) {
  return rows.filter((row) => {
    if (row.type === "insert" || row.type === "delete") {
      const text = rowText(row).trim();
      if (LOCKFILE_HEADER_KEYS.has(text)) {
        return false;
      }
    }
    return true;
  });
}

function stripContextRows(rows: LineRow[]) {
  return rows.filter((row) => row.type !== "gap" && row.type !== "hunk");
}

function isCommentRow(row: LineRow, language?: NormalizerLanguage) {
  switch (row.type) {
    case "insert":
      return isCommentLineForLanguage(rowNewText(row), language);
    case "delete":
      return isCommentLineForLanguage(rowOldText(row), language);
    case "replace":
      return (
        isCommentLineForLanguage(rowOldText(row), language) &&
        isCommentLineForLanguage(rowNewText(row), language)
      );
    case "move": {
      const oldIs =
        row.oldLine !== null &&
        isCommentLineForLanguage(rowOldText(row), language);
      const newIs =
        row.newLine !== null &&
        isCommentLineForLanguage(rowNewText(row), language);
      if (row.oldLine !== null && row.newLine !== null) {
        return oldIs && newIs;
      }
      return oldIs || newIs;
    }
    case "equal":
      return isCommentLineForLanguage(rowText(row), language);
    default:
      return false;
  }
}

function filterCommentRows(rows: LineRow[], language?: NormalizerLanguage) {
  if (!language || language === "*" || language === "text") {
    return rows;
  }
  return rows.filter((row) => !isCommentRow(row, language));
}

function hasLineChanges(rows: LineRow[]) {
  return rows.some(
    (row) =>
      row.type === "insert" ||
      row.type === "delete" ||
      row.type === "replace" ||
      row.type === "move"
  );
}

function countLineChanges(rows: LineRow[]) {
  return rows.reduce((count, row) => {
    if (
      row.type === "insert" ||
      row.type === "delete" ||
      row.type === "replace" ||
      row.type === "move"
    ) {
      return count + 1;
    }
    return count;
  }, 0);
}

function buildLineVirtualScript(
  batchSize: number,
  lineLayout: "split" | "unified"
) {
  return `
    const raw = globalThis.__SEMADIFF_DATA__;
    const parsed = raw && typeof raw === "object"
      ? raw
      : { rows: [], batchSize: ${batchSize}, lineLayout: "${lineLayout}" };
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const batch = Number(parsed.batchSize || ${batchSize});
    const layout = parsed.lineLayout === "unified" ? "unified" : "split";
    const container = document.getElementById("sd-ops");
    const status = document.getElementById("sd-status");
    let rendered = 0;

    function renderRow(row) {
      if (!container) return;
      if (row.type === "hunk") {
        const hunk = document.createElement("div");
        hunk.className = "sd-line sd-line--hunk";
        const inner = document.createElement("div");
        inner.className = "sd-hunk";
        inner.textContent = row.header ?? "";
        hunk.appendChild(inner);
        container.appendChild(hunk);
        return;
      }
      if (row.type === "gap") {
        const gap = document.createElement("div");
        gap.className = "sd-line sd-line--gap";
        const label = row.hidden === 1 ? "1 line hidden" : row.hidden + " lines hidden";
        const inner = document.createElement("div");
        inner.className = "sd-gap";
        inner.textContent = "… " + label + " …";
        gap.appendChild(inner);
        container.appendChild(gap);
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className =
        "sd-line sd-line--" + row.type + (layout === "unified" ? " sd-line--unified" : "");

      const oldNumber = document.createElement("div");
      oldNumber.className = "sd-cell sd-gutter";
      oldNumber.textContent = row.oldLine ?? "";

      const newNumber = document.createElement("div");
      newNumber.className = "sd-cell sd-gutter";
      newNumber.textContent = row.newLine ?? "";

      if (layout === "unified") {
        const code = document.createElement("div");
        code.className = "sd-cell sd-code sd-cell--code";
        const prefix = document.createElement("div");
        prefix.className = "sd-cell sd-prefix";
        prefix.textContent =
          row.type === "insert"
            ? "+"
            : row.type === "delete"
            ? "-"
            : row.type === "move"
            ? ">"
            : "";
        const text =
          row.type === "insert"
            ? row.newText ?? row.text ?? ""
            : row.type === "delete"
            ? row.oldText ?? row.text ?? ""
            : row.type === "move"
            ? row.newLine !== null && row.oldLine === null
              ? row.newText ?? row.text ?? ""
              : row.oldLine !== null && row.newLine === null
              ? row.oldText ?? row.text ?? ""
              : row.text ?? row.oldText ?? row.newText ?? ""
            : row.text ?? row.oldText ?? row.newText ?? "";
        code.textContent = text;
        wrapper.append(oldNumber, newNumber, prefix, code);
      } else {
        const oldCell = document.createElement("div");
        oldCell.className = "sd-cell sd-code sd-cell--old";
        oldCell.textContent = row.oldText ?? row.text ?? "";

        const newCell = document.createElement("div");
        newCell.className = "sd-cell sd-code sd-cell--new";
        newCell.textContent = row.newText ?? row.text ?? "";

        wrapper.append(oldNumber, oldCell, newNumber, newCell);
      }
      container.appendChild(wrapper);
    }

    function renderBatch() {
      if (!container) return;
      const slice = rows.slice(rendered, rendered + batch);
      slice.forEach(renderRow);
      rendered += slice.length;
      if (status) {
        status.textContent = "Loaded " + rendered + " of " + rows.length + " rows.";
      }
      if (rendered >= rows.length) {
        window.removeEventListener("scroll", onScroll);
      }
    }

    function onScroll() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.bottom - window.innerHeight < 600) {
        renderBatch();
      }
    }

    renderBatch();
    window.addEventListener("scroll", onScroll);
  `;
}

function buildOpsVirtualScript(batchSize: number) {
  return `
    const raw = globalThis.__SEMADIFF_DATA__;
    const parsed = raw && typeof raw === "object"
      ? raw
      : { operations: [], batchSize: ${batchSize} };
    const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
    const batch = Number(parsed.batchSize || ${batchSize});
    const container = document.getElementById("sd-ops");
    const status = document.getElementById("sd-status");
    let rendered = 0;

    function formatRangeLabel(range) {
      if (!range) return "";
      if (range.start.line === range.end.line) {
        return "L" + range.start.line;
      }
      return "L" + range.start.line + "-" + range.end.line;
    }

    function formatRangeDetail(range) {
      if (!range) return "";
      const start = "L" + range.start.line + ":" + range.start.column;
      const end = "L" + range.end.line + ":" + range.end.column;
      return start + "-" + end;
    }

    function previewText(text) {
      if (!text) return { value: "", truncated: false };
      if (text.length <= 400) return { value: text, truncated: false };
      return { value: text.slice(0, 400) + "\n…", truncated: true };
    }

    function buildSide(title, text, variant, truncated) {
      const side = document.createElement("div");
      side.className = "sd-side sd-side--" + variant;

      const label = document.createElement("div");
      label.className = "sd-side-title";
      label.textContent = title;

      const pre = document.createElement("pre");
      pre.textContent = text;

      side.append(label, pre);
      if (truncated) {
        const note = document.createElement("div");
        note.className = "sd-truncate";
        note.textContent = "Preview truncated";
        side.append(note);
      }
      return side;
    }

    function buildOpCard(op) {
      const wrapper = document.createElement("article");
      wrapper.className = "sd-op sd-op--" + op.type;
      wrapper.dataset.opId = op.id;

      const header = document.createElement("div");
      header.className = "sd-op-header";

      const tag = document.createElement("span");
      tag.className = "sd-op-tag";
      tag.textContent = String(op.type || "").toUpperCase();

      const range = document.createElement("span");
      range.className = "sd-op-range";
      const oldLabel = formatRangeLabel(op.oldRange);
      const newLabel = formatRangeLabel(op.newRange);
      const detail = [formatRangeDetail(op.oldRange), formatRangeDetail(op.newRange)]
        .filter(Boolean)
        .join(" → ");
      range.textContent = [oldLabel, newLabel].filter(Boolean).join(" → ");
      if (detail) {
        range.setAttribute("title", detail);
      }

      header.append(tag, range);
      if (typeof op.confidence === "number") {
        const meta = document.createElement("span");
        meta.className = "sd-op-meta";
        meta.textContent = "Confidence " + Math.round(op.confidence * 100) + "%";
        header.append(meta);
      }

      const body = document.createElement("div");
      body.className = "sd-op-body";

      const oldPreview = previewText(op.oldText);
      const newPreview = previewText(op.newText);

      if (op.type === "insert") {
        if (newPreview.value) {
          body.append(buildSide("After", newPreview.value, "new", newPreview.truncated));
        }
      } else if (op.type === "delete") {
        if (oldPreview.value) {
          body.append(buildSide("Before", oldPreview.value, "old", oldPreview.truncated));
        }
      } else {
        if (oldPreview.value) {
          body.append(buildSide("Before", oldPreview.value, "old", oldPreview.truncated));
        }
        if (newPreview.value) {
          body.append(buildSide("After", newPreview.value, "new", newPreview.truncated));
        }
      }

      if (body.children.length > 1) {
        body.classList.add("sd-op-body--split");
      }

      wrapper.append(header, body);
      return wrapper;
    }

    function renderBatch() {
      if (!container) return;
      const slice = operations.slice(rendered, rendered + batch);
      slice.forEach((op) => {
        container.appendChild(buildOpCard(op));
      });
      rendered += slice.length;
      if (status) {
        status.textContent = "Loaded " + rendered + " of " + operations.length + " operations.";
      }
      if (rendered >= operations.length) {
        window.removeEventListener("scroll", onScroll);
      }
    }

    function onScroll() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.bottom - window.innerHeight < 600) {
        renderBatch();
      }
    }

    renderBatch();
    window.addEventListener("scroll", onScroll);
  `;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render flow is clearer in one place
function renderLineView(
  diff: DiffDocument,
  options: HtmlRenderOptions,
  context: RenderContext
) {
  if (!context.canRenderLines) {
    return "";
  }
  const isYamlPath =
    options.filePath?.endsWith(".yml") || options.filePath?.endsWith(".yaml");
  const yamlLanguage = options.language === "yaml" || Boolean(isYamlPath);
  const normalizeLine =
    context.lineMode === "semantic"
      ? (line: string) =>
          normalizeLineForSemantic(
            line,
            yamlLanguage ? "yaml" : options.language
          )
      : undefined;
  const oldText = options.oldText ?? "";
  const newText = options.newText ?? "";
  const isPnpmLock =
    options.filePath?.endsWith("pnpm-lock.yaml") ||
    (oldText.includes("lockfileVersion:") && oldText.includes("importers:")) ||
    (newText.includes("lockfileVersion:") && newText.includes("importers:"));
  const useKeyMatching = Boolean(normalizeLine && isPnpmLock);
  const useYamlComparable = Boolean(normalizeLine && yamlLanguage);
  const rawRows = buildLineRows(
    oldText,
    newText,
    context.contextLines,
    context.lineLayout,
    undefined,
    diff.operations,
    false,
    false,
    false,
    false
  );
  let rows = buildLineRows(
    oldText,
    newText,
    context.contextLines,
    context.lineLayout,
    normalizeLine,
    diff.operations,
    useKeyMatching,
    useYamlComparable,
    context.lineMode === "semantic",
    context.lineMode === "semantic"
  );
  if (context.lineMode === "semantic" && normalizeLine) {
    rows = filterSemanticRows(rows, normalizeLine);
  }
  if (useKeyMatching) {
    rows = filterLockfileRows(rows);
  }
  const hideComments = Boolean(options.hideComments);
  const applyHideComments = (nextRows: LineRow[]) =>
    applyLineContext(
      filterCommentRows(stripContextRows(nextRows), options.language),
      context.contextLines
    );
  const rawForCompare = hideComments ? applyHideComments(rawRows) : rawRows;
  let rowsForCompare = hideComments ? applyHideComments(rows) : rows;
  let warningHtml = "";
  if (context.lineMode === "semantic" && normalizeLine) {
    const rawCount = countLineChanges(rawForCompare);
    const semanticCount = countLineChanges(rowsForCompare);
    if (semanticCount === 0) {
      warningHtml = renderSemanticFallbackWarning();
      rowsForCompare = rawForCompare;
    } else if (rawCount > 0 && rawCount < semanticCount) {
      warningHtml = renderSemanticNoiseWarning();
      rowsForCompare = rawForCompare;
    }
  }
  rows = rowsForCompare;
  if (!hasLineChanges(rows)) {
    return "";
  }

  const summaryHtml = [context.summaryHtml, warningHtml]
    .filter(Boolean)
    .join("\n");

  if (!context.virtualize) {
    const body = rows
      .map((row) => renderLineRow(row, context.lineLayout))
      .join("\n");
    const sectionHtml = `<section class="sd-lines">${body}</section>`;
    return buildHtmlShell({
      title: context.title,
      layout: context.layout,
      headerHtml: context.headerHtml,
      filePathHtml: context.filePathHtml,
      summaryHtml,
      sectionHtml,
    });
  }

  const payload = escapeScript(
    Schema.encodeSync(LinePayloadJson)({
      rows,
      batchSize: context.batchSize,
      lineLayout: context.lineLayout,
    })
  );
  const sectionHtml = `<section class="sd-lines" id="sd-ops"></section>`;
  const statusHtml = `<div id="sd-status"></div>`;
  const script = buildLineVirtualScript(context.batchSize, context.lineLayout);
  return buildHtmlShell({
    title: context.title,
    layout: context.layout,
    headerHtml: context.headerHtml,
    filePathHtml: context.filePathHtml,
    summaryHtml,
    sectionHtml,
    statusHtml,
    payload,
    script,
  });
}

function renderOperationsView(diff: DiffDocument, context: RenderContext) {
  if (!context.virtualize) {
    const ops = diff.operations.slice(0, context.maxOps);
    const body = ops.map(renderOperation).join("\n");
    const truncated =
      diff.operations.length > ops.length
        ? `<div class="sd-truncated">Showing ${ops.length} of ${diff.operations.length} operations.</div>`
        : "";
    const sectionHtml = `<section class="sd-diff">${body}</section>${truncated}`;
    return buildHtmlShell({
      title: context.title,
      layout: context.layout,
      headerHtml: context.headerHtml,
      filePathHtml: context.filePathHtml,
      summaryHtml: context.summaryHtml,
      sectionHtml,
    });
  }

  const opsData = diff.operations.map((op) => ({
    id: op.id,
    type: op.type,
    oldText: op.oldText ?? "",
    newText: op.newText ?? "",
    confidence: op.meta?.confidence ?? null,
    oldRange: op.oldRange ?? null,
    newRange: op.newRange ?? null,
  }));

  const payload = escapeScript(
    Schema.encodeSync(OpsPayloadJson)({
      operations: opsData,
      batchSize: context.batchSize,
    })
  );
  const sectionHtml = `<section class="sd-diff" id="sd-ops"></section>`;
  const statusHtml = `<div id="sd-status"></div>`;
  const script = buildOpsVirtualScript(context.batchSize);
  return buildHtmlShell({
    title: context.title,
    layout: context.layout,
    headerHtml: context.headerHtml,
    filePathHtml: context.filePathHtml,
    summaryHtml: context.summaryHtml,
    sectionHtml,
    statusHtml,
    payload,
    script,
  });
}

export function renderHtml(
  diff: DiffDocument,
  options: HtmlRenderOptions = {}
) {
  const diffForRender =
    options.hideComments && options.language
      ? filterDiffForComments(diff, options.language)
      : diff;
  const context = buildRenderContext(diffForRender, options);
  if (context.useLineView && context.canRenderLines) {
    return renderLineView(diffForRender, options, context);
  }
  return renderOperationsView(diffForRender, context);
}
