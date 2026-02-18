import type {
  ParseResult,
  Parser,
  ParserInput,
  TokenRange,
} from "@semadiff/parsers";
import { ParseError } from "@semadiff/parsers";
import { parseSync } from "@swc/core";
import { Effect } from "effect";

const languages = ["ts", "tsx", "js", "jsx"] as const;
type SupportedLanguage = (typeof languages)[number];
const LINE_SPLIT_RE = /\r?\n/;

function isSupportedLanguage(
  language: string | undefined
): language is SupportedLanguage {
  return (
    typeof language === "string" &&
    languages.includes(language as SupportedLanguage)
  );
}

function parseWithSwc(
  input: ParserInput,
  language: SupportedLanguage
): ParseResult {
  const isTypeScript = language === "ts" || language === "tsx";
  const isJsx = language === "jsx" || language === "tsx";
  const ast = parseSync(input.content, {
    syntax: isTypeScript ? "typescript" : "ecmascript",
    tsx: isTypeScript && isJsx,
    jsx: !isTypeScript && isJsx,
    decorators: true,
    dynamicImport: true,
    topLevelAwait: true,
    target: "es2022",
  });
  const tokens = collectSwcTokens(ast, input.content);
  return {
    language,
    kind: "tree",
    text: input.content,
    lines: input.content.split(LINE_SPLIT_RE),
    capabilities: {
      hasAstKinds: true,
      hasTokenRanges: true,
      supportsErrorRecovery: false,
      supportsIncrementalParse: false,
    },
    root: ast,
    tokens,
  };
}

function toParseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

interface SwcSpan {
  start: number;
  end: number;
}

function isSwcSpan(value: unknown): value is SwcSpan {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.start === "number" && typeof record.end === "number";
}

function collectLeafSpans(node: unknown, spans: SwcSpan[]): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    let hasSpan = false;
    for (const value of node) {
      if (collectLeafSpans(value, spans)) {
        hasSpan = true;
      }
    }
    return hasSpan;
  }
  const record = node as Record<string, unknown>;
  const spanValue = record.span;
  const hasSpan = isSwcSpan(spanValue);
  let hasChildSpan = false;
  for (const value of Object.values(record)) {
    if (value === spanValue) {
      continue;
    }
    if (collectLeafSpans(value, spans)) {
      hasChildSpan = true;
    }
  }
  if (hasSpan && !hasChildSpan) {
    spans.push(spanValue);
  }
  return hasSpan || hasChildSpan;
}

function buildUtf8Offsets(text: string): number[] {
  const offsets = new Array(text.length + 1);
  let bytePos = 0;
  offsets[0] = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      bytePos += 1;
      offsets[i + 1] = bytePos;
      continue;
    }
    if (code <= 0x7_ff) {
      bytePos += 2;
      offsets[i + 1] = bytePos;
      continue;
    }
    if (code >= 0xd8_00 && code <= 0xdb_ff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc_00 && next <= 0xdf_ff) {
        bytePos += 4;
        offsets[i + 1] = bytePos;
        offsets[i + 2] = bytePos;
        i += 1;
        continue;
      }
    }
    bytePos += 3;
    offsets[i + 1] = bytePos;
  }
  return offsets;
}

function byteOffsetToIndex(byteOffset: number, offsets: number[]): number {
  let low = 0;
  let high = offsets.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = offsets[mid] ?? 0;
    if (value <= byteOffset) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function spansToTokenRanges(text: string, spans: SwcSpan[]): TokenRange[] {
  if (spans.length === 0 || text.length === 0) {
    return [];
  }
  const offsets = buildUtf8Offsets(text);
  const maxByte = offsets.at(-1) ?? 0;
  let minStart = Number.POSITIVE_INFINITY;
  for (const span of spans) {
    if (span.start < minStart) {
      minStart = span.start;
    }
  }
  const baseOffset =
    Number.isFinite(minStart) && minStart > 1 ? minStart - 1 : 0;
  const ranges: TokenRange[] = [];
  for (const span of spans) {
    const startByte = Math.max(
      0,
      Math.min(maxByte, span.start - 1 - baseOffset)
    );
    const endByte = Math.max(
      startByte,
      Math.min(maxByte, span.end - 1 - baseOffset)
    );
    const startIndex = byteOffsetToIndex(startByte, offsets);
    const endIndex = byteOffsetToIndex(endByte, offsets);
    if (endIndex > startIndex) {
      ranges.push({ startIndex, endIndex });
    }
  }
  ranges.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
  const deduped: TokenRange[] = [];
  let lastStart = -1;
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.startIndex === lastStart && range.endIndex === lastEnd) {
      continue;
    }
    deduped.push(range);
    lastStart = range.startIndex;
    lastEnd = range.endIndex;
  }
  return deduped;
}

function collectSwcTokens(ast: unknown, text: string): TokenRange[] {
  const spans: SwcSpan[] = [];
  collectLeafSpans(ast, spans);
  return spansToTokenRanges(text, spans);
}

export const swcParser: Parser = {
  id: "swc",
  languages,
  capabilities: {
    hasAstKinds: true,
    hasTokenRanges: true,
    supportsErrorRecovery: false,
    supportsIncrementalParse: false,
  },
  parse: (input: ParserInput) =>
    Effect.gen(function* () {
      const language = input.language;
      if (!isSupportedLanguage(language)) {
        return yield* new ParseError({
          parser: "swc",
          message: `Unsupported language: ${language ?? "unknown"}`,
        });
      }
      return yield* Effect.try({
        try: () => parseWithSwc(input, language),
        catch: (error) =>
          new ParseError({
            parser: "swc",
            message: toParseErrorMessage(error),
          }),
      });
    }),
};

export const swcParsers = [swcParser];

export const packageName = "@semadiff/parser-swc";
