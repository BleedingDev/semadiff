import type { ParseResult, Parser, ParserInput } from "@semadiff/parsers";
import { ParseError } from "@semadiff/parsers";
import { parseSync } from "@swc/core";
import { Effect } from "effect";

const languages = ["ts", "tsx", "js", "jsx"] as const;
type SupportedLanguage = (typeof languages)[number];
const LINE_SPLIT_RE = /\r?\n/;

function isSupportedLanguage(
	language: string | undefined,
): language is SupportedLanguage {
	return (
		typeof language === "string" &&
		languages.includes(language as SupportedLanguage)
	);
}

function parseWithSwc(
	input: ParserInput,
	language: SupportedLanguage,
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

	return {
		language,
		kind: "tree",
		text: input.content,
		lines: input.content.split(LINE_SPLIT_RE),
		capabilities: {
			hasAstKinds: true,
			// Token ranges are provided by fallback parsers (tree-sitter) for better granularity.
			hasTokenRanges: false,
			supportsErrorRecovery: false,
			supportsIncrementalParse: false,
		},
		root: ast,
	};
}

function toParseErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export const swcParser: Parser = {
	id: "swc",
	languages,
	capabilities: {
		hasAstKinds: true,
		hasTokenRanges: false,
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
