import type { NormalizerSettings } from "./config.js";
import { defaultConfig } from "./config.js";
import type { NormalizerLanguage } from "./normalizers.js";
import { normalizeTextForLanguage } from "./normalizers.js";

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

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

export interface RenameGroup {
  id: string;
  from: string;
  to: string;
  occurrences: number;
  confidence: number;
}

interface DiffToken {
  text: string;
  startIndex: number;
  endIndex: number;
  start: Position;
  end: Position;
}

interface TokenRange {
  startIndex: number;
  endIndex: number;
}

const EMPTY_RANGE: Range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};
const LINE_SPLIT_RE = /\r?\n/;
const TRAILING_LINE_BREAK_RE = /\r?\n$/;

function rangeForText(text: string): Range {
  if (text.length === 0) {
    return EMPTY_RANGE;
  }
  const lines = text.split(LINE_SPLIT_RE);
  const lastLine = lines.at(-1) ?? "";
  return {
    start: { line: 1, column: 1 },
    end: { line: lines.length, column: lastLine.length + 1 },
  };
}

function buildLineOffsets(text: string) {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function positionToOffset(
  position: Position,
  lineOffsets: number[],
  textLength: number
) {
  if (textLength === 0) {
    return 0;
  }
  const lineIndex = Math.max(1, position.line) - 1;
  const lineOffset =
    lineOffsets[Math.min(lineIndex, lineOffsets.length - 1)] ?? textLength;
  const columnOffset = Math.max(0, position.column - 1);
  return Math.max(0, Math.min(textLength, lineOffset + columnOffset));
}

function sliceTextByRange(text: string, range: Range | undefined) {
  if (!range) {
    return "";
  }
  if (text.length === 0) {
    return "";
  }
  const offsets = buildLineOffsets(text);
  const start = positionToOffset(range.start, offsets, text.length);
  const end = positionToOffset(range.end, offsets, text.length);
  if (end <= start) {
    return "";
  }
  return text.slice(start, end);
}

function offsetToPosition(offset: number, lineOffsets: number[]): Position {
  if (lineOffsets.length === 0) {
    return { line: 1, column: offset + 1 };
  }
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineOffsets[mid] ?? 0;
    const next = lineOffsets[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (offset >= start && offset < next) {
      return { line: mid + 1, column: offset - start + 1 };
    }
    if (offset < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  const last = lineOffsets.at(-1) ?? 0;
  return { line: lineOffsets.length, column: offset - last + 1 };
}

function makeToken(
  text: string,
  startIndex: number,
  endIndex: number,
  lineOffsets: number[]
) {
  const start = offsetToPosition(startIndex, lineOffsets);
  const end = offsetToPosition(endIndex, lineOffsets);
  return { text, startIndex, endIndex, start, end };
}

interface TreeSitterNode {
  startIndex: number;
  endIndex: number;
  childCount: number;
  children?: TreeSitterNode[];
}

function isTreeSitterNode(value: unknown): value is TreeSitterNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.startIndex === "number" &&
    typeof record.endIndex === "number" &&
    typeof record.childCount === "number"
  );
}

function collectLeafNodes(node: TreeSitterNode, leaves: TreeSitterNode[]) {
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length === 0) {
    leaves.push(node);
    return;
  }
  for (const child of children) {
    if (isTreeSitterNode(child)) {
      collectLeafNodes(child, leaves);
    }
  }
}

function tokenizeTreeSitter(text: string, root: unknown): DiffToken[] | null {
  if (!isTreeSitterNode(root)) {
    return null;
  }
  const leaves: TreeSitterNode[] = [];
  collectLeafNodes(root, leaves);
  if (leaves.length === 0) {
    return null;
  }
  leaves.sort((a, b) => a.startIndex - b.startIndex);
  const lineOffsets = buildLineOffsets(text);
  const tokens: DiffToken[] = [];
  let cursor = 0;
  for (const leaf of leaves) {
    const startIndex = Math.max(0, Math.min(text.length, leaf.startIndex));
    const endIndex = Math.max(startIndex, Math.min(text.length, leaf.endIndex));
    if (startIndex > cursor) {
      const gap = text.slice(cursor, startIndex);
      if (gap.length > 0) {
        tokens.push(makeToken(gap, cursor, startIndex, lineOffsets));
      }
    }
    if (endIndex > startIndex) {
      const tokenText = text.slice(startIndex, endIndex);
      tokens.push(makeToken(tokenText, startIndex, endIndex, lineOffsets));
    }
    cursor = Math.max(cursor, endIndex);
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (tail.length > 0) {
      tokens.push(makeToken(tail, cursor, text.length, lineOffsets));
    }
  }
  return tokens;
}

