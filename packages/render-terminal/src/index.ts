import type { DiffDocument, DiffOperation } from "@semadiff/core";

export interface TerminalRenderOptions {
  format?: "ansi" | "plain";
  layout?: "unified" | "side-by-side";
  maxWidth?: number;
}

const ansiColors = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};
const LINE_SPLIT_RE = /\r?\n/;

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

export function renderTerminal(
  diff: DiffDocument,
  options: TerminalRenderOptions = {}
) {
  const ansi = options.format !== "plain";
  const layout = options.layout ?? "unified";
  const width = options.maxWidth ?? 60;

  if (layout === "side-by-side") {
    return renderSideBySide(diff, ansi, width);
  }
  return renderUnified(diff, ansi);
}
