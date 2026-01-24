import type {
  ParseResult,
  ParserInput,
  Parser as ParserShape,
  TokenRange,
} from "@semadiff/parsers";
import { ParseError } from "@semadiff/parsers";
import { Effect } from "effect";
import { Language, Parser as WebTreeSitterParser } from "web-tree-sitter";

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
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/;

type SupportedLanguage = (typeof languages)[number];

function isSupportedLanguage(
  language: string | undefined
): language is SupportedLanguage {
  return (
    typeof language === "string" &&
    languages.includes(language as SupportedLanguage)
  );
}

interface TreeSitterLanguageModule {
  load: (path: string | URL) => Promise<unknown>;
}

interface WebTreeSitterModule {
  init: (options?: {
    locateFile?: (filename: string, directory?: string) => string;
  }) => Promise<void>;
  Language?: TreeSitterLanguageModule;
  new (): {
    setLanguage: (language: unknown) => void;
    parse: (input: string) => {
      rootNode: { hasError: boolean; isMissing: boolean };
    };
  };
}

const Parser = WebTreeSitterParser as unknown as WebTreeSitterModule;
const LanguageModule: TreeSitterLanguageModule =
  Parser.Language ?? (Language as TreeSitterLanguageModule);

function resolveWasmUrl(modulePath: string, fallbackName: string) {
  const runtime = (
    globalThis as {
      chrome?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).chrome;
  if (runtime?.runtime?.getURL) {
    return runtime.runtime.getURL(`semadiff-wasm/${fallbackName}`);
  }
  const normalizeLocation = (location: string) => {
    try {
      const url = new URL(location);
      if (url.protocol !== "file:") {
        return location;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (
        pathname.startsWith("/") &&
        WINDOWS_DRIVE_RE.test(pathname.slice(1))
      ) {
        pathname = pathname.slice(1);
      }
      return pathname;
    } catch {
      return location;
    }
  };
  const resolver = (import.meta as { resolve?: (specifier: string) => string })
    .resolve;
  if (typeof resolver === "function") {
    try {
      return normalizeLocation(resolver(modulePath));
    } catch {
      // Fall back to URL resolution for environments without module resolution.
    }
  }
  try {
    return normalizeLocation(
      new URL(`./semadiff-wasm/${fallbackName}`, import.meta.url).toString()
    );
  } catch {
    return normalizeLocation(`./semadiff-wasm/${fallbackName}`);
  }
}

const runtimeWasmUrl = resolveWasmUrl(
  "web-tree-sitter/tree-sitter.wasm",
  "tree-sitter.wasm"
);

const languageWasmUrls: Record<SupportedLanguage, string> = {
  ts: resolveWasmUrl(
    "tree-sitter-typescript/tree-sitter-typescript.wasm",
    "tree-sitter-typescript.wasm"
  ),
  tsx: resolveWasmUrl(
    "tree-sitter-typescript/tree-sitter-tsx.wasm",
    "tree-sitter-tsx.wasm"
  ),
  js: resolveWasmUrl(
    "tree-sitter-javascript/tree-sitter-javascript.wasm",
    "tree-sitter-javascript.wasm"
  ),
  jsx: resolveWasmUrl(
    "tree-sitter-javascript/tree-sitter-jsx.wasm",
    "tree-sitter-jsx.wasm"
  ),
  css: resolveWasmUrl(
    "tree-sitter-css/tree-sitter-css.wasm",
    "tree-sitter-css.wasm"
  ),
  json: resolveWasmUrl(
    "tree-sitter-json/tree-sitter-json.wasm",
    "tree-sitter-json.wasm"
  ),
  md: resolveWasmUrl(
    "@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown.wasm",
    "tree-sitter-markdown.wasm"
  ),
  toml: resolveWasmUrl(
    "tree-sitter-toml/tree-sitter-toml.wasm",
    "tree-sitter-toml.wasm"
  ),
  yaml: resolveWasmUrl(
    "@tree-sitter-grammars/tree-sitter-yaml/tree-sitter-yaml.wasm",
    "tree-sitter-yaml.wasm"
  ),
};

interface ParserInstance {
  setLanguage: (language: unknown) => void;
  parse: (input: string) => {
    rootNode: { hasError: boolean; isMissing: boolean };
  };
}

interface TreeSitterNode {
  startIndex: number;
  endIndex: number;
  childCount: number;
  type?: string;
  children?: TreeSitterNode[];
  namedChildren?: TreeSitterNode[];
}

let initPromise: Promise<void> | null = null;
const languageCache = new Map<SupportedLanguage, unknown>();
const parserCache = new Map<SupportedLanguage, ParserInstance>();

async function initRuntime() {
  if (!initPromise) {
    initPromise = Parser.init({
      locateFile: () => runtimeWasmUrl,
    });
  }
  await initPromise;
}

async function loadLanguage(language: SupportedLanguage) {
  const cached = languageCache.get(language);
  if (cached) {
    return cached;
  }
  await initRuntime();
  const wasmUrl = languageWasmUrls[language];
  if (!wasmUrl) {
    throw new Error(`Missing Tree-sitter wasm for ${language}`);
  }
  const lang = await LanguageModule.load(wasmUrl);
  languageCache.set(language, lang);
  return lang;
}

async function getParser(language: SupportedLanguage) {
  const cached = parserCache.get(language);
  if (cached) {
    return cached;
  }
  const lang = await loadLanguage(language);
  const parser = new Parser();
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

async function parseWithTreeSitter(
  input: ParserInput,
  language: SupportedLanguage
): Promise<ParseResult> {
  const parser = await getParser(language);
  const tree = parser.parse(input.content);
  const tokens = buildTokenRanges(
    tree.rootNode as unknown as TreeSitterNode,
    input.content.length,
    language
  );
  const diagnostics: string[] = [];
  if (tree.rootNode.hasError) {
    diagnostics.push("Tree-sitter reported parse errors.");
  }
  if (tree.rootNode.isMissing) {
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
    root: tree.rootNode,
    tokens,
  };
  return diagnostics.length > 0 ? { ...result, diagnostics } : result;
}

export const treeSitterWasmParser: ParserShape = {
  id: "tree-sitter-wasm",
  languages,
  capabilities: {
    hasAstKinds: true,
    hasTokenRanges: true,
    supportsErrorRecovery: true,
    supportsIncrementalParse: false,
  },
  parse: (input: ParserInput) =>
    Effect.tryPromise({
      try: async () => {
        const language = input.language;
        if (!isSupportedLanguage(language)) {
          throw new Error(`Unsupported language: ${language ?? "unknown"}`);
        }
        return await parseWithTreeSitter(input, language);
      },
      catch: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return ParseError.make({ parser: "tree-sitter-wasm", message });
      },
    }),
};

export const treeSitterWasmParsers = [treeSitterWasmParser];
