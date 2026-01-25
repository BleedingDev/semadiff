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
  border-radius: 14px;
  overflow: hidden;
  background: rgba(11, 18, 36, 0.95);
  box-shadow: var(--sd-shadow);
}

body.sd-embed .sd-lines {
  margin-top: 0;
  border-radius: 12px;
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
  border-radius: 4px;
  padding: 0 1px;
}

.sd-inline-add {
  background: rgba(34, 229, 143, 0.45);
  border-radius: 4px;
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
const HEX_BYTE_RE = /^[0-9a-fA-F]{2}$/;
const HEX_SEQUENCE_RE = /^[0-9a-fA-F]+$/;
const HEX_QUAD_RE = /^[0-9a-fA-F]{4}$/;

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

const JsonStringSchema = Schema.parseJson(Schema.String);
const LineNumberSchema = Schema.Union(Schema.Number, Schema.Null);
const LineRowSchema = Schema.Struct({
  type: Schema.Literal(
    "equal",
    "insert",
    "delete",
    "replace",
    "gap",
    "hunk",
    "move"
  ),
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
  lineLayout: Schema.Literal("split", "unified"),
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
      type: Schema.Literal("insert", "delete", "update", "move"),
      oldText: Schema.String,
      newText: Schema.String,
      confidence: Schema.Union(Schema.Number, Schema.Null),
      oldRange: Schema.Union(OpsRangeSchema, Schema.Null),
      newRange: Schema.Union(OpsRangeSchema, Schema.Null),
    })
  ),
  batchSize: Schema.Number,
});
const LinePayloadJson = Schema.parseJson(LinePayloadSchema);
const OpsPayloadJson = Schema.parseJson(OpsPayloadSchema);

const QUOTE_NORMALIZE_LANGUAGES = new Set<NormalizerLanguage>([
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
]);

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  0: "\0",
};

function decodeHexByte(content: string, index: number) {
  const hex = content.slice(index + 1, index + 3);
  if (!HEX_BYTE_RE.test(hex)) {
    return null;
  }
  return {
    value: String.fromCharCode(Number.parseInt(hex, 16)),
    nextIndex: index + 2,
  };
}

function decodeUnicodeEscape(content: string, index: number) {
  const next = content[index + 1];
  if (next === "{") {
    const end = content.indexOf("}", index + 2);
    if (end === -1) {
      return null;
    }
    const code = content.slice(index + 2, end);
    if (!HEX_SEQUENCE_RE.test(code)) {
      return null;
    }
    return {
      value: String.fromCodePoint(Number.parseInt(code, 16)),
      nextIndex: end,
    };
  }
  const hex = content.slice(index + 1, index + 5);
  if (!HEX_QUAD_RE.test(hex)) {
    return null;
  }
  return {
    value: String.fromCharCode(Number.parseInt(hex, 16)),
    nextIndex: index + 4,
  };
}

function decodeEscapeSequence(content: string, index: number) {
  const esc = content[index] ?? "";
  const simple = SIMPLE_ESCAPES[esc];
  if (simple !== undefined) {
    return { value: simple, nextIndex: index };
  }
  if (esc === "x") {
    const decoded = decodeHexByte(content, index);
    return decoded ?? { value: "x", nextIndex: index };
  }
  if (esc === "u") {
    const decoded = decodeUnicodeEscape(content, index);
    return decoded ?? { value: "u", nextIndex: index };
  }
  if (esc === "\n") {
    return { value: "", nextIndex: index };
  }
  if (esc === "\r") {
    const nextIndex = content[index + 1] === "\n" ? index + 1 : index;
    return { value: "", nextIndex };
  }
  return { value: esc, nextIndex: index };
}

function decodeJsStringContent(content: string) {
  let output = "";
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch !== "\\") {
      output += ch;
      continue;
    }
    i += 1;
    if (i >= content.length) {
      output += "\\";
      break;
    }
    const decoded = decodeEscapeSequence(content, i);
    output += decoded.value;
    i = decoded.nextIndex;
  }
  return output;
}