function tokenizeFromRanges(
  text: string,
  ranges: readonly TokenRange[]
): DiffToken[] | null {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return null;
  }
  const lineOffsets = buildLineOffsets(text);
  const sorted = ranges
    .map((range) => ({
      startIndex: Math.max(0, Math.min(text.length, range.startIndex)),
      endIndex: Math.max(0, Math.min(text.length, range.endIndex)),
    }))
    .filter((range) => range.endIndex > range.startIndex)
    .sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
  if (sorted.length === 0) {
    return null;
  }
  const tokens: DiffToken[] = [];
  let cursor = 0;
  let lastStart = -1;
  let lastEnd = -1;
  for (const range of sorted) {
    if (range.startIndex === lastStart && range.endIndex === lastEnd) {
      continue;
    }
    if (range.startIndex > cursor) {
      const gap = text.slice(cursor, range.startIndex);
      if (gap.length > 0) {
        tokens.push(makeToken(gap, cursor, range.startIndex, lineOffsets));
      }
    }
    const tokenText = text.slice(range.startIndex, range.endIndex);
    tokens.push(
      makeToken(tokenText, range.startIndex, range.endIndex, lineOffsets)
    );
    cursor = Math.max(cursor, range.endIndex);
    lastStart = range.startIndex;
    lastEnd = range.endIndex;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (tail.length > 0) {
      tokens.push(makeToken(tail, cursor, text.length, lineOffsets));
    }
  }
  return tokens;
}

const TOKEN_REGEX =
  /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|==|!=|<=|>=|=>|\+\+|--|&&|\|\||<<|>>|>>>|[{}()[\];,.<>+\-*/%=&|^!~?:]/g;

function tokenizeRegex(text: string): DiffToken[] {
  const lineOffsets = buildLineOffsets(text);
  const tokens: DiffToken[] = [];
  let cursor = 0;
  let match = TOKEN_REGEX.exec(text);
  while (match) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const gap = text.slice(cursor, index);
      tokens.push(makeToken(gap, cursor, index, lineOffsets));
    }
    const tokenText = match[0];
    tokens.push(
      makeToken(tokenText, index, index + tokenText.length, lineOffsets)
    );
    cursor = index + tokenText.length;
    match = TOKEN_REGEX.exec(text);
  }
  if (cursor < text.length) {
    tokens.push(
      makeToken(text.slice(cursor), cursor, text.length, lineOffsets)
    );
  }
  if (tokens.length === 0 && text.length > 0) {
    tokens.push(makeToken(text, 0, text.length, lineOffsets));
  }
  return tokens;
}

function tokenizeLines(text: string): DiffToken[] {
  const lineOffsets = buildLineOffsets(text);
  const tokens: DiffToken[] = [];
  if (lineOffsets.length === 0) {
    return tokens;
  }
  for (let i = 0; i < lineOffsets.length; i += 1) {
    const startIndex = lineOffsets[i] ?? 0;
    const endIndex =
      i + 1 < lineOffsets.length
        ? (lineOffsets[i + 1] ?? text.length)
        : text.length;
    if (endIndex > startIndex) {
      tokens.push(
        makeToken(
          text.slice(startIndex, endIndex),
          startIndex,
          endIndex,
          lineOffsets
        )
      );
    }
  }
  if (tokens.length === 0 && text.length > 0) {
    tokens.push(makeToken(text, 0, text.length, lineOffsets));
  }
  return tokens;
}

