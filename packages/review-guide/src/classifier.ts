import type {
	FileClassification,
	ReviewCategory,
	ReviewFileSummaryInput,
	ReviewTrustBand,
} from "./schemas.js";

const LOCKFILE_NAMES = new Set([
	"pnpm-lock.yaml",
	"package-lock.json",
	"bun.lock",
	"yarn.lock",
	"cargo.lock",
	"gemfile.lock",
	"poetry.lock",
]);

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);

const CONFIG_FILENAMES = new Set([
	"package.json",
	"tsconfig.json",
	"vite.config.ts",
	"vite.config.js",
	"vitest.config.ts",
	"vitest.config.js",
	"playwright.config.ts",
	"playwright.config.js",
]);

const CONFIG_EXTENSIONS = new Set([
	".yaml",
	".yml",
	".toml",
	".ini",
	".json",
	".jsonc",
]);

const TEST_FILENAME_REGEX = /\.(spec|test)\.[^.]+$/u;

const normalizePath = (path: string) =>
	path.replaceAll("\\", "/").toLowerCase();

const basename = (path: string) => {
	const normalized = normalizePath(path);
	const parts = normalized.split("/");
	return parts.at(-1) ?? normalized;
};

const extensionOf = (path: string) => {
	const base = basename(path);
	const index = base.lastIndexOf(".");
	return index >= 0 ? base.slice(index) : "";
};

const includesAnySegment = (path: string, segments: readonly string[]) =>
	segments.some((segment) => path.includes(segment));

const isParserFallback = (input: ReviewFileSummaryInput) =>
	input.language === "text" ||
	(input.warnings ?? []).some((warning) =>
		warning.toLowerCase().includes("no semantic parser"),
	);

const isLockfile = (path: string) => LOCKFILE_NAMES.has(basename(path));

const isVendored = (path: string) =>
	path.startsWith("vendor/") ||
	path.startsWith("vendors/") ||
	path.startsWith("third_party/") ||
	path.startsWith("node_modules/") ||
	includesAnySegment(path, [
		"/vendor/",
		"/vendors/",
		"/third_party/",
		"/node_modules/",
	]);

const isGenerated = (path: string) =>
	includesAnySegment(path, [
		"/dist/",
		"/build/",
		"/coverage/",
		"/storybook-static/",
	]) ||
	path.endsWith(".min.js") ||
	path.endsWith(".snap") ||
	path.includes(".generated.") ||
	path.includes(".gen.");

const isTest = (path: string) =>
	includesAnySegment(path, ["/__tests__/", "/__mocks__/"]) ||
	TEST_FILENAME_REGEX.test(path);

const isDocs = (path: string) =>
	path.startsWith("docs/") || DOC_EXTENSIONS.has(extensionOf(path));

const isConfig = (path: string) => {
	const base = basename(path);
	if (CONFIG_FILENAMES.has(base) || CONFIG_EXTENSIONS.has(extensionOf(path))) {
		return true;
	}

	return (
		path.startsWith(".github/") ||
		path.startsWith(".vscode/") ||
		path.endsWith(".config.ts") ||
		path.endsWith(".config.js") ||
		path.endsWith(".config.mjs") ||
		path.endsWith(".config.cjs")
	);
};

const uniqueCategories = (categories: readonly ReviewCategory[]) => [
	...new Set(categories),
];

const determinePrimaryCategory = (
	path: string,
	input: ReviewFileSummaryInput,
): ReviewCategory => {
	if (input.binary) {
		return "binary";
	}
	if (input.oversized) {
		return "oversized";
	}
	if (isLockfile(path)) {
		return "lockfile";
	}
	if (isVendored(path)) {
		return "vendored";
	}
	if (isGenerated(path)) {
		return "generated";
	}
	if (isTest(path)) {
		return "test";
	}
	if (isDocs(path)) {
		return "docs";
	}
	if (isConfig(path)) {
		return "config";
	}
	return "source";
};

const buildReasons = (
	primaryCategory: ReviewCategory,
	parserFallback: boolean,
	input: ReviewFileSummaryInput,
) => {
	const reasons: string[] = [];

	switch (primaryCategory) {
		case "binary":
			reasons.push("Binary file reported by file summary metadata.");
			break;
		case "oversized":
			reasons.push("File exceeds the semantic diff size budget.");
			break;
		case "lockfile":
			reasons.push("Path matched deterministic lockfile rules.");
			break;
		case "vendored":
			reasons.push("Path matched vendored or third-party code rules.");
			break;
		case "generated":
			reasons.push("Path matched generated-artifact heuristics.");
			break;
		case "test":
			reasons.push("Path matched deterministic test-file rules.");
			break;
		case "docs":
			reasons.push("Path matched documentation-oriented rules.");
			break;
		case "config":
			reasons.push("Path matched configuration-oriented rules.");
			break;
		case "source":
			reasons.push("No special-case rule matched; defaulted to source.");
			break;
		case "parser_fallback":
		case "unknown":
			reasons.push("No deterministic classification rule matched.");
			break;
		default:
			reasons.push("No deterministic classification rule matched.");
			break;
	}

	if (parserFallback) {
		reasons.push(
			"Semantic parser fallback detected from language or warnings.",
		);
	}

	if (input.previousFilename) {
		reasons.push(
			"Previous filename is present, indicating a rename-aware file.",
		);
	}

	return reasons;
};

const determineTrustBand = (
	primaryCategory: ReviewCategory,
	parserFallback: boolean,
): ReviewTrustBand => {
	if (primaryCategory === "binary" || primaryCategory === "oversized") {
		return "structural_fact";
	}
	if (parserFallback) {
		return "low_confidence";
	}
	return "deterministic_inference";
};

export const classifyReviewFile = (
	input: ReviewFileSummaryInput,
): FileClassification => {
	const path = normalizePath(input.filename);
	const parserFallback = isParserFallback(input);
	const primaryCategory = determinePrimaryCategory(path, input);
	const categories = uniqueCategories([
		primaryCategory,
		...(parserFallback ? (["parser_fallback"] as const) : []),
	]);

	return {
		primaryCategory,
		categories,
		trustBand: determineTrustBand(primaryCategory, parserFallback),
		reasons: buildReasons(primaryCategory, parserFallback, input),
	};
};
