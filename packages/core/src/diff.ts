import type { NormalizerSettings } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  isCosmeticLanguage,
  isSideEffectImportLine,
  normalizeCosmeticBlock,
  normalizeCosmeticText,
  shouldPairDeleteInsert,
} from "./diff-cosmetic.js";
import type { Position, Range } from "./diff-range.js";
import { LINE_SPLIT_RE, rangeForText, sliceTextByRange } from "./diff-range.js";
import type { RenameGroup } from "./diff-rename.js";
import { detectRenames } from "./diff-rename.js";
import type { DiffToken, TokenRange } from "./diff-tokenize.js";
import { rangeForTokens, textForTokens, tokenize } from "./diff-tokenize.js";
import type { NormalizerLanguage } from "./normalizers.js";
import { normalizeTextForLanguage } from "./normalizers.js";

export type { Position, Range } from "./diff-range.js";
export type { RenameGroup } from "./diff-rename.js";

export interface DiffOperation {
  id: string;
  type: "insert" | "delete" | "update" | "move";
  oldRange?: Range | undefined;
  newRange?: Range | undefined;
  oldText?: string | undefined;
  newText?: string | undefined;
  meta?:
    | {
        confidence?: number | undefined;
        moveId?: string | undefined;
        renameGroupId?: string | undefined;
      }
    | undefined;
}

export interface DiffDocument {
  version: "0.1.0";
  operations: DiffOperation[];
  moves: MoveGroup[];
  renames: RenameGroup[];
}

interface MetaInput {
  confidence?: number;
  moveId?: string;
  renameGroupId?: string;
}

