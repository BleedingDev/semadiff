import { buildCompareText } from "./diff-cosmetic.js";
import type { Range } from "./diff-range.js";
import {
  buildLineOffsets,
  EMPTY_RANGE,
  offsetToPosition,
} from "./diff-range.js";
import type { NormalizerLanguage } from "./normalizers.js";

export interface DiffToken {
  text: string;
  compareText: string;
  startIndex: number;
  endIndex: number;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface TokenRange {
  startIndex: number;
  endIndex: number;
}

interface TreeSitterNode {
  startIndex: number;
  endIndex: number;
  childCount: number;
  children?: TreeSitterNode[];
}

function makeToken(
  text: string,
  startIndex: number,
  endIndex: number,
  lineOffsets: number[],
  compareText = text
) {
  const start = offsetToPosition(startIndex, lineOffsets);
  const end = offsetToPosition(endIndex, lineOffsets);
  return { text, compareText, startIndex, endIndex, start, end };
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

function tokenizeTreeSitter(
  text: string,
  root: unknown,
  language?: NormalizerLanguage
): DiffToken[] | null {
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
        tokens.push(
          makeToken(
            gap,
            cursor,
            startIndex,
            lineOffsets,
            buildCompareText(gap, language, true)
          )
        );
      }
    }
    if (endIndex > startIndex) {
      const tokenText = text.slice(startIndex, endIndex);
      tokens.push(
        makeToken(
          tokenText,
          startIndex,
          endIndex,
          lineOffsets,
          buildCompareText(tokenText, language, false)
        )
      );
    }
    cursor = Math.max(cursor, endIndex);
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (tail.length > 0) {
      tokens.push(
        makeToken(
          tail,
          cursor,
          text.length,
          lineOffsets,
          buildCompareText(tail, language, true)
        )
      );
    }
  }
  return tokens;
}

function tokenizeFromRanges(
  text: string,
  ranges: readonly TokenRange[],
  language?: NormalizerLanguage
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
        tokens.push(
          makeToken(
            gap,
            cursor,
            range.startIndex,
            lineOffsets,
            buildCompareText(gap, language, true)
          )
        );
      }
    }
    const tokenText = text.slice(range.startIndex, range.endIndex);
    tokens.push(
      makeToken(
        tokenText,
        range.startIndex,
        range.endIndex,
        lineOffsets,
        buildCompareText(tokenText, language, false)
      )
    );
    cursor = Math.max(cursor, range.endIndex);
    lastStart = range.startIndex;
    lastEnd = range.endIndex;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (tail.length > 0) {
      tokens.push(
        makeToken(
          tail,
          cursor,
          text.length,
          lineOffsets,
          buildCompareText(tail, language, true)
        )
      );
    }
  }
  return tokens;
}

const TOKEN_REGEX =
  /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|==|!=|<=|>=|=>|\+\+|--|&&|\|\||<<|>>|>>>|[{}()[\];,.<>+\-*/%=&|^!~?:]/g;

function tokenizeRegex(
  text: string,
  language?: NormalizerLanguage
): DiffToken[] {
  const lineOffsets = buildLineOffsets(text);
  const tokens: DiffToken[] = [];
  let cursor = 0;
  let match = TOKEN_REGEX.exec(text);
  while (match) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const gap = text.slice(cursor, index);
      tokens.push(
        makeToken(
          gap,
          cursor,
          index,
          lineOffsets,
          buildCompareText(gap, language, true)
        )
      );
    }
    const tokenText = match[0];
    tokens.push(
      makeToken(
        tokenText,
        index,
        index + tokenText.length,
        lineOffsets,
        buildCompareText(tokenText, language, false)
      )
    );
    cursor = index + tokenText.length;
    match = TOKEN_REGEX.exec(text);
  }
  if (cursor < text.length) {
    tokens.push(
      makeToken(
        text.slice(cursor),
        cursor,
        text.length,
        lineOffsets,
        buildCompareText(text.slice(cursor), language, true)
      )
    );
  }
  if (tokens.length === 0 && text.length > 0) {
    tokens.push(
      makeToken(
        text,
        0,
        text.length,
        lineOffsets,
        buildCompareText(text, language, false)
      )
    );
  }
  return tokens;
}

function tokenizeLines(
  text: string,
  language?: NormalizerLanguage
): DiffToken[] {
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
          lineOffsets,
          buildCompareText(text.slice(startIndex, endIndex), language, false)
        )
      );
    }
  }
  if (tokens.length === 0 && text.length > 0) {
    tokens.push(
      makeToken(
        text,
        0,
        text.length,
        lineOffsets,
        buildCompareText(text, language, false)
      )
    );
  }
  return tokens;
}

export function tokenize(
  text: string,
  root?: unknown,
  ranges?: readonly TokenRange[],
  language?: NormalizerLanguage
): DiffToken[] {
  const explicitTokens = ranges
    ? tokenizeFromRanges(text, ranges, language)
    : null;
  if (explicitTokens && explicitTokens.length > 0) {
    return explicitTokens;
  }
  const treeTokens = root ? tokenizeTreeSitter(text, root, language) : null;
  if (treeTokens && treeTokens.length > 0) {
    return treeTokens;
  }
  if (language === "json") {
    if (text.includes("\n")) {
      return tokenizeLines(text, language);
    }
    return tokenizeRegex(text, language);
  }
  if (text.includes("\n")) {
    return tokenizeLines(text, language);
  }
  return tokenizeRegex(text, language);
}

export function rangeForTokens(
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

export function textForTokens(
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