function readQuotedString(line: string, startIndex: number) {
  const delimiter = line[startIndex];
  if (delimiter !== "'" && delimiter !== '"') {
    return null;
  }
  let content = "";
  let escaped = false;
  let index = startIndex + 1;
  while (index < line.length) {
    const current = line[index];
    if (!escaped && current === delimiter) {
      return { content, endIndex: index + 1 };
    }
    if (!escaped && current === "\\") {
      escaped = true;
      content += current;
      index += 1;
      continue;
    }
    escaped = false;
    content += current ?? "";
    index += 1;
  }
  return null;
}

function normalizeJsStringQuotes(line: string) {
  let output = "";
  let index = 0;
  while (index < line.length) {
    const ch = line[index];
    if (ch === "/" && index + 1 < line.length) {
      const next = line[index + 1];
      if (next === "/" || next === "*") {
        output += line.slice(index);
        break;
      }
    }
    if (ch === "'" || ch === '"') {
      const segment = readQuotedString(line, index);
      if (!segment) {
        output += line.slice(index);
        break;
      }
      const decoded = decodeJsStringContent(segment.content);
      output += Schema.encodeSync(JsonStringSchema)(decoded);
      index = segment.endIndex;
      continue;
    }
    output += ch;
    index += 1;
  }
  return output;
}

