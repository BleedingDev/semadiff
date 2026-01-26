import type {
  DiffDocument,
  DiffOperation,
  NormalizerLanguage,
} from "@semadiff/core";
import { renderHtml } from "@semadiff/render-html";

export interface TerminalRenderOptions {
  format?: "ansi" | "plain";
  layout?: "unified" | "side-by-side";
  view?: "semantic" | "lines";
  lineMode?: "raw" | "semantic";
  contextLines?: number;
  hideComments?: boolean;
  language?: NormalizerLanguage;
  oldText?: string;
  newText?: string;
  linesHtml?: string;
  maxWidth?: number;
}

const ansiColors = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};
const LINE_SPLIT_RE = /\r?\n/;
const LINE_PAYLOAD_MARKER = "globalThis.__SEMADIFF_DATA__ = ";

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

interface LinePayload {
  rows: LineRow[];
  lineLayout: "split" | "unified";
}

function colorize(
  text: string,
  color: keyof typeof ansiColors,
  enabled: boolean
) {
  if (!enabled) {
    return text;
  }
  return `${ansiColors[color]}${text}${ansiColors.reset}`;
}

function formatOperation(op: DiffOperation, ansi: boolean) {
  switch (op.type) {
    case "insert":
      return colorize(
        `+ insert ${op.newRange?.start.line ?? ""}`,
        "green",
        ansi
      );
    case "delete":
      return colorize(`- delete ${op.oldRange?.start.line ?? ""}`, "red", ansi);
    case "update":
      return colorize(
        `~ update ${op.oldRange?.start.line ?? ""}`,
        "yellow",
        ansi
      );
    case "move":
      return colorize(
        `> move ${op.oldRange?.start.line ?? ""} -> ${op.newRange?.start.line ?? ""}`,
        "cyan",
        ansi
      );
    default:
      return "";
  }
}

function formatNested(op: DiffOperation, ansi: boolean) {
  const line = formatOperation(op, ansi);
  return `  ${line}`;
}

function renderUnified(diff: DiffDocument, ansi: boolean) {
  const lines: string[] = [];
  const rendered = new Set<string>();
  const nestedByMove = new Map<string, DiffOperation[]>();

  for (const op of diff.operations) {
    if (op.type !== "move" && op.meta?.moveId) {
      const existing = nestedByMove.get(op.meta.moveId) ?? [];
      existing.push(op);
      nestedByMove.set(op.meta.moveId, existing);
    }
  }

  for (const op of diff.operations) {
    if (op.type !== "move") {
      continue;
    }
    lines.push(formatOperation(op, ansi));
    rendered.add(op.id);
    const nested = nestedByMove.get(op.id) ?? [];
    for (const child of nested) {
      lines.push(formatNested(child, ansi));
      rendered.add(child.id);
    }
  }

  for (const op of diff.operations) {
    if (rendered.has(op.id)) {
      continue;
    }
    if (op.meta?.moveId) {
      continue;
    }
    lines.push(formatOperation(op, ansi));
    rendered.add(op.id);
  }

  if (diff.renames.length > 0) {
    lines.push("");
    lines.push("Renames:");
    for (const rename of diff.renames) {
      lines.push(
        `${rename.from} -> ${rename.to} (${rename.occurrences} occurrences)`
      );
    }
  }
  if (lines.length === 0) {
    return "No semantic changes detected.";
  }
  return lines.join("\n");
}

function pad(text: string, width: number) {
  if (text.length >= width) {
    return `${text.slice(0, Math.max(width - 3, 0))}...`;
  }
  return text.padEnd(width, " ");
}

function renderSideBySide(diff: DiffDocument, ansi: boolean, width: number) {
  const header = `${pad("OLD", width)} | ${pad("NEW", width)}`;
  const lines: string[] = [];
  const rendered = new Set<string>();
  const nestedByMove = new Map<string, DiffOperation[]>();

  for (const op of diff.operations) {
    if (op.type !== "move" && op.meta?.moveId) {
      const existing = nestedByMove.get(op.meta.moveId) ?? [];
      existing.push(op);
      nestedByMove.set(op.meta.moveId, existing);
    }
  }

  const renderLine = (op: DiffOperation, nested: boolean) => {
    const left = op.oldText ? (op.oldText.split(LINE_SPLIT_RE)[0] ?? "") : "";
    const right = op.newText ? (op.newText.split(LINE_SPLIT_RE)[0] ?? "") : "";
    const label = nested ? formatNested(op, ansi) : formatOperation(op, ansi);
    lines.push(`${pad(left, width)} | ${pad(right, width)}  ${label}`);
  };

  for (const op of diff.operations) {
    if (op.type !== "move") {
      continue;
    }
    renderLine(op, false);
    rendered.add(op.id);
    const nested = nestedByMove.get(op.id) ?? [];
    for (const child of nested) {
      renderLine(child, true);
      rendered.add(child.id);
    }
  }

  for (const op of diff.operations) {
    if (rendered.has(op.id)) {
      continue;
    }
    if (op.meta?.moveId) {
      continue;
    }
    renderLine(op, false);
    rendered.add(op.id);
  }

  if (diff.renames.length > 0) {
    lines.push("-".repeat(width * 2 + 3));
    lines.push("Renames:");
    for (const rename of diff.renames) {
      lines.push(`${rename.from} -> ${rename.to} (${rename.occurrences})`);
    }
  }

  if (lines.length === 0) {
    return "No semantic changes detected.";
  }

  return [header, ...lines].join("\n");
}