function buildMeta(input: MetaInput): DiffOperation["meta"] | undefined {
  const meta: DiffOperation["meta"] = {};
  if (input.confidence !== undefined) {
    meta.confidence = input.confidence;
  }
  if (input.moveId !== undefined) {
    meta.moveId = input.moveId;
  }
  if (input.renameGroupId !== undefined) {
    meta.renameGroupId = input.renameGroupId;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export interface MoveGroup {
  id: string;
  oldRange: Range;
  newRange: Range;
  confidence: number;
  operations: string[];
}

const TRAILING_LINE_BREAK_RE = /\r?\n\s*$/;

function comparePosition(a: Position, b: Position) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.column - b.column;
}

function minPosition(a: Position, b: Position) {
  return comparePosition(a, b) <= 0 ? a : b;
}

function maxPosition(a: Position, b: Position) {
  return comparePosition(a, b) >= 0 ? a : b;
}

function mergeRange(
  a: Range | undefined,
  b: Range | undefined
): Range | undefined {
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

function rangesAdjacent(a: Range | undefined, b: Range | undefined) {
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

function coalesceOperations(
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

type LineOpMap = Map<string, DiffOperation[]>;

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

function suppressMovedLineOps(
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

const PROP_ASSIGN_RE = /^[A-Za-z_$][\w$-]*\s*=/;
const IMPORT_WORD_RE = /\bimport\b/;
const FROM_WORD_RE = /\bfrom\b/;

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

function suppressCosmeticLineMoves(
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

function suppressCosmeticUpdates(operations: DiffOperation[]) {
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

const MOVE_SIGNATURE_CLEAN_RE = /[^A-Za-z0-9_@./-]+/g;

function normalizeMoveSignature(text: string) {
  return normalizeCosmeticText(text)
    .replace(MOVE_SIGNATURE_CLEAN_RE, " ")
    .trim();
}

function hasPropAssignment(text: string) {
  return PROP_ASSIGN_RE.test(text);
}

function isCosmeticMove(oldText: string, newText: string) {
  const oldNormalized = normalizeCosmeticBlock(oldText);
  const newNormalized = normalizeCosmeticBlock(newText);
  if (oldNormalized === newNormalized) {
    if (oldNormalized.trim().length > 160) {
      return false;
    }
    const lines = oldNormalized
      .split(LINE_SPLIT_RE)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return true;
    }
    if (lines.length === 1 && PROP_ASSIGN_RE.test(lines[0] ?? "")) {
      return true;
    }
    const joined = lines.join(" ");
    return IMPORT_WORD_RE.test(joined) || FROM_WORD_RE.test(joined);
  }
  const oldSignature = normalizeMoveSignature(oldText);
  const newSignature = normalizeMoveSignature(newText);
  if (!oldSignature || oldSignature !== newSignature) {
    return false;
  }
  const isImportMove =
    IMPORT_WORD_RE.test(oldSignature) || FROM_WORD_RE.test(oldSignature);
  const maxLength = isImportMove ? 160 : 80;
  if (oldSignature.length > maxLength) {
    return false;
  }
  if (isImportMove) {
    return true;
  }
  return hasPropAssignment(oldText) || hasPropAssignment(newText);
}

function suppressCosmeticMoves(operations: DiffOperation[]) {
  return operations.filter((op) => {
    if (op.type !== "move") {
      return true;
    }
    if (!(op.oldText && op.newText)) {
      return true;
    }
    return !isCosmeticMove(op.oldText, op.newText);
  });
}

interface UnitBlock {
  type: "delete" | "insert";
  start: number;
  units: DiffToken[];
}

interface ArrayEdit {
  type: "equal" | "delete" | "insert";
}

const MAX_LCS_CELLS = 2_000_000;

function selectPrevK(v: number[], offset: number, k: number, d: number) {
  const left = v[offset + k - 1] ?? 0;
  const right = v[offset + k + 1] ?? 0;
  if (k === -d || (k !== d && left < right)) {
    return k + 1;
  }
  return k - 1;
}

function backtrackArrayEdits(
  trace: number[][],
  _oldValues: string[],
  _newValues: string[],
  n: number,
  m: number
): ArrayEdit[] {
  let x = n;
  let y = m;
  const edits: ArrayEdit[] = [];

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

    while (x > prevX && y > prevY) {
      edits.unshift({ type: "equal" });
      x -= 1;
      y -= 1;
    }

    if (x === prevX && y > prevY) {
      edits.unshift({ type: "insert" });
      y -= 1;
    } else if (y === prevY && x > prevX) {
      edits.unshift({ type: "delete" });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    edits.unshift({ type: "equal" });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    edits.unshift({ type: "delete" });
    x -= 1;
  }
  while (y > 0) {
    edits.unshift({ type: "insert" });
    y -= 1;
  }

  return edits;
}

function diffArrayEdits(oldValues: string[], newValues: string[]) {
  const n = oldValues.length;
  const m = newValues.length;
  const max = n + m;
  const offset = max;
  const v = new Array(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
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
      while (x < n && y < m && oldValues[x] === newValues[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrackArrayEdits(trace, oldValues, newValues, n, m);
      }
    }
  }

  return backtrackArrayEdits(trace, oldValues, newValues, n, m);
}

function getComparableText(unit: DiffToken) {
  return unit.compareText ?? unit.text;
}

function buildLcsTable(oldUnits: DiffToken[], newUnits: DiffToken[]) {
  const table = Array.from({ length: oldUnits.length + 1 }, () =>
    new Array(newUnits.length + 1).fill(0)
  );
  for (let i = oldUnits.length - 1; i >= 0; i -= 1) {
    for (let j = newUnits.length - 1; j >= 0; j -= 1) {
      const oldUnit = oldUnits[i];
      const newUnit = newUnits[j];
      const row = table[i];
      const downRow = table[i + 1];
      if (!(oldUnit && newUnit)) {
        continue;
      }
      if (!(row && downRow)) {
        continue;
      }
      if (getComparableText(oldUnit) === getComparableText(newUnit)) {
        row[j] = (downRow[j + 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(downRow[j] ?? 0, row[j + 1] ?? 0);
      }
    }
  }
  return table;
}

function diffUnitsMyers(oldUnits: DiffToken[], newUnits: DiffToken[]) {
  const oldValues = oldUnits.map(getComparableText);
  const newValues = newUnits.map(getComparableText);
  const edits = diffArrayEdits(oldValues, newValues);
  const blocks: UnitBlock[] = [];

  const pushBlock = (
    type: UnitBlock["type"],
    start: number,
    unit: DiffToken
  ) => {
    const last = blocks.at(-1);
    if (
      last &&
      last.type === type &&
      last.start + last.units.length === start
    ) {
      last.units.push(unit);
      return;
    }
    blocks.push({ type, start, units: [unit] });
  };

  let oldIndex = 0;
  let newIndex = 0;
  for (const edit of edits) {
    if (edit.type === "equal") {
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (edit.type === "delete") {
      const unit = oldUnits[oldIndex];
      if (unit) {
        pushBlock("delete", oldIndex, unit);
      }
      oldIndex += 1;
      continue;
    }
    const unit = newUnits[newIndex];
    if (unit) {
      pushBlock("insert", newIndex, unit);
    }
    newIndex += 1;
  }

  return blocks;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff algorithm balances readability and behavior.
function diffUnits(oldUnits: DiffToken[], newUnits: DiffToken[]): UnitBlock[] {
  if (oldUnits.length * newUnits.length > MAX_LCS_CELLS) {
    return diffUnitsMyers(oldUnits, newUnits);
  }
  const table = buildLcsTable(oldUnits, newUnits);
  const blocks: UnitBlock[] = [];

  const pushBlock = (
    type: UnitBlock["type"],
    start: number,
    unit: DiffToken
  ) => {
    const last = blocks.at(-1);
    if (
      last &&
      last.type === type &&
      last.start + last.units.length === start
    ) {
      last.units.push(unit);
      return;
    }
    blocks.push({ type, start, units: [unit] });
  };

  let i = 0;
  let j = 0;
  while (i < oldUnits.length || j < newUnits.length) {
    const hasOld = i < oldUnits.length;
    const hasNew = j < newUnits.length;
    const oldUnit = hasOld ? oldUnits[i] : undefined;
    const newUnit = hasNew ? newUnits[j] : undefined;
    if (
      oldUnit &&
      newUnit &&
      getComparableText(oldUnit) === getComparableText(newUnit)
    ) {
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const right = table[i]?.[j + 1] ?? 0;
    if (!hasNew || (oldUnit && down >= right)) {
      if (oldUnit) {
        pushBlock("delete", i, oldUnit);
      }
      i += 1;
    } else {
      if (newUnit) {
        pushBlock("insert", j, newUnit);
      }
      j += 1;
    }
  }

  return blocks;
}

function lcsLength(a: string[], b: string[]) {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

function similarityRatio(a: string[], b: string[]) {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  const common = lcsLength(a, b);
  return common / Math.max(a.length, b.length, 1);
}

function normalizeMoveUnits(units: DiffToken[]) {
  return units.filter((unit) => getComparableText(unit).trim().length > 0);
}

function moveUnitTextLength(units: DiffToken[]) {
  return units.reduce(
    (sum, unit) => sum + getComparableText(unit).trim().length,
    0
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: move detection requires branching on match confidence.
function detectMoves(
  blocks: UnitBlock[],
  oldTokens: DiffToken[],
  newTokens: DiffToken[],
  oldText: string,
  newText: string,
  renameGroupId?: string,
  language?: NormalizerLanguage
) {
  const deleteBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "delete");
  const insertBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "insert");

  const usedDeletes = new Set<number>();
  const usedInserts = new Set<number>();
  const moves: MoveGroup[] = [];
  const moveOps: DiffOperation[] = [];
  const nestedOps: DiffOperation[] = [];

  let moveCounter = 1;
  let opCounter = 1;

  for (const delEntry of deleteBlocks) {
    if (usedDeletes.has(delEntry.index)) {
      continue;
    }
    const deleteUnits = normalizeMoveUnits(delEntry.block.units);
    if (deleteUnits.length === 0) {
      continue;
    }
    let bestIndex = -1;
    let bestScore = 0;
    let bestUnits: DiffToken[] | null = null;
    for (const insEntry of insertBlocks) {
      if (usedInserts.has(insEntry.index)) {
        continue;
      }
      const insertUnits = normalizeMoveUnits(insEntry.block.units);
      if (insertUnits.length === 0) {
        continue;
      }
      const score = similarityRatio(
        deleteUnits.map((unit) => getComparableText(unit)),
        insertUnits.map((unit) => getComparableText(unit))
      );
      if (score > bestScore) {
        bestScore = score;
        bestIndex = insEntry.index;
        bestUnits = insertUnits;
      }
    }

    const insertMatch = insertBlocks.find((entry) => entry.index === bestIndex);
    if (!(insertMatch && bestUnits)) {
      continue;
    }

    const tokenCount = Math.min(deleteUnits.length, bestUnits.length);
    const minContentLength = Math.min(
      moveUnitTextLength(deleteUnits),
      moveUnitTextLength(bestUnits)
    );
    if (tokenCount < 2 && minContentLength < 3) {
      continue;
    }
    if (bestScore < 0.6) {
      continue;
    }

    usedDeletes.add(delEntry.index);
    usedInserts.add(insertMatch.index);

    const moveId = `move-${moveCounter++}`;
    const confidence = bestScore;
    const meta = buildMeta({
      confidence,
      moveId,
      ...(renameGroupId ? { renameGroupId } : {}),
    });
    const moveGroup: MoveGroup = {
      id: moveId,
      oldRange: rangeForTokens(
        oldTokens,
        delEntry.block.start,
        delEntry.block.units.length
      ),
      newRange: rangeForTokens(
        newTokens,
        insertMatch.block.start,
        insertMatch.block.units.length
      ),
      confidence,
      operations: [moveId],
    };

    const oldSlice = textForTokens(
      oldText,
      oldTokens,
      delEntry.block.start,
      delEntry.block.units.length
    );
    const newSlice = textForTokens(
      newText,
      newTokens,
      insertMatch.block.start,
      insertMatch.block.units.length
    );

    moveOps.push({
      id: moveId,
      type: "move",
      oldRange: moveGroup.oldRange,
      newRange: moveGroup.newRange,
      oldText: oldSlice,
      newText: newSlice,
      ...(meta ? { meta } : {}),
    });

    const comparableOld = isCosmeticLanguage(language)
      ? normalizeCosmeticBlock(oldSlice)
      : oldSlice;
    const comparableNew = isCosmeticLanguage(language)
      ? normalizeCosmeticBlock(newSlice)
      : newSlice;
    if (comparableOld !== comparableNew) {
      const updateId = `${moveId}-update-${opCounter++}`;
      moveGroup.operations.push(updateId);
      const updateMeta = buildMeta({
        confidence,
        moveId,
        ...(renameGroupId ? { renameGroupId } : {}),
      });
      nestedOps.push({
        id: updateId,
        type: "update",
        oldRange: moveGroup.oldRange,
        newRange: moveGroup.newRange,
        oldText: oldSlice,
        newText: newSlice,
        ...(updateMeta ? { meta: updateMeta } : {}),
      });
    }

    moves.push(moveGroup);
  }

  return { moves, moveOps, nestedOps, usedDeletes, usedInserts };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: structural diff pipeline trades complexity for clarity.
export function structuralDiff(
  oldText: string,
  newText: string,
  options?: {
    normalizers?: NormalizerSettings;
    language?: NormalizerLanguage;
    oldRoot?: unknown;
    newRoot?: unknown;
    oldTokens?: readonly TokenRange[];
    newTokens?: readonly TokenRange[];
    detectMoves?: boolean;
  }
): DiffDocument {
  const settings = options?.normalizers ?? defaultConfig.normalizers;
  const normalizedOld = normalizeTextForLanguage(
    oldText,
    settings,
    options?.language
  );
  const normalizedNew = normalizeTextForLanguage(
    newText,
    settings,
    options?.language
  );

  if (normalizedOld === normalizedNew) {
    return { version: "0.1.0", operations: [], moves: [], renames: [] };
  }

  if (oldText.length === 0 && newText.length > 0) {
    return {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "insert",
          newRange: rangeForText(newText),
          newText,
        },
      ],
      moves: [],
      renames: [],
    };
  }

  if (newText.length === 0 && oldText.length > 0) {
    return {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "delete",
          oldRange: rangeForText(oldText),
          oldText,
        },
      ],
      moves: [],
      renames: [],
    };
  }

  const oldTokens = tokenize(
    oldText,
    options?.oldRoot,
    options?.oldTokens,
    options?.language
  );
  const newTokens = tokenize(
    newText,
    options?.newRoot,
    options?.newTokens,
    options?.language
  );
  const blocks = diffUnits(oldTokens, newTokens);
  const renames = detectRenames(oldText, newText);
  const renameGroupId = renames[0]?.id;
  const renameMeta = renameGroupId ? { renameGroupId } : undefined;

  const hasStructuralTokens = Boolean(
    options?.oldRoot ||
      options?.newRoot ||
      (options?.oldTokens?.length ?? 0) > 0 ||
      (options?.newTokens?.length ?? 0) > 0
  );
  const useStructuralTokens =
    hasStructuralTokens && options?.language !== "json";
  const shouldDetectMoves =
    options?.detectMoves !== false && options?.language !== "json";
  const moveDetection = shouldDetectMoves
    ? detectMoves(
        blocks,
        oldTokens,
        newTokens,
        oldText,
        newText,
        renameGroupId,
        options?.language
      )
    : ({
        moves: [],
        moveOps: [],
        nestedOps: [],
        usedDeletes: new Set<number>(),
        usedInserts: new Set<number>(),
      } satisfies ReturnType<typeof detectMoves>);

  let opCounter = 1;
  const operations: DiffOperation[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as UnitBlock;
    if (block.type === "delete" && moveDetection.usedDeletes.has(index)) {
      continue;
    }
    if (block.type === "insert" && moveDetection.usedInserts.has(index)) {
      continue;
    }

    if (block.type === "delete") {
      const next = blocks[index + 1];
      if (
        next &&
        next.type === "insert" &&
        !moveDetection.usedInserts.has(index + 1)
      ) {
        const blockOldText = textForTokens(
          oldText,
          oldTokens,
          block.start,
          block.units.length
        );
        const blockNewText = textForTokens(
          newText,
          newTokens,
          next.start,
          next.units.length
        );
        if (
          !shouldPairDeleteInsert(blockOldText, blockNewText, options?.language)
        ) {
          operations.push({
            id: `op-${opCounter++}`,
            type: "delete",
            oldRange: rangeForTokens(
              oldTokens,
              block.start,
              block.units.length
            ),
            oldText: blockOldText,
            ...(renameMeta ? { meta: renameMeta } : {}),
          });
          continue;
        }
        operations.push({
          id: `op-${opCounter++}`,
          type: "update",
          oldRange: rangeForTokens(oldTokens, block.start, block.units.length),
          newRange: rangeForTokens(newTokens, next.start, next.units.length),
          oldText: blockOldText,
          newText: blockNewText,
          ...(renameMeta ? { meta: renameMeta } : {}),
        });
        index += 1;
        continue;
      }

      operations.push({
        id: `op-${opCounter++}`,
        type: "delete",
        oldRange: rangeForTokens(oldTokens, block.start, block.units.length),
        oldText: textForTokens(
          oldText,
          oldTokens,
          block.start,
          block.units.length
        ),
        ...(renameMeta ? { meta: renameMeta } : {}),
      });
      continue;
    }

    operations.push({
      id: `op-${opCounter++}`,
      type: "insert",
      newRange: rangeForTokens(newTokens, block.start, block.units.length),
      newText: textForTokens(
        newText,
        newTokens,
        block.start,
        block.units.length
      ),
      ...(renameMeta ? { meta: renameMeta } : {}),
    });
  }

  const coalesced = coalesceOperations(operations, oldText, newText);
  const baseOps = useStructuralTokens
    ? coalesced
    : suppressMovedLineOps(coalesced, oldText, newText);
  const combinedOps = baseOps.concat(
    moveDetection.moveOps,
    moveDetection.nestedOps
  );
  const sanitizedOps = isCosmeticLanguage(options?.language)
    ? suppressCosmeticLineMoves(
        suppressCosmeticMoves(suppressCosmeticUpdates(combinedOps)),
        oldText,
        newText
      )
    : combinedOps;
  return {
    version: "0.1.0",
    operations: sanitizedOps,
    moves: moveDetection.moves,
    renames,
  };
}