function tokenize(
  text: string,
  root?: unknown,
  ranges?: readonly TokenRange[]
): DiffToken[] {
  const explicitTokens = ranges ? tokenizeFromRanges(text, ranges) : null;
  if (explicitTokens && explicitTokens.length > 0) {
    return explicitTokens;
  }
  const treeTokens = root ? tokenizeTreeSitter(text, root) : null;
  if (treeTokens && treeTokens.length > 0) {
    return treeTokens;
  }
  if (text.includes("\n")) {
    return tokenizeLines(text);
  }
  return tokenizeRegex(text);
}

function rangeForTokens(
  tokens: DiffToken[],
  startIndex: number,
  length: number
): Range {
  if (tokens.length === 0 || length <= 0 || !tokens[startIndex]) {
    return EMPTY_RANGE;
  }
  const start = tokens[startIndex];
  const end =
    tokens[Math.min(tokens.length - 1, startIndex + length - 1)] ?? start;
  return { start: start.start, end: end.end };
}

function textForTokens(
  text: string,
  tokens: DiffToken[],
  startIndex: number,
  length: number
) {
  if (tokens.length === 0 || length <= 0 || !tokens[startIndex]) {
    return "";
  }
  const start = tokens[startIndex];
  const end =
    tokens[Math.min(tokens.length - 1, startIndex + length - 1)] ?? start;
  const startOffset = Math.max(0, Math.min(text.length, start.startIndex));
  const endOffset = Math.max(startOffset, Math.min(text.length, end.endIndex));
  return text.slice(startOffset, endOffset);
}

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

function updateToDelete(op: DiffOperation) {
  return {
    id: op.id,
    type: "delete",
    oldRange: op.oldRange,
    oldText: op.oldText,
    ...(op.meta ? { meta: op.meta } : {}),
  } satisfies DiffOperation;
}

function toLineKey(text: string | undefined) {
  return normalizeLineText(text ?? "");
}

function convertMovedLineUpdate(
  op: DiffOperation,
  insertsByText: LineOpMap,
  deletesByText: LineOpMap,
  skipped: Set<string>
) {
  if (
    op.type !== "update" ||
    !isSingleLine(op.oldText) ||
    !isSingleLine(op.newText)
  ) {
    return null;
  }

  const oldKey = toLineKey(op.oldText);
  const newKey = toLineKey(op.newText);

  if (popMatchingLineOp(insertsByText, oldKey, skipped)) {
    return updateToInsert(op);
  }
  if (popMatchingLineOp(deletesByText, newKey, skipped)) {
    return updateToDelete(op);
  }

  return null;
}

function dropPairedLineMoves(
  insertsByText: LineOpMap,
  deletesByText: LineOpMap,
  skipped: Set<string>
) {
  for (const [key, inserts] of insertsByText.entries()) {
    const deletes = deletesByText.get(key);
    if (!deletes || inserts.length === 0) {
      continue;
    }
    while (inserts.length > 0 && deletes.length > 0) {
      const insert = inserts.pop();
      const del = deletes.pop();
      if (insert) {
        skipped.add(insert.id);
      }
      if (del) {
        skipped.add(del.id);
      }
    }
  }
}

function suppressMovedLineOps(operations: DiffOperation[]) {
  const { insertsByText, deletesByText } = indexSingleLineOps(operations);

  const skipped = new Set<string>();
  const output: DiffOperation[] = [];

  for (const op of operations) {
    if (skipped.has(op.id)) {
      continue;
    }
    const converted = convertMovedLineUpdate(
      op,
      insertsByText,
      deletesByText,
      skipped
    );
    if (converted) {
      output.push(converted);
      continue;
    }
    output.push(op);
  }

  dropPairedLineMoves(insertsByText, deletesByText, skipped);

  return output.filter((op) => !skipped.has(op.id));
}

function normalizeCosmeticText(text: string) {
  return text.replace(/'([^'\\]*)'/g, '"$1"');
}