function normalizeLineForSemantic(line: string, language?: NormalizerLanguage) {
  const normalized = normalizeTextForLanguage(
    line,
    defaultConfig.normalizers,
    language
  );
  if (language && QUOTE_NORMALIZE_LANGUAGES.has(language)) {
    return normalizeJsStringQuotes(normalized);
  }
  if (!language || language === "text") {
    const trimmed = normalized.trim();
    if (
      (trimmed.startsWith("'") && trimmed.lastIndexOf("'") > 0) ||
      (trimmed.startsWith('"') && trimmed.lastIndexOf('"') > 0)
    ) {
      return normalizeJsStringQuotes(normalized);
    }
  }
  return normalized;
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
      <div class="sd-warning-title">Semantic diff collapsed all changes</div>
      <div class="sd-warning-body">
        Raw line diff is shown to avoid hiding edits. This file needs a stronger semantic normalizer.
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

function buildRawLineRows(
  oldLines: string[],
  newLines: string[],
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string,
  useKeyMatching?: boolean
): LineRow[] {
  let oldComparable = oldLines;
  let newComparable = newLines;
  if (normalizeLine) {
    oldComparable = useKeyMatching
      ? buildYamlComparableLines(oldLines, normalizeLine, true)
      : oldLines.map((line) => normalizeLine(line));
    newComparable = useKeyMatching
      ? buildYamlComparableLines(newLines, normalizeLine, true)
      : newLines.map((line) => normalizeLine(line));
  }
  const edits = diffLines(oldLines, newLines, oldComparable, newComparable);
  const blocks = buildLineBlocks(edits);
  return buildRowsFromBlocks(
    blocks,
    lineLayout,
    normalizeLine,
    newLines,
    useKeyMatching
  );
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
const LINE_MATCH_CODE_HINT_RE =
  /\b(import|export|return|const|let|var|function|class|interface|type|enum|async|await|throw|new)\b|=>|=/;
const YAML_KEY_RE = /^(\s*)([^:]+):(?:\s|$)/;

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

function buildLineMatchKey(
  line: string,
  normalizeLine: (line: string) => string
) {
  const normalized = normalizeLine(line);
  const trimmed = normalized.trim();
  if (!trimmed) {
    return "";
  }
  const yamlMatch = YAML_KEY_RE.exec(normalized);
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

function parseYamlKey(normalized: string) {
  const match = YAML_KEY_RE.exec(normalized);
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
    return "__PKG_HEADER__";
  }
  return key;
}

function buildYamlComparableLines(
  lines: string[],
  normalizeLine: (line: string) => string,
  looseKeys?: boolean
) {
  const comparables: string[] = [];
  const stack: { indent: number; key: string }[] = [];
  let topKey = "";
  for (const line of lines) {
    const normalized = normalizeLine(line);
    const trimmed = normalized.trim();
    const simple = getSimpleYamlComparable(trimmed);
    if (simple !== null) {
      comparables.push(simple);
      continue;
    }
    const parsed = parseYamlKey(normalized);
    if (!parsed) {
      comparables.push(normalized);
      continue;
    }
    const { indent, key } = parsed;
    if (indent === 0) {
      topKey = key;
    }
    if (looseKeys) {
      comparables.push(resolveLooseYamlComparable(topKey, indent, key));
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
  preferIndexPairing?: boolean
) {
  const oldComparable = deleteLines.map((line) =>
    buildLineMatchKey(line, normalizeLine)
  );
  const newComparable = insertLines.map((line) =>
    buildLineMatchKey(line, normalizeLine)
  );
  const edits = diffLines(
    deleteLines,
    insertLines,
    oldComparable,
    newComparable
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
  const shouldIndexPair =
    alignedCost > indexCost ||
    (preferIndexPairing && matchRatio > 0 && matchRatio < 0.35);
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

function buildRowsFromBlocks(
  blocks: LineBlock[],
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string,
  newLines?: string[],
  useKeyMatching?: boolean
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
        block.lines.length + insertLines.length <= 4000;
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
          useKeyMatching
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
  operations: DiffOperation[],
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
  const oldLine = row.oldLine ?? null;
  const newLine = row.newLine ?? null;
  const oldChanged = oldLine !== null && marks.changedOld.has(oldLine);
  const newChanged = newLine !== null && marks.changedNew.has(newLine);

  if (oldChanged && newChanged) {
    return toReplaceRow(row);
  }
  if (oldChanged) {
    return toDeleteRow(row);
  }
  if (newChanged) {
    return toInsertRow(row);
  }

  const oldMoved = oldLine !== null && marks.movedOld.has(oldLine);
  const newMoved = newLine !== null && marks.movedNew.has(newLine);
  if (oldMoved || newMoved) {
    return toMoveRow(row, oldMoved, newMoved);
  }

  return toEqualRow(row);
}

function applyLineOperations(
  rows: LineRow[],
  operations: DiffOperation[],
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
  operations: DiffOperation[] = [],
  useKeyMatching?: boolean,
  applyOperations = true
): LineRow[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let rows = buildRawLineRows(
    oldLines,
    newLines,
    lineLayout,
    normalizeLine,
    useKeyMatching
  );
  if (applyOperations) {
    rows = applyLineOperations(
      rows,
      operations,
      oldLines.length,
      newLines.length,
      normalizeLine
    );
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
      if (!normalizeLine(text).trim()) {
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

function renderLineView(
  diff: DiffDocument,
  options: HtmlRenderOptions,
  context: RenderContext
) {
  if (!context.canRenderLines) {
    return "";
  }
  const normalizeLine =
    context.lineMode === "semantic"
      ? (line: string) => normalizeLineForSemantic(line, options.language)
      : undefined;
  const oldText = options.oldText ?? "";
  const newText = options.newText ?? "";
  const isPnpmLock =
    options.filePath?.endsWith("pnpm-lock.yaml") ||
    (oldText.includes("lockfileVersion:") && oldText.includes("importers:")) ||
    (newText.includes("lockfileVersion:") && newText.includes("importers:"));
  const useKeyMatching = Boolean(normalizeLine && isPnpmLock);
  let rows = buildLineRows(
    oldText,
    newText,
    context.contextLines,
    context.lineLayout,
    normalizeLine,
    diff.operations,
    useKeyMatching,
    context.lineMode === "semantic"
  );
  if (context.lineMode === "semantic" && normalizeLine) {
    rows = filterSemanticRows(rows, normalizeLine);
  }
  if (useKeyMatching) {
    rows = filterLockfileRows(rows);
  }
  const hideComments = Boolean(options.hideComments);
  if (hideComments) {
    rows = applyLineContext(
      filterCommentRows(stripContextRows(rows), options.language),
      context.contextLines
    );
  }
  let warningHtml = "";
  if (
    context.lineMode === "semantic" &&
    normalizeLine &&
    !hideComments &&
    !hasLineChanges(rows)
  ) {
    warningHtml = renderSemanticFallbackWarning();
    rows = buildLineRows(
      oldText,
      newText,
      context.contextLines,
      context.lineLayout,
      undefined,
      diff.operations,
      false,
      false
    );
  }
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
  const context = buildRenderContext(diff, options);
  if (context.useLineView && context.canRenderLines) {
    return renderLineView(diff, options, context);
  }
  return renderOperationsView(diff, context);
}
