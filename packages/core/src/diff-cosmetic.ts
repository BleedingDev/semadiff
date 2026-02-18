import type { NormalizerLanguage } from "./normalizers.js";

const LINE_SPLIT_RE = /\r?\n/;
const TRAILING_COMMA_RE = /,\s*$/;
const JSON_PAIR_KEY_RE = /^\s*"([^"\\]*)"\s*:/;
const WHITESPACE_RE = /\s+/g;
const COSMETIC_LANGUAGES = new Set<NormalizerLanguage>([
  "ts",
  "tsx",
  "js",
  "jsx",
]);
const ARROW_RETURN_RE = /=>\s*{\s*return\s*\(([\s\S]*?)\)\s*;?\s*}/g;
const JSX_ATTRIBUTE_RE = /^([A-Za-z_$][\w$-]*)\b/;
const JSX_SPREAD_RE = /^\{?\.\.\.[^}]+}?\s*,?$/;

export function normalizeCosmeticText(text: string) {
  return text.replace(/'([^'\\]*)'/g, '"$1"');
}

function normalizeArrowReturn(text: string) {
  return text.replace(ARROW_RETURN_RE, "=> ($1)");
}

function isJsxAttributeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (JSX_SPREAD_RE.test(trimmed)) {
    return true;
  }
  return JSX_ATTRIBUTE_RE.test(trimmed);
}

function getJsxAttributeKey(line: string) {
  const trimmed = line.trim().replace(TRAILING_COMMA_RE, "");
  if (JSX_SPREAD_RE.test(trimmed)) {
    return null;
  }
  const match = JSX_ATTRIBUTE_RE.exec(trimmed);
  return match?.[1] ?? null;
}

function sortJsxAttributeSegment(lines: string[]) {
  const keyed = lines.map((line) => ({ line, key: getJsxAttributeKey(line) }));
  if (keyed.some((entry) => !entry.key)) {
    return lines;
  }
  const seen = new Set<string>();
  for (const entry of keyed) {
    if (!entry.key) {
      return lines;
    }
    if (seen.has(entry.key)) {
      return lines;
    }
    seen.add(entry.key);
  }
  return keyed
    .sort((a, b) => {
      if (a.key === b.key) {
        return a.line.localeCompare(b.line);
      }
      return (a.key ?? "").localeCompare(b.key ?? "");
    })
    .map((entry) => entry.line);
}

function isJsxMultilineTagStart(line: string) {
  return line.startsWith("<") && !line.startsWith("</") && !line.includes(">");
}

function findJsxAttributeBlock(lines: string[], startIndex: number) {
  const attrLines: string[] = [];
  const attrIndices: number[] = [];
  for (let j = startIndex + 1; j < lines.length; j += 1) {
    const line = lines[j] ?? "";
    const lineTrimmed = line.trim();
    if (lineTrimmed === ">" || lineTrimmed === "/>") {
      return { end: j, attrLines, attrIndices };
    }
    attrLines.push(line);
    attrIndices.push(j);
  }
  return null;
}

function buildSortedJsxAttributes(attrLines: string[]) {
  if (attrLines.length < 2) {
    return null;
  }
  if (!attrLines.every((line) => isJsxAttributeLine(line))) {
    return null;
  }
  const segments: string[][] = [];
  let segment: string[] = [];
  for (const line of attrLines) {
    if (JSX_SPREAD_RE.test(line.trim())) {
      if (segment.length > 0) {
        segments.push(sortJsxAttributeSegment(segment));
        segment = [];
      }
      segments.push([line]);
      continue;
    }
    segment.push(line);
  }
  if (segment.length > 0) {
    segments.push(sortJsxAttributeSegment(segment));
  }
  return segments.flat();
}

function normalizeJsxAttributeOrder(text: string) {
  const lines = text.split(LINE_SPLIT_RE);
  const output = [...lines];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!isJsxMultilineTagStart(trimmed)) {
      continue;
    }
    const block = findJsxAttributeBlock(lines, i);
    if (!block) {
      continue;
    }
    const sorted = buildSortedJsxAttributes(block.attrLines);
    if (!sorted) {
      i = block.end;
      continue;
    }
    for (const [idx, targetIndex] of block.attrIndices.entries()) {
      const existing = output[targetIndex] ?? "";
      output[targetIndex] = sorted[idx] ?? existing;
    }
    i = block.end;
  }
  return output.join("\n");
}

export function isCosmeticLanguage(language: NormalizerLanguage | undefined) {
  return language !== undefined && COSMETIC_LANGUAGES.has(language);
}

export function buildCompareText(
  text: string,
  language: NormalizerLanguage | undefined,
  collapseWhitespace: boolean
) {
  if (!isCosmeticLanguage(language)) {
    return text;
  }
  let normalized = normalizeCosmeticText(text);
  if (collapseWhitespace) {
    if (normalized.trim().length === 0) {
      return " ";
    }
    normalized = normalized.replace(WHITESPACE_RE, " ").trim();
  }
  return normalized;
}

function extractJsonPairKey(text: string) {
  const match = JSON_PAIR_KEY_RE.exec(text);
  return match?.[1];
}

export function shouldPairDeleteInsert(
  oldText: string,
  newText: string,
  language: NormalizerLanguage | undefined
) {
  if (language !== "json") {
    return true;
  }
  const oldKey = extractJsonPairKey(oldText);
  const newKey = extractJsonPairKey(newText);
  return Boolean(oldKey && newKey && oldKey === newKey);
}

export function isSideEffectImportLine(line: string) {
  if (!line.startsWith("import ")) {
    return false;
  }
  if (line.startsWith("import type ")) {
    return false;
  }
  return !line.includes(" from ");
}

export function normalizeCosmeticBlock(text: string) {
  const normalizedText = normalizeJsxAttributeOrder(
    normalizeArrowReturn(normalizeCosmeticText(text))
  );
  const lines = normalizedText
    .split(LINE_SPLIT_RE)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  const importLines = lines.filter(
    (line) => line === '"use client"' || line.startsWith("import ")
  );
  if (importLines.length === lines.length) {
    const hasSideEffectImport = importLines.some((line) =>
      isSideEffectImportLine(line)
    );
    const useClientFirst = importLines[0] === '"use client"';
    if (!useClientFirst || hasSideEffectImport) {
      return importLines.join("\n");
    }
    const useClient = importLines.filter((line) => line === '"use client"');
    const imports = importLines
      .filter((line) => line !== '"use client"')
      .sort((a, b) => a.localeCompare(b));
    return [...useClient, ...imports].join("\n");
  }
  return normalizeCosmeticText(text);
}
