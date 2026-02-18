import type { DiffOperation } from "./diff.js";
import {
  isSideEffectImportLine,
  normalizeCosmeticBlock,
  normalizeCosmeticText,
} from "./diff-cosmetic.js";
import { LINE_SPLIT_RE, sliceTextByRange } from "./diff-range.js";

const TRAILING_LINE_BREAK_RE = /\r?\n\s*$/;
const PROP_ASSIGN_RE = /^[A-Za-z_$][\w$-]*\s*=/;

type PositionLike = NonNullable<
  NonNullable<DiffOperation["oldRange"]>["start"]
>;
type RangeLike = NonNullable<DiffOperation["oldRange"]>;
type LineOpMap = Map<string, DiffOperation[]>;

function comparePosition(a: PositionLike, b: PositionLike) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.column - b.column;
}

function minPosition(a: PositionLike, b: PositionLike) {
  return comparePosition(a, b) <= 0 ? a : b;
}

function maxPosition(a: PositionLike, b: PositionLike) {
  return comparePosition(a, b) >= 0 ? a : b;
}

function mergeRange(
  a: RangeLike | undefined,
  b: RangeLike | undefined
): RangeLike | undefined {
  if (!(a || b)) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return {
    start: minPosition(a.start, b.start),
    end: maxPosition(a.end, b.end),
  };
}

function rangesAdjacent(a: RangeLike | undefined, b: RangeLike | undefined) {
  if (!(a && b)) {
    return false;
  }
  return b.start.line <= a.end.line + 1;
}

function sameMeta(left: DiffOperation["meta"], right: DiffOperation["meta"]) {
  if (!(left || right)) {
    return true;
  }
  if (!(left && right)) {
    return false;
  }
  return (
    left.moveId === right.moveId &&
    left.renameGroupId === right.renameGroupId &&
    left.confidence === right.confidence
  );
}

function canMergeOperations(left: DiffOperation, right: DiffOperation) {
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === "move" || right.type === "move") {
    return false;
  }
  if (left.meta?.moveId || right.meta?.moveId) {
    return false;
  }
  if (!sameMeta(left.meta, right.meta)) {
    return false;
  }
  switch (left.type) {
    case "insert":
      return rangesAdjacent(left.newRange, right.newRange);
    case "delete":
      return rangesAdjacent(left.oldRange, right.oldRange);
    case "update":
      return (
        rangesAdjacent(left.oldRange, right.oldRange) &&
        rangesAdjacent(left.newRange, right.newRange)
      );
    default:
      return false;
  }
}

function mergeOperations(
  left: DiffOperation,
  right: DiffOperation,
  oldText: string,
  newText: string
): DiffOperation {
  const oldRange = mergeRange(left.oldRange, right.oldRange);
  const newRange = mergeRange(left.newRange, right.newRange);
  return {
    id: left.id,
    type: left.type,
    oldRange,
    newRange,
    oldText: oldRange ? sliceTextByRange(oldText, oldRange) : undefined,
    newText: newRange ? sliceTextByRange(newText, newRange) : undefined,
    ...(left.meta ? { meta: left.meta } : {}),
  };
}

export function coalesceOperations(
  operations: DiffOperation[],
  oldText: string,
  newText: string
) {
  if (operations.length === 0) {
    return operations;
  }
  const result: DiffOperation[] = [];
  let current: DiffOperation | null = null;

  const flush = () => {
    if (current) {
      result.push(current);
      current = null;
    }
  };

  for (const op of operations) {
    if (op.type === "move" || op.meta?.moveId) {
      flush();
      result.push(op);
      continue;
    }
    if (!current) {
      current = op;
      continue;
    }
    if (canMergeOperations(current, op)) {
      current = mergeOperations(current, op, oldText, newText);
      continue;
    }
    flush();
    current = op;
  }

  flush();
  return result;
}

function isSingleLine(text: string | undefined) {
  if (!text) {
    return false;
  }
  const trimmed = text.replace(TRAILING_LINE_BREAK_RE, "");
  return !(trimmed.includes("\n") || trimmed.includes("\r"));
}

function normalizeLineText(text: string) {
  return text.replace(TRAILING_LINE_BREAK_RE, "").trimEnd();
}

function normalizeCosmeticLineText(text: string) {
  return normalizeCosmeticText(text).trim();
}

