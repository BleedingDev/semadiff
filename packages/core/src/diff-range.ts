export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export const EMPTY_RANGE: Range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};

export const LINE_SPLIT_RE = /\r?\n/;

export function rangeForText(text: string): Range {
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

export function buildLineOffsets(text: string) {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

export function positionToOffset(
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

export function sliceTextByRange(text: string, range: Range | undefined) {
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

export function offsetToPosition(
  offset: number,
  lineOffsets: number[]
): Position {
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