function normalizeCosmeticBlock(text: string) {
  const lines = text
    .split(LINE_SPLIT_RE)
    .map((line) => normalizeCosmeticText(line).trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  const importLines = lines.filter(
    (line) => line === '"use client"' || line.startsWith("import ")
  );
  if (importLines.length === lines.length) {
    const useClient = importLines.filter((line) => line === '"use client"');
    const imports = importLines
      .filter((line) => line !== '"use client"')
      .sort((a, b) => a.localeCompare(b));
    return [...useClient, ...imports].join("\n");
  }
  return normalizeCosmeticText(text);
}

function suppressCosmeticUpdates(operations: DiffOperation[]) {
  return operations.filter((op) => {
    if (op.type !== "update" || op.meta?.moveId) {
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

interface UnitBlock {
  type: "delete" | "insert";
  start: number;
  units: DiffToken[];
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
      if (oldUnit.text === newUnit.text) {
        row[j] = (downRow[j + 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(downRow[j] ?? 0, row[j + 1] ?? 0);
      }
    }
  }
  return table;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff algorithm balances readability and behavior.
function diffUnits(oldUnits: DiffToken[], newUnits: DiffToken[]): UnitBlock[] {
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
    if (oldUnit && newUnit && oldUnit.text === newUnit.text) {
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
  return units.filter((unit) => unit.text.trim().length > 0);
}

function moveUnitTextLength(units: DiffToken[]) {
  return units.reduce((sum, unit) => sum + unit.text.trim().length, 0);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: move detection requires branching on match confidence.
function detectMoves(
  blocks: UnitBlock[],
  oldTokens: DiffToken[],
  newTokens: DiffToken[],
  oldText: string,
  newText: string,
  renameGroupId?: string
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
        deleteUnits.map((unit) => unit.text),
        insertUnits.map((unit) => unit.text)
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

    if (bestScore < 1 || oldSlice !== newSlice) {
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

function detectRenames(oldText: string, newText: string): RenameGroup[] {
  const oldTokens = oldText.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const newTokens = newText.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  if (oldTokens.length === 0 || oldTokens.length !== newTokens.length) {
    return [];
  }

  const mappingCounts = new Map<string, number>();
  for (let i = 0; i < oldTokens.length; i += 1) {
    const from = oldTokens[i];
    const to = newTokens[i];
    if (from !== to) {
      const key = `${from}->${to}`;
      mappingCounts.set(key, (mappingCounts.get(key) ?? 0) + 1);
    }
  }

  const results: RenameGroup[] = [];
  for (const [key, count] of mappingCounts.entries()) {
    if (count < 2) {
      continue;
    }
    const [from, to] = key.split("->");
    if (!(from && to)) {
      continue;
    }
    results.push({
      id: `rename-${results.length + 1}`,
      from,
      to,
      occurrences: count,
      confidence: count / oldTokens.length,
    });
  }
  return results;
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

  const oldTokens = tokenize(oldText, options?.oldRoot, options?.oldTokens);
  const newTokens = tokenize(newText, options?.newRoot, options?.newTokens);
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
  const shouldDetectMoves =
    options?.detectMoves !== false && hasStructuralTokens;
  const moveDetection = shouldDetectMoves
    ? detectMoves(blocks, oldTokens, newTokens, oldText, newText, renameGroupId)
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
    const block = blocks[index];
    if (!block) {
      continue;
    }
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
        operations.push({
          id: `op-${opCounter++}`,
          type: "update",
          oldRange: rangeForTokens(oldTokens, block.start, block.units.length),
          newRange: rangeForTokens(newTokens, next.start, next.units.length),
          oldText: textForTokens(
            oldText,
            oldTokens,
            block.start,
            block.units.length
          ),
          newText: textForTokens(
            newText,
            newTokens,
            next.start,
            next.units.length
          ),
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
  const finalOps = hasStructuralTokens
    ? coalesced
    : suppressMovedLineOps(coalesced);
  const sanitizedOps = suppressCosmeticUpdates(finalOps);
  return {
    version: "0.1.0",
    operations: sanitizedOps.concat(
      moveDetection.moveOps,
      moveDetection.nestedOps
    ),
    moves: moveDetection.moves,
    renames,
  };
}
