import { Effect, Schema, ServiceMap } from "effect";

const catchRecoverable = Effect.catch;

export type LanguageId =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "css"
  | "json"
  | "md"
  | "toml"
  | "yaml"
  | "text";

export interface ParserCapability {
  hasAstKinds: boolean;
  hasTokenRanges: boolean;
  supportsErrorRecovery: boolean;
  supportsIncrementalParse: boolean;
}

export interface TokenRange {
  startIndex: number;
  endIndex: number;
}

export interface ParseResult {
  language: LanguageId;
  kind: "tree" | "text";
  text: string;
  lines: readonly string[];
  capabilities: ParserCapability;
  root?: unknown;
  tokens?: readonly TokenRange[];
  diagnostics?: readonly string[];
}

export interface ParserInput {
  content: string;
  path?: string;
  language?: LanguageId;
}

export class ParseError extends Schema.TaggedErrorClass<ParseError>()(
  "ParseError",
  {
    parser: Schema.String,
    message: Schema.String,
  }
) {}

export interface Parser {
  id: string;
  languages: readonly LanguageId[];
  capabilities: ParserCapability;
  parse: (input: ParserInput) => Effect.Effect<ParseResult, ParseError>;
}

export interface ParserRegistryService {
  parse: (input: ParserInput) => Effect.Effect<ParseResult, never>;
  selectLanguage: (input: ParserInput) => LanguageId;
  listCapabilities: () => Record<string, ParserCapability>;
}

export class ParserRegistry extends ServiceMap.Service<
  ParserRegistry,
  ParserRegistryService
>()("@semadiff/ParserRegistry") {}

const LINE_SPLIT_RE = /\r?\n/;

const textParser = {
  id: "text",
  languages: ["text"],
  capabilities: {
    hasAstKinds: false,
    hasTokenRanges: false,
    supportsErrorRecovery: true,
    supportsIncrementalParse: false,
  },
  parse: (input) =>
    Effect.succeed({
      language: input.language ?? "text",
      kind: "text",
      text: input.content,
      lines: input.content.split(LINE_SPLIT_RE),
      capabilities: {
        hasAstKinds: false,
        hasTokenRanges: false,
        supportsErrorRecovery: true,
        supportsIncrementalParse: false,
      },
    }),
} satisfies Parser;
const parsers: Parser[] = [textParser];

function selectLanguage(input: ParserInput): LanguageId {
  if (input.language) {
    return input.language;
  }
  const firstLine = input.content.split(LINE_SPLIT_RE, 1)[0] ?? "";
  if (firstLine.startsWith("#!")) {
    const lowered = firstLine.toLowerCase();
    if (
      lowered.includes("node") ||
      lowered.includes("deno") ||
      lowered.includes("bun")
    ) {
      return "js";
    }
  }
  if (input.path) {
    const ext = input.path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
        return "ts";
      case "tsx":
        return "tsx";
      case "js":
        return "js";
      case "jsx":
        return "jsx";
      case "css":
        return "css";
      case "json":
        return "json";
      case "md":
      case "markdown":
        return "md";
      case "toml":
        return "toml";
      case "yaml":
      case "yml":
        return "yaml";
      default:
        break;
    }
  }

  const trimmed = input.content.trim();
  if (trimmed.startsWith("---") && trimmed.includes(":")) {
    return "yaml";
  }
  if (
    trimmed.startsWith("[") &&
    trimmed.includes("]") &&
    trimmed.includes("=")
  ) {
    return "toml";
  }
  if (trimmed.startsWith("#")) {
    return "md";
  }

  return "text";
}

export function makeRegistry(
  availableParsers: Parser[]
): ParserRegistryService {
  return {
    parse: (input) => {
      const language = selectLanguage(input);
      const chain = availableParsers.filter((parser) =>
        parser.languages.includes(language)
      );
      const fallbackChain = chain.length > 0 ? chain : [textParser];
      const parseInput = { ...input, language };

      const parseWithFallback = (
        index: number
      ): Effect.Effect<{ result: ParseResult; index: number }, never> => {
        const parser = fallbackChain[index];
        if (!parser) {
          return Effect.map(textParser.parse(parseInput), (result) => ({
            result,
            index: fallbackChain.length,
          }));
        }
        return Effect.matchEffect(parser.parse(parseInput), {
          onFailure: () => parseWithFallback(index + 1),
          onSuccess: (result) => Effect.succeed({ result, index }),
        });
      };

      const attachTokenFallback = (
        result: ParseResult,
        startIndex: number
      ): Effect.Effect<ParseResult, never> => {
        if (result.tokens !== undefined) {
          return Effect.succeed(result);
        }

        const findTokenParser = (
          index: number
        ): Effect.Effect<ParseResult, never> => {
          const parser = fallbackChain[index];
          if (!parser) {
            return Effect.succeed(result);
          }
          if (!parser.capabilities.hasTokenRanges) {
            return findTokenParser(index + 1);
          }
          return catchRecoverable(parser.parse(parseInput), () =>
            findTokenParser(index + 1)
          ).pipe(
            Effect.flatMap((tokenResult) => {
              if (tokenResult.tokens === undefined) {
                return findTokenParser(index + 1);
              }
              return Effect.succeed({
                ...result,
                tokens: tokenResult.tokens,
                capabilities: {
                  ...result.capabilities,
                  hasTokenRanges: true,
                },
              });
            })
          );
        };

        return findTokenParser(startIndex);
      };

      return parseWithFallback(0).pipe(
        Effect.flatMap(({ result, index }) =>
          attachTokenFallback(result, index + 1)
        )
      );
    },
    selectLanguage,
    listCapabilities: () =>
      Object.fromEntries(
        availableParsers.map((parser) => [parser.id, parser.capabilities])
      ),
  };
}

export const ParserRegistryLive = Effect.succeed<ParserRegistryService>(
  makeRegistry(parsers)
);