function buildCosmeticLineCounts(text: string) {
  const counts = new Map<string, number>();
  const lines = text.split(LINE_SPLIT_RE);
  for (const line of lines) {
    const key = normalizeCosmeticLineText(line);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function buildLineCounts(text: string) {
  const counts = new Map<string, number>();
  const lines = text.split(LINE_SPLIT_RE);
  for (const line of lines) {
    const key = normalizeLineText(line);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function indexSingleLineOps(operations: DiffOperation[]) {
  const insertsByText: LineOpMap = new Map();
  const deletesByText: LineOpMap = new Map();

  for (const op of operations) {
    if (op.type === "insert" && isSingleLine(op.newText)) {
      const key = normalizeLineText(op.newText ?? "");
      const list = insertsByText.get(key);
      if (list) {
        list.push(op);
      } else {
        insertsByText.set(key, [op]);
      }
      continue;
    }
    if (op.type === "delete" && isSingleLine(op.oldText)) {
      const key = normalizeLineText(op.oldText ?? "");
      const list = deletesByText.get(key);
      if (list) {
        list.push(op);
      } else {
        deletesByText.set(key, [op]);
      }
    }
  }

  return { insertsByText, deletesByText };
}

function popMatchingLineOp(map: LineOpMap, key: string, skipped: Set<string>) {
  const list = map.get(key);
  const match = list?.pop();
  if (match) {
    skipped.add(match.id);
  }
  return Boolean(match);
}

function updateToInsert(op: DiffOperation) {
  return {
    id: op.id,
    type: "insert",
    newRange: op.newRange,
    newText: op.newText,
    ...(op.meta ? { meta: op.meta } : {}),
  } satisfies DiffOperation;
}

function dropPairedLineMoves(
  insertsByText: LineOpMap,
  deletesByText: LineOpMap,
  skipped: Set<string>,
  oldLineCounts: Map<string, number>,
  newLineCounts: Map<string, number>
) {
  for (const [key, inserts] of insertsByText.entries()) {
    const deletes = deletesByText.get(key);
    if (!deletes || inserts.length !== 1 || deletes.length !== 1) {
      continue;
    }
    if ((oldLineCounts.get(key) ?? 0) !== (newLineCounts.get(key) ?? 0)) {
      continue;
    }
    const insert = inserts[0];
    const del = deletes[0];
    if (insert) {
      skipped.add(insert.id);
    }
    if (del) {
      skipped.add(del.id);
    }
  }
}

export function suppressMovedLineOps(
  operations: DiffOperation[],
  oldText: string,
  newText: string
) {
  const { insertsByText, deletesByText } = indexSingleLineOps(operations);
  const oldLineCounts = buildLineCounts(oldText);
  const newLineCounts = buildLineCounts(newText);

  const skipped = new Set<string>();
  const output: DiffOperation[] = [];

  for (const op of operations) {
    if (skipped.has(op.id)) {
      continue;
    }
    if (
      op.type === "update" &&
      isSingleLine(op.oldText) &&
      isSingleLine(op.newText)
    ) {
      const oldKey = normalizeLineText(op.oldText ?? "");
      const newKey = normalizeLineText(op.newText ?? "");
      const oldKeyCount = oldLineCounts.get(oldKey) ?? 0;
      const newKeyCount = newLineCounts.get(oldKey) ?? 0;
      const oldNewKeyCount = oldLineCounts.get(newKey) ?? 0;
      const newNewKeyCount = newLineCounts.get(newKey) ?? 0;
      if (
        oldKeyCount > 0 &&
        oldKeyCount === newKeyCount &&
        newNewKeyCount > oldNewKeyCount &&
        popMatchingLineOp(insertsByText, oldKey, skipped)
      ) {
        output.push(updateToInsert(op));
        continue;
      }
    }
    output.push(op);
  }

  dropPairedLineMoves(
    insertsByText,
    deletesByText,
    skipped,
    oldLineCounts,
    newLineCounts
  );

  return output.filter((op) => !skipped.has(op.id));
}

function isCosmeticMoveLine(line: string) {
  if (!line) {
    return false;
  }
  const trimmed = normalizeCosmeticText(line).trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === '"use client"') {
    return true;
  }
  if (trimmed.startsWith("import ")) {
    return !isSideEffectImportLine(trimmed);
  }
  return PROP_ASSIGN_RE.test(trimmed);
}

function collectSingleLineCosmeticOps(operations: DiffOperation[]) {
  const insertsByText: LineOpMap = new Map();
  const deletesByText: LineOpMap = new Map();

  for (const op of operations) {
    if (op.type === "insert" && isSingleLine(op.newText)) {
      const key = normalizeCosmeticLineText(op.newText ?? "");
      const list = insertsByText.get(key);
      if (list) {
        list.push(op);
      } else {
        insertsByText.set(key, [op]);
      }
      continue;
    }
    if (op.type === "delete" && isSingleLine(op.oldText)) {
      const key = normalizeCosmeticLineText(op.oldText ?? "");
      const list = deletesByText.get(key);
      if (list) {
        list.push(op);
      } else {
        deletesByText.set(key, [op]);
      }
    }
  }

  return { insertsByText, deletesByText };
}

function shouldSkipCosmeticLineMove(
  key: string,
  inserts: DiffOperation[] | undefined,
  deletes: DiffOperation[] | undefined,
  oldLineCounts: Map<string, number>,
  newLineCounts: Map<string, number>
) {
  if (!(inserts && deletes)) {
    return false;
  }
  if (inserts.length !== 1 || deletes.length !== 1) {
    return false;
  }
  if ((oldLineCounts.get(key) ?? 0) !== (newLineCounts.get(key) ?? 0)) {
    return false;
  }
  return isCosmeticMoveLine(key);
}

export function suppressCosmeticLineMoves(
  operations: DiffOperation[],
  oldText: string,
  newText: string
) {
  const { insertsByText, deletesByText } =
    collectSingleLineCosmeticOps(operations);
  const oldLineCounts = buildCosmeticLineCounts(oldText);
  const newLineCounts = buildCosmeticLineCounts(newText);
  const skipped = new Set<string>();

  for (const [key, inserts] of insertsByText.entries()) {
    const deletes = deletesByText.get(key);
    if (
      !shouldSkipCosmeticLineMove(
        key,
        inserts,
        deletes,
        oldLineCounts,
        newLineCounts
      )
    ) {
      continue;
    }
    const insert = inserts[0];
    const del = deletes?.[0];
    if (insert) {
      skipped.add(insert.id);
    }
    if (del) {
      skipped.add(del.id);
    }
  }

  return operations.filter((op) => !skipped.has(op.id));
}

export function suppressCosmeticUpdates(operations: DiffOperation[]) {
  return operations.filter((op) => {
    if (op.type !== "update") {
      return true;
    }
    if (!(op.oldText && op.newText)) {
      return true;
    }
    const oldNormalized = normalizeCosmeticBlock(op.oldText);
    const newNormalized = normalizeCosmeticBlock(op.newText);
    return oldNormalized !== newNormalized;
  });
}