function extractLinePayload(html: string): LinePayload | null {
  const start = html.indexOf(LINE_PAYLOAD_MARKER);
  if (start === -1) {
    return null;
  }
  const from = start + LINE_PAYLOAD_MARKER.length;
  const end = html.indexOf(";</script>", from);
  if (end === -1) {
    return null;
  }
  const jsonText = html.slice(from, end).trim();
  if (!jsonText) {
    return null;
  }
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const lineLayout = parsed.lineLayout === "unified" ? "unified" : "split";
  return { rows, lineLayout };
}

function padLeft(text: string, width: number) {
  if (text.length >= width) {
    return text;
  }
  return text.padStart(width, " ");
}

function padRight(text: string, width: number) {
  if (text.length >= width) {
    return `${text.slice(0, Math.max(width - 3, 0))}...`;
  }
  return text.padEnd(width, " ");
}

function linePrefixForType(row: LineRow) {
  if (row.type === "insert") {
    return "+";
  }
  if (row.type === "delete") {
    return "-";
  }
  if (row.type === "move") {
    return ">";
  }
  if (row.type === "replace") {
    return "~";
  }
  return " ";
}

function colorForRow(row: LineRow): keyof typeof ansiColors {
  switch (row.type) {
    case "insert":
      return "green";
    case "delete":
      return "red";
    case "replace":
      return "yellow";
    case "move":
      return "cyan";
    case "gap":
    case "hunk":
      return "gray";
    default:
      return "reset";
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: display mapping is clearer inline.
function renderUnifiedLines(
  rows: LineRow[],
  ansi: boolean,
  contextLines: number
) {
  const output: string[] = [];
  const maxOld = rows.reduce((max, row) => Math.max(max, row.oldLine ?? 0), 0);
  const maxNew = rows.reduce((max, row) => Math.max(max, row.newLine ?? 0), 0);
  const oldWidth = Math.max(String(maxOld).length, 1);
  const newWidth = Math.max(String(maxNew).length, 1);

  for (const row of rows) {
    if (row.type === "equal" && contextLines === 0) {
      continue;
    }
    if (row.type === "hunk") {
      const line = row.header ?? "";
      output.push(colorize(line, "gray", ansi));
      continue;
    }
    if (row.type === "gap") {
      const count = row.hidden ?? 0;
      const label = count === 1 ? "1 line hidden" : `${count} lines hidden`;
      output.push(colorize(`… ${label} …`, "gray", ansi));
      continue;
    }

    if (row.type === "replace") {
      const oldText = row.oldText ?? row.text ?? "";
      const newText = row.newText ?? row.text ?? "";
      const oldLine = padLeft(String(row.oldLine ?? ""), oldWidth);
      const newLine = padLeft(String(row.newLine ?? ""), newWidth);
      const oldRendered = `${oldLine} ${padLeft("", newWidth)} - ${oldText}`;
      const newRendered = `${padLeft("", oldWidth)} ${newLine} + ${newText}`;
      output.push(colorize(oldRendered, "red", ansi));
      output.push(colorize(newRendered, "green", ansi));
      continue;
    }

    const oldLine = padLeft(String(row.oldLine ?? ""), oldWidth);
    const newLine = padLeft(String(row.newLine ?? ""), newWidth);
    let text = row.text ?? row.oldText ?? row.newText ?? "";
    if (row.type === "insert") {
      text = row.newText ?? row.text ?? "";
    } else if (row.type === "delete") {
      text = row.oldText ?? row.text ?? "";
    }
    const prefix = linePrefixForType(row);
    const rendered = `${oldLine} ${newLine} ${prefix} ${text}`;
    output.push(colorize(rendered, colorForRow(row), ansi));
  }
  return output.length > 0 ? output.join("\n") : "No line changes detected.";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: display mapping is clearer inline.
function renderSplitLines(
  rows: LineRow[],
  ansi: boolean,
  contextLines: number,
  width: number
) {
  const output: string[] = [];
  const maxOld = rows.reduce((max, row) => Math.max(max, row.oldLine ?? 0), 0);
  const maxNew = rows.reduce((max, row) => Math.max(max, row.newLine ?? 0), 0);
  const oldWidth = Math.max(String(maxOld).length, 1);
  const newWidth = Math.max(String(maxNew).length, 1);

  for (const row of rows) {
    if (row.type === "equal" && contextLines === 0) {
      continue;
    }
    if (row.type === "hunk") {
      const line = row.header ?? "";
      output.push(colorize(line, "gray", ansi));
      continue;
    }
    if (row.type === "gap") {
      const count = row.hidden ?? 0;
      const label = count === 1 ? "1 line hidden" : `${count} lines hidden`;
      output.push(colorize(`… ${label} …`, "gray", ansi));
      continue;
    }

    const oldLine = padLeft(String(row.oldLine ?? ""), oldWidth);
    const newLine = padLeft(String(row.newLine ?? ""), newWidth);
    const oldText = row.oldText ?? row.text ?? "";
    const newText = row.newText ?? row.text ?? "";
    const left = `${oldLine} ${padRight(oldText, width)}`;
    const right = `${newLine} ${padRight(newText, width)}`;

    if (row.type === "delete") {
      output.push(`${colorize(left, "red", ansi)} | ${right}`);
      continue;
    }
    if (row.type === "insert") {
      output.push(`${left} | ${colorize(right, "green", ansi)}`);
      continue;
    }
    if (row.type === "replace") {
      output.push(
        `${colorize(left, "red", ansi)} | ${colorize(right, "green", ansi)}`
      );
      continue;
    }
    if (row.type === "move") {
      output.push(
        `${colorize(left, "cyan", ansi)} | ${colorize(right, "cyan", ansi)}`
      );
      continue;
    }
    output.push(`${left} | ${right}`);
  }
  return output.length > 0 ? output.join("\n") : "No line changes detected.";
}

function renderLineDiffFromPayload(
  payload: LinePayload,
  options: TerminalRenderOptions,
  ansi: boolean
) {
  const lineLayout = options.layout === "side-by-side" ? "split" : "unified";
  const contextLines = options.contextLines ?? 0;
  const width = options.maxWidth ?? 80;

  const rows = payload.rows ?? [];
  if (lineLayout === "unified") {
    return renderUnifiedLines(rows, ansi, contextLines);
  }
  return renderSplitLines(rows, ansi, contextLines, width);
}

function renderLineDiff(
  diff: DiffDocument,
  options: TerminalRenderOptions,
  ansi: boolean
) {
  const lineMode = options.lineMode ?? "semantic";
  let payload: LinePayload | null = null;

  if (options.linesHtml) {
    payload = extractLinePayload(options.linesHtml);
  } else if (options.oldText !== undefined && options.newText !== undefined) {
    const lineLayout: "split" | "unified" =
      options.layout === "side-by-side" ? "split" : "unified";
    const renderOptions = {
      oldText: options.oldText,
      newText: options.newText,
      view: "lines" as const,
      lineMode,
      lineLayout,
      contextLines: options.contextLines ?? 0,
      hideComments: options.hideComments ?? false,
      showBanner: false,
      showSummary: false,
      showFilePath: false,
      layout: "embed" as const,
      virtualize: false,
      ...(options.language ? { language: options.language } : {}),
    };
    const html = renderHtml(diff, renderOptions);
    payload = extractLinePayload(html);
  }

  if (!payload) {
    return "Unable to render line diff.";
  }

  return renderLineDiffFromPayload(payload, options, ansi);
}

export function renderTerminalLinesFromHtml(
  linesHtml: string,
  options: TerminalRenderOptions = {}
) {
  const ansi = options.format !== "plain";
  const payload = extractLinePayload(linesHtml);
  if (!payload) {
    return "Unable to render line diff.";
  }
  return renderLineDiffFromPayload(payload, options, ansi);
}

export function renderTerminal(
  diff: DiffDocument,
  options: TerminalRenderOptions = {}
) {
  const ansi = options.format !== "plain";
  const view = options.view ?? "semantic";
  const layout = options.layout ?? "unified";
  const width = options.maxWidth ?? 60;

  if (view === "lines") {
    return renderLineDiff(diff, options, ansi);
  }
  if (layout === "side-by-side") {
    return renderSideBySide(diff, ansi, width);
  }
  return renderUnified(diff, ansi);
}
