import {
  defaultConfig,
  normalizeTextForLanguage,
  type DiffDocument,
  type DiffOperation,
  type NormalizerLanguage,
  type Range,
} from "@semadiff/core";

export interface HtmlRenderOptions {
  maxOperations?: number;
  batchSize?: number;
  virtualize?: boolean;
  filePath?: string;
  title?: string;
  view?: "semantic" | "lines";
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

type LineEdit = {
  type: "equal" | "insert" | "delete";
  line: string;
};

type LineRow = {
  type: "equal" | "insert" | "delete" | "replace" | "gap" | "hunk" | "move";
  oldLine?: number | null;
  newLine?: number | null;
  text?: string;
  hidden?: number;
  oldText?: string;
  newText?: string;
  header?: string;
};

const QUOTE_NORMALIZE_LANGUAGES = new Set<NormalizerLanguage>([
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
]);

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
    const esc = content[i] ?? "";
    switch (esc) {
      case "n":
        output += "\n";
        break;
      case "r":
        output += "\r";
        break;
      case "t":
        output += "\t";
        break;
      case "b":
        output += "\b";
        break;
      case "f":
        output += "\f";
        break;
      case "v":
        output += "\v";
        break;
      case "0":
        output += "\0";
        break;
      case "x": {
        const hex = content.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          output += String.fromCharCode(Number.parseInt(hex, 16));
          i += 2;
        } else {
          output += "x";
        }
        break;
      }
      case "u": {
        const next = content[i + 1];
        if (next === "{") {
          const end = content.indexOf("}", i + 2);
          if (end !== -1) {
            const code = content.slice(i + 2, end);
            if (/^[0-9a-fA-F]+$/.test(code)) {
              output += String.fromCodePoint(Number.parseInt(code, 16));
              i = end;
            } else {
              output += "u";
            }
          } else {
            output += "u";
          }
        } else {
          const hex = content.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            output += String.fromCharCode(Number.parseInt(hex, 16));
            i += 4;
          } else {
            output += "u";
          }
        }
        break;
      }
      case "\n":
        break;
      case "\r":
        if (content[i + 1] === "\n") {
          i += 1;
        }
        break;
      default:
        output += esc;
        break;
    }
  }
  return output;
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
      const delimiter = ch;
      let content = "";
      let escaped = false;
      let closed = false;
      let cursor = index + 1;
      while (cursor < line.length) {
        const current = line[cursor];
        if (!escaped && current === delimiter) {
          closed = true;
          cursor += 1;
          break;
        }
        if (!escaped && current === "\\") {
          escaped = true;
          content += current;
          cursor += 1;
          continue;
        }
        escaped = false;
        content += current ?? "";
        cursor += 1;
      }
      if (!closed) {
        output += line.slice(index);
        break;
      }
      const decoded = decodeJsStringContent(content);
      output += JSON.stringify(decoded);
      index = cursor;
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
    highlights.push(
      `<span class="sd-pill">Moves: ${diff.moves.length}</span>`
    );
  }

  return `
    <section class="sd-summary">${cardMarkup}</section>
    ${highlights.length > 0 ? `<div class="sd-highlight">${highlights.join(" ")}</div>` : ""}
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
  const rangeDetail = [formatRangeDetail(op.oldRange), formatRangeDetail(op.newRange)]
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
  let v = new Array(2 * max + 1).fill(0);
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
        trace.push(v.slice());
        return backtrackEdits(trace, oldLines, newLines, n, m);
      }
    }
  }

  return backtrackEdits(trace, oldLines, newLines, n, m);
}

function backtrackEdits(
  trace: number[][],
  oldLines: string[],
  newLines: string[],
  n: number,
  m: number
): LineEdit[] {
  const max = n + m;
  const offset = max;
  let x = n;
  let y = m;
  const edits: LineEdit[] = [];

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d] ?? [];
    const k = x - y;
    let prevK: number;
    const left = v[offset + k - 1] ?? 0;
    const right = v[offset + k + 1] ?? 0;
    if (k === -d || (k !== d && left < right)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: "equal", line: oldLines[x - 1] ?? "" });
      x -= 1;
      y -= 1;
    }

    if (x === prevX && y > prevY) {
      edits.push({ type: "insert", line: newLines[y - 1] ?? "" });
      y -= 1;
    } else if (y === prevY && x > prevX) {
      edits.push({ type: "delete", line: oldLines[x - 1] ?? "" });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    edits.push({ type: "equal", line: oldLines[x - 1] ?? "" });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    edits.push({ type: "delete", line: oldLines[x - 1] ?? "" });
    x -= 1;
  }
  while (y > 0) {
    edits.push({ type: "insert", line: newLines[y - 1] ?? "" });
    y -= 1;
  }

  edits.reverse();
  return edits;
}

function buildRawLineRows(
  oldLines: string[],
  newLines: string[],
  lineLayout: "split" | "unified",
  normalizeLine?: (line: string) => string
): LineRow[] {
  const oldComparable = normalizeLine ? oldLines.map(normalizeLine) : oldLines;
  const newComparable = normalizeLine ? newLines.map(normalizeLine) : newLines;
  const edits = diffLines(oldLines, newLines, oldComparable, newComparable);

  const blocks: Array<{ type: "equal" | "delete" | "insert"; lines: string[] }> =
    [];
  for (const edit of edits) {
    const last = blocks.at(-1);
    if (last && last.type === edit.type) {
      last.lines.push(edit.line);
    } else {
      blocks.push({ type: edit.type, lines: [edit.line] });
    }
  }

  const rows: LineRow[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const next = blocks[i + 1];

    if (block.type === "delete" && next?.type === "insert") {
      if (lineLayout === "unified") {
        for (const line of block.lines) {
          rows.push({
            type: "delete",
            oldLine,
            newLine: null,
            text: line,
          });
          oldLine += 1;
        }
        for (const line of next.lines) {
          rows.push({
            type: "insert",
            oldLine: null,
            newLine,
            text: line,
          });
          newLine += 1;
        }
      } else {
        const max = Math.max(block.lines.length, next.lines.length);
        for (let idx = 0; idx < max; idx += 1) {
          const oldTextLine = block.lines[idx];
          const newTextLine = next.lines[idx];
          if (oldTextLine !== undefined && newTextLine !== undefined) {
            rows.push({
              type: "replace",
              oldLine,
              newLine,
              oldText: oldTextLine,
              newText: newTextLine,
            });
            oldLine += 1;
            newLine += 1;
          } else if (oldTextLine !== undefined) {
            rows.push({
              type: "delete",
              oldLine,
              newLine: null,
              text: oldTextLine,
            });
            oldLine += 1;
          } else if (newTextLine !== undefined) {
            rows.push({
              type: "insert",
              oldLine: null,
              newLine,
              text: newTextLine,
            });
            newLine += 1;
          }
        }
      }
      i += 1;
      continue;
    }

    for (const line of block.lines) {
      if (block.type === "equal") {
        rows.push({ type: "equal", oldLine, newLine, text: line });
        oldLine += 1;
        newLine += 1;
      } else if (block.type === "delete") {
        rows.push({ type: "delete", oldLine, newLine: null, text: line });
        oldLine += 1;
      } else {
        rows.push({ type: "insert", oldLine: null, newLine, text: line });
        newLine += 1;
      }
    }
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
  const oldLine = includeOld ? row.oldLine ?? null : null;
  const newLine = includeNew ? row.newLine ?? null : null;
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

function applyLineOperations(
  rows: LineRow[],
  operations: DiffOperation[],
  oldLineCount: number,
  newLineCount: number
): LineRow[] {
  if (operations.length === 0) {
    return rows;
  }

  const marks = buildLineMarkSets(operations, oldLineCount, newLineCount);

  return rows.map((row) => {
    if (row.type === "gap" || row.type === "hunk") {
      return row;
    }
    const oldLine = row.oldLine ?? null;
    const newLine = row.newLine ?? null;
    const oldChanged = oldLine !== null && marks.changedOld.has(oldLine);
    const newChanged = newLine !== null && marks.changedNew.has(newLine);

    if (oldChanged || newChanged) {
      if (oldChanged && newChanged) {
        return toReplaceRow(row);
      }
      if (oldChanged) {
        return toDeleteRow(row);
      }
      if (newChanged) {
        return toInsertRow(row);
      }
    }

    const oldMoved = oldLine !== null && marks.movedOld.has(oldLine);
    const newMoved = newLine !== null && marks.movedNew.has(newLine);
    if (oldMoved || newMoved) {
      return toMoveRow(row, oldMoved, newMoved);
    }

    return toEqualRow(row);
  });
}

function compressLineChanges(
  rows: LineRow[],
  operations: DiffOperation[]
): LineRow[] {
  if (operations.length === 0) {
    return rows;
  }

  const totalLines = rows.filter(
    (row) => row.type !== "gap" && row.type !== "hunk"
  ).length;
  const changeLines = operations.reduce(
    (total, op) => total + countLines(op.oldText) + countLines(op.newText),
    0
  );

  if (operations.length <= 5 && changeLines <= 10) {
    return totalLines > 0 ? [{ type: "gap", hidden: totalLines }] : rows;
  }

  const insertOps = operations.filter((op) => op.type === "insert").length;
  const deleteOps = operations.filter((op) => op.type === "delete").length;
  const mode: "insert" | "delete" =
    deleteOps >= insertOps * 2 ? "delete" : "insert";

  let kept = false;
  const compressed = rows.map((row) => {
    if (row.type === "gap" || row.type === "hunk") {
      return row;
    }
    if (row.type === "move") {
      return toEqualRow(row);
    }
    if (row.type !== "insert" && row.type !== "delete" && row.type !== "replace") {
      return row;
    }
    if (kept) {
      return toEqualRow(row);
    }
    if (mode === "insert") {
      if (row.type === "insert") {
        kept = true;
        return row;
      }
      if (row.type === "replace") {
        kept = true;
        return toInsertRow(row);
      }
      return toEqualRow(row);
    }
    if (row.type === "delete") {
      kept = true;
      return row;
    }
    if (row.type === "replace") {
      kept = true;
      return toDeleteRow(row);
    }
    return toEqualRow(row);
  });

  const hasChanges = compressed.some((row) =>
    row.type === "insert" || row.type === "delete" || row.type === "replace"
  );
  if (!hasChanges) {
    return totalLines > 0 ? [{ type: "gap", hidden: totalLines }] : rows;
  }
  return compressed;
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
  operations: DiffOperation[] = []
): LineRow[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let rows = buildRawLineRows(oldLines, newLines, lineLayout, normalizeLine);
  rows = applyLineOperations(rows, operations, oldLines.length, newLines.length);
  rows = compressLineChanges(rows, operations);
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
        if (startOld === null) startOld = row.oldLine;
        oldCount += 1;
      }
      if (row.newLine != null) {
        if (startNew === null) startNew = row.newLine;
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

function renderLineRow(row: LineRow, lineLayout: "split" | "unified") {
  if (row.type === "hunk") {
    return `
      <div class="sd-line sd-line--hunk">
        <div class="sd-hunk">${escapeHtml(row.header ?? "")}</div>
      </div>
    `;
  }
  if (row.type === "gap") {
    const count = row.hidden ?? 0;
    const label = count === 1 ? "1 line hidden" : `${count} lines hidden`;
    return `
      <div class="sd-line sd-line--gap">
        <div class="sd-gap">… ${label} …</div>
      </div>
    `;
  }

  const oldNumber = row.oldLine?.toString() ?? "";
  const newNumber = row.newLine?.toString() ?? "";
  const oldText = row.oldText ?? row.text ?? "";
  const newText = row.newText ?? row.text ?? "";
  const rowClass = `sd-line sd-line--${row.type}${
    lineLayout === "unified" ? " sd-line--unified" : ""
  }`;

  if (lineLayout === "unified") {
    const prefix =
      row.type === "insert"
        ? "+"
        : row.type === "delete"
        ? "-"
        : row.type === "move"
        ? ">"
        : "";
    const text =
      row.type === "insert"
        ? newText
        : row.type === "delete"
        ? oldText
        : row.type === "move"
        ? row.newLine !== null && row.oldLine === null
          ? newText
          : row.oldLine !== null && row.newLine === null
          ? oldText
          : row.text ?? oldText ?? newText
        : row.text ?? oldText;
    return `
      <div class="${rowClass}">
        <div class="sd-cell sd-gutter">${escapeHtml(oldNumber)}</div>
        <div class="sd-cell sd-gutter">${escapeHtml(newNumber)}</div>
        <div class="sd-cell sd-prefix">${escapeHtml(prefix)}</div>
        <div class="sd-cell sd-code sd-cell--code">${escapeHtml(text)}</div>
      </div>
    `;
  }

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

export function renderHtml(
  diff: DiffDocument,
  options: HtmlRenderOptions = {}
) {
  const maxOps = options.maxOperations ?? 200;
  const batchSize = options.batchSize ?? maxOps;
  const virtualize = options.virtualize ?? false;
  const showBanner = options.showBanner ?? true;
  const showSummary = options.showSummary ?? true;
  const showFilePath = options.showFilePath ?? true;
  const layout = options.layout ?? "full";
  const summary = showSummary ? renderSummary(diff) : "";
  const reduction = estimateReduction(diff);
  const metricTitle = "Estimated vs raw line changes";
  const filePath = showFilePath && options.filePath
    ? `<div class="sd-file">${escapeHtml(options.filePath)}</div>`
    : "";

  const header = showBanner
    ? `
    <div class="sd-banner">
      <div class="sd-brand">
        <span>Review changes with</span>
        <span class="sd-badge">SemaDiff</span>
      </div>
      <div class="sd-metric" title="${metricTitle}">
        <span class="sd-metric-value">${reduction.percent}%</span>
        <span class="sd-metric-label">smaller</span>
      </div>
    </div>
  `
    : "";

  const view =
    options.view ??
    (options.oldText && options.newText ? "lines" : "semantic");
  const contextLines = options.contextLines ?? 3;
  const lineLayout = options.lineLayout ?? "split";

  const canRenderLines =
    options.oldText !== undefined && options.newText !== undefined;
  const useLineView =
    view === "lines" || (view === "semantic" && canRenderLines);

  if (useLineView && canRenderLines) {
    const normalizeLine =
      view === "semantic"
        ? (line: string) => normalizeLineForSemantic(line, options.language)
        : undefined;
    const oldText = options.oldText ?? "";
    const newText = options.newText ?? "";
    let rows = buildLineRows(
      oldText,
      newText,
      contextLines,
      lineLayout,
      normalizeLine,
      diff.operations
    );
    if (view === "semantic" && normalizeLine) {
      rows = rows.flatMap((row) => {
        if (row.type === "replace") {
          const oldValue = row.oldText ?? "";
          const newValue = row.newText ?? "";
          if (normalizeLine(oldValue) === normalizeLine(newValue)) {
            return [];
          }
        }
        if (row.type === "gap" || row.type === "hunk") {
          return [];
        }
        return [row];
      });
    }
    const hasChanges = rows.some(
      (row) =>
        row.type === "insert" ||
        row.type === "delete" ||
        row.type === "replace" ||
        row.type === "move"
    );
    if (view === "semantic" && !hasChanges) {
      return "";
    }

    if (!virtualize) {
      const body = rows.map((row) => renderLineRow(row, lineLayout)).join("\n");
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title ?? "SemaDiff")}</title>
    <style>${baseStyles}</style>
  </head>
  <body class="${layout === "embed" ? "sd-embed" : ""}">
    <main class="sd-shell${layout === "embed" ? " sd-shell--embed" : ""}">
      ${header}
      ${filePath}
      ${summary}
      <section class="sd-lines">${body}</section>
    </main>
  </body>
</html>`;
    }

    const payload = escapeScript(
      JSON.stringify({
        rows,
        batchSize,
        lineLayout: "${lineLayout}",
      })
    );

    const script = `
      const data = document.getElementById("semadiff-data");
      const parsed = data ? JSON.parse(data.textContent || "{}") : { rows: [], batchSize: ${batchSize}, lineLayout: "${lineLayout}" };
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

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title ?? "SemaDiff")}</title>
    <style>${baseStyles}</style>
  </head>
  <body class="${layout === "embed" ? "sd-embed" : ""}">
    <main class="sd-shell${layout === "embed" ? " sd-shell--embed" : ""}">
      ${header}
      ${filePath}
      ${summary}
      <section class="sd-lines" id="sd-ops"></section>
      <div id="sd-status"></div>
    </main>
    <script id="semadiff-data" type="application/json">${payload}</script>
    <script>${script}</script>
  </body>
</html>`;
  }

  if (!virtualize) {
    const ops = diff.operations.slice(0, maxOps);
    const body = ops.map(renderOperation).join("\n");

    const truncated =
      diff.operations.length > ops.length
        ? `<div class="sd-truncated">Showing ${ops.length} of ${diff.operations.length} operations.</div>`
        : "";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title ?? "SemaDiff")}</title>
    <style>${baseStyles}</style>
  </head>
  <body class="${layout === "embed" ? "sd-embed" : ""}">
    <main class="sd-shell${layout === "embed" ? " sd-shell--embed" : ""}">
      ${header}
      ${filePath}
      ${summary}
      <section class="sd-diff">${body}</section>
      ${truncated}
    </main>
  </body>
</html>`;
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
    JSON.stringify({
      operations: opsData,
      batchSize,
    })
  );

  const script = `
    const data = document.getElementById("semadiff-data");
    const parsed = data ? JSON.parse(data.textContent || "{}") : { operations: [], batchSize: ${batchSize} };
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

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title ?? "SemaDiff")}</title>
    <style>${baseStyles}</style>
  </head>
  <body class="${layout === "embed" ? "sd-embed" : ""}">
    <main class="sd-shell${layout === "embed" ? " sd-shell--embed" : ""}">
      ${header}
      ${filePath}
      ${summary}
      <section class="sd-diff" id="sd-ops"></section>
      <div id="sd-status"></div>
    </main>
    <script id="semadiff-data" type="application/json">${payload}</script>
    <script>${script}</script>
  </body>
</html>`;
}
