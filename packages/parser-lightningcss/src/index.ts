import type { ParseResult, Parser, ParserInput } from "@semadiff/parsers";
import { ParseError } from "@semadiff/parsers";
import { Effect } from "effect";
import { transform } from "lightningcss";

const languages = ["css"] as const;
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

function parseWithLightning(
  input: ParserInput,
  language: SupportedLanguage
): ParseResult {
  const encoder = new TextEncoder();
  const result = transform({
    code: encoder.encode(input.content),
    filename: input.path ?? "input.css",
    minify: false,
    sourceMap: false,
    errorRecovery: true,
  });
  const diagnostics = result.warnings.map((warning) => warning.message);
  const parsed: ParseResult = {
    language,
    kind: "tree",
    text: input.content,
    lines: input.content.split(LINE_SPLIT_RE),
    capabilities: {
      hasAstKinds: true,
      hasTokenRanges: false,
      supportsErrorRecovery: true,
      supportsIncrementalParse: false,
    },
    root: result,
  };
  return diagnostics.length > 0 ? { ...parsed, diagnostics } : parsed;
}

function toParseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const lightningCssParser: Parser = {
  id: "lightningcss",
  languages,
  capabilities: {
    hasAstKinds: true,
    hasTokenRanges: false,
    supportsErrorRecovery: true,
    supportsIncrementalParse: false,
  },
  parse: (input: ParserInput) =>
    Effect.gen(function* () {
      const language = input.language;
      if (!isSupportedLanguage(language)) {
        return yield* ParseError.make({
          parser: "lightningcss",
          message: `Unsupported language: ${language ?? "unknown"}`,
        });
      }
      return yield* Effect.try({
        try: () => parseWithLightning(input, language),
        catch: (error) =>
          ParseError.make({
            parser: "lightningcss",
            message: toParseErrorMessage(error),
          }),
      });
    }),
};

export const lightningCssParsers = [lightningCssParser];

export const packageName = "@semadiff/parser-lightningcss";
