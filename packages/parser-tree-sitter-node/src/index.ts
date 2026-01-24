import type {
  ParseResult,
  ParserInput,
  Parser as ParserShape,
  TokenRange,
} from "@semadiff/parsers";
import { ParseError } from "@semadiff/parsers";
import { Effect } from "effect";
import Parser from "tree-sitter";
import Css from "tree-sitter-css/bindings/node/index.js";
import JavaScript from "tree-sitter-javascript";
import Json from "tree-sitter-json";
import Markdown from "tree-sitter-markdown";
import Toml from "tree-sitter-toml";
import TypeScript from "tree-sitter-typescript";
import Yaml from "tree-sitter-yaml";

const languages = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "json",
  "md",
  "toml",
  "yaml",
] as const;
const LINE_SPLIT_RE = /\r?\n/;

type SupportedLanguage = (typeof languages)[number];

type TreeSitterParser = InstanceType<typeof Parser>;
type TreeSitterLanguage = Parameters<TreeSitterParser["setLanguage"]>[0];
interface TreeSitterNode {
  startIndex: number;
  endIndex: number;
  childCount: number;
  type?: string;
  children?: TreeSitterNode[];
  namedChildren?: TreeSitterNode[];
}

function isSupportedLanguage(
  language: string | undefined
): language is SupportedLanguage {
  return (
    typeof language === "string" &&
    languages.includes(language as SupportedLanguage)
  );
}

function resolveLanguage(module: unknown, key?: string): TreeSitterLanguage {
  if (module && typeof module === "object") {
    const record = module as Record<string, unknown>;
    if (key && record[key]) {
      return record[key] as TreeSitterLanguage;
    }
    if (record.default) {
      return record.default as TreeSitterLanguage;
    }
  }
  return module as TreeSitterLanguage;
}

const languageMap: Record<SupportedLanguage, TreeSitterLanguage> = {
  ts: resolveLanguage(TypeScript, "typescript"),
  tsx: resolveLanguage(TypeScript, "tsx"),
  js: resolveLanguage(JavaScript, "javascript"),
  jsx: resolveLanguage(JavaScript, "jsx"),
  css: resolveLanguage(Css),
  json: resolveLanguage(Json),
  md: resolveLanguage(Markdown, "markdown"),
  toml: resolveLanguage(Toml),
  yaml: resolveLanguage(Yaml),
};

const parserCache = new Map<SupportedLanguage, Parser>();

function getParser(language: SupportedLanguage) {
  const cached = parserCache.get(language);
  if (cached) {
    return cached;
  }
  const parser = new Parser();
  const lang = languageMap[language];
  if (!lang) {
    throw new Error(`Missing Tree-sitter language for ${language}`);
  }
  parser.setLanguage(lang);
  parserCache.set(language, parser);
  return parser;
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

function jsonChildren(node: TreeSitterNode) {
  if (Array.isArray(node.namedChildren) && node.namedChildren.length > 0) {
    return node.namedChildren;
  }
  return Array.isArray(node.children) ? node.children : [];
}

function collectJsonPairs(
  node: TreeSitterNode,
  pairs: TreeSitterNode[]
): boolean {
  let hasChildPair = false;
  const children = jsonChildren(node);
  for (const child of children) {
    if (isTreeSitterNode(child)) {
      const childHasPair = collectJsonPairs(child, pairs);
      hasChildPair = hasChildPair || childHasPair;
    }
  }
  if (node.type === "pair" && !hasChildPair) {
    pairs.push(node);
    return true;
  }
  return node.type === "pair" || hasChildPair;
}

function collectJsonArrayElements(
  node: TreeSitterNode,
  elements: TreeSitterNode[]
): boolean {
  if (node.type === "array") {
    const children = jsonChildren(node);
    for (const child of children) {
      if (isTreeSitterNode(child)) {
        elements.push(child);
      }
    }
    return children.length > 0;
  }
  let hasElements = false;
  const children = jsonChildren(node);
  for (const child of children) {
    if (isTreeSitterNode(child)) {
      const childHasElements = collectJsonArrayElements(child, elements);
      hasElements = hasElements || childHasElements;
    }
  }
  return hasElements;
}

function buildTokenRanges(
  rootNode: TreeSitterNode,
  textLength: number,
  language?: SupportedLanguage
): TokenRange[] {
  const nodes: TreeSitterNode[] = [];
  if (language === "json") {
    collectJsonPairs(rootNode, nodes);
    if (nodes.length === 0) {
      collectJsonArrayElements(rootNode, nodes);
    }
  }
  if (nodes.length === 0) {
    collectLeafNodes(rootNode, nodes);
  }
  if (nodes.length === 0) {
    return [];
  }
  nodes.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
  const ranges: TokenRange[] = [];
  let lastStart = -1;
  let lastEnd = -1;
  for (const node of nodes) {
    const startIndex = Math.max(0, Math.min(textLength, node.startIndex));
    const endIndex = Math.max(startIndex, Math.min(textLength, node.endIndex));
    if (endIndex <= startIndex) {
      continue;
    }
    if (startIndex === lastStart && endIndex === lastEnd) {
      continue;
    }
    ranges.push({ startIndex, endIndex });
    lastStart = startIndex;
    lastEnd = endIndex;
  }
  return ranges;
}

function parseWithTreeSitter(
  input: ParserInput,
  language: SupportedLanguage
): ParseResult {
  const parser = getParser(language);
  const tree = parser.parse(input.content);
  const rootNode = tree.rootNode;
  const tokens = buildTokenRanges(
    rootNode as unknown as TreeSitterNode,
    input.content.length,
    language
  );
  const diagnostics: string[] = [];
  if (rootNode.hasError) {
    diagnostics.push("Tree-sitter reported parse errors.");
  }
  if (rootNode.isMissing) {
    diagnostics.push("Tree-sitter reported missing nodes.");
  }
  const result: ParseResult = {
    language,
    kind: "tree",
    text: input.content,
    lines: input.content.split(LINE_SPLIT_RE),
    capabilities: {
      hasAstKinds: true,
      hasTokenRanges: true,
      supportsErrorRecovery: true,
      supportsIncrementalParse: false,
    },
    root: rootNode,
    tokens,
  };
  return diagnostics.length > 0 ? { ...result, diagnostics } : result;
}

function toParseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const treeSitterNodeParser: ParserShape = {
  id: "tree-sitter-node",
  languages,
  capabilities: {
    hasAstKinds: true,
    hasTokenRanges: true,
    supportsErrorRecovery: true,
    supportsIncrementalParse: false,
  },
  parse: (input: ParserInput) =>
    Effect.gen(function* () {
      const language = input.language;
      if (!isSupportedLanguage(language)) {
        return yield* ParseError.make({
          parser: "tree-sitter-node",
          message: `Unsupported language: ${language ?? "unknown"}`,
        });
      }
      return yield* Effect.try({
        try: () => parseWithTreeSitter(input, language),
        catch: (error) =>
          ParseError.make({
            parser: "tree-sitter-node",
            message: toParseErrorMessage(error),
          }),
      });
    }),
};

export const treeSitterNodeParsers = [treeSitterNodeParser];
