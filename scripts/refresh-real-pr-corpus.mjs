#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createContext, Script } from "node:vm";

const DEFAULT_OUTPUT_ROOT = "bench/cases/real/prs";
const DEFAULT_MIN_CASES = 50;
const DEFAULT_PER_REPO_LIMIT = 5;
const DEFAULT_CANDIDATE_LIMIT = 90;
const DEFAULT_MAX_SELECTED_FILES = 1;
const DEFAULT_MAX_FILE_CHANGES = 80;
const DEFAULT_MAX_PATCH_LINES = 120;
const DEFAULT_MAX_PER_REPO = 12;
const GITHUB_PAGE_SIZE = 100;
const GITHUB_MAX_PULL_FILES = 3000;
const GH_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const GIT_FALLBACK_CACHE_ROOT = join(tmpdir(), "semadiff-real-pr-repo-cache");
const DEFAULT_TOOLS = [
	"semadiff",
	"git-diff",
	"git-diff-color-moved",
	"difftastic",
	"semanticdiff",
];
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const GIT_DIFF_PREFIX = "diff --git ";
const GIT_DIFF_SPLIT_RE = /^diff --git /m;
const LINE_SPLIT_RE = /\r?\n/;
const OCTAL_ESCAPE_RE = /^[0-7]{3}$/;
const EPSILON = 1e-9;

const DEFAULT_REPOSITORIES = [
	"colinhacks/zod",
	"reduxjs/redux-toolkit",
	"vitejs/vite",
	"typeStrong/ts-node",
	"vitest-dev/vitest",
	"pnpm/pnpm",
	"vuejs/pinia",
	"honojs/hono",
	"effect-ts/effect",
	"nitrojs/nitro",
	"mswjs/msw",
	"react-hook-form/react-hook-form",
	"sindresorhus/type-fest",
	"TanStack/query",
];

const DEFAULT_SEARCH_TERMS = [
	"fix",
	"chore",
	"typo",
	"types",
	"translation",
	"refactor",
];

const SUPPORTED_EXTENSIONS = new Map([
	[".ts", "ts"],
	[".tsx", "tsx"],
]);

function usage() {
	return [
		"Usage: refresh-real-pr-corpus [options]",
		"",
		"Options:",
		`  --output <dir>               Output root (default: ${DEFAULT_OUTPUT_ROOT})`,
		`  --min-cases <count>         Minimum winning PR cases to keep (default: ${DEFAULT_MIN_CASES})`,
		`  --candidate-limit <count>   Maximum candidate PR cases to evaluate (default: ${DEFAULT_CANDIDATE_LIMIT})`,
		`  --per-repo-limit <count>    Maximum merged PRs to inspect per repository (default: ${DEFAULT_PER_REPO_LIMIT})`,
		`  --max-per-repo <count>      Maximum winning cases to keep per repository (default: ${DEFAULT_MAX_PER_REPO})`,
		`  --max-selected-files <n>    Maximum supported files per PR slice (default: ${DEFAULT_MAX_SELECTED_FILES})`,
		`  --max-file-changes <n>      Maximum changed lines per selected file (default: ${DEFAULT_MAX_FILE_CHANGES})`,
		`  --max-patch-lines <n>       Maximum patch lines per selected file (default: ${DEFAULT_MAX_PATCH_LINES})`,
		`  --repos <list>              Comma-separated repository list (default: ${DEFAULT_REPOSITORIES.join(",")})`,
		`  --search-terms <list>      Comma-separated PR title terms (default: ${DEFAULT_SEARCH_TERMS.join(",")})`,
		`  --tools <list>              Comma-separated comparison tools (default: ${DEFAULT_TOOLS.join(",")})`,
		"  --help                      Show this message",
	].join("\n");
}

function readOptionValue(argv, index, flag) {
	const value = argv[index + 1];
	if (!value) {
		throw new Error(`Missing value for ${flag}.`);
	}
	return { value, nextIndex: index + 1 };
}

function readPositiveInteger(value, flag) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`Expected ${flag} to be a positive integer.`);
	}
	return parsed;
}

function parseList(value) {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function parseArgs(argv) {
	const options = {
		outputRoot: DEFAULT_OUTPUT_ROOT,
		minCases: DEFAULT_MIN_CASES,
		candidateLimit: DEFAULT_CANDIDATE_LIMIT,
		perRepoLimit: DEFAULT_PER_REPO_LIMIT,
		maxPerRepo: DEFAULT_MAX_PER_REPO,
		maxSelectedFiles: DEFAULT_MAX_SELECTED_FILES,
		maxFileChanges: DEFAULT_MAX_FILE_CHANGES,
		maxPatchLines: DEFAULT_MAX_PATCH_LINES,
		repositories: [...DEFAULT_REPOSITORIES],
		searchTerms: [...DEFAULT_SEARCH_TERMS],
		tools: [...DEFAULT_TOOLS],
		help: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		switch (value) {
			case "--help":
				options.help = true;
				break;
			case "--output": {
				const parsed = readOptionValue(argv, index, value);
				options.outputRoot = parsed.value;
				index = parsed.nextIndex;
				break;
			}
			case "--min-cases": {
				const parsed = readOptionValue(argv, index, value);
				options.minCases = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--candidate-limit": {
				const parsed = readOptionValue(argv, index, value);
				options.candidateLimit = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--per-repo-limit": {
				const parsed = readOptionValue(argv, index, value);
				options.perRepoLimit = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--max-per-repo": {
				const parsed = readOptionValue(argv, index, value);
				options.maxPerRepo = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--max-selected-files": {
				const parsed = readOptionValue(argv, index, value);
				options.maxSelectedFiles = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--max-file-changes": {
				const parsed = readOptionValue(argv, index, value);
				options.maxFileChanges = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--max-patch-lines": {
				const parsed = readOptionValue(argv, index, value);
				options.maxPatchLines = readPositiveInteger(parsed.value, value);
				index = parsed.nextIndex;
				break;
			}
			case "--repos": {
				const parsed = readOptionValue(argv, index, value);
				const repositories = parseList(parsed.value);
				if (repositories.length === 0) {
					throw new Error("Expected at least one repository for --repos.");
				}
				options.repositories = repositories;
				index = parsed.nextIndex;
				break;
			}
			case "--search-terms": {
				const parsed = readOptionValue(argv, index, value);
				const searchTerms = parseList(parsed.value);
				if (searchTerms.length === 0) {
					throw new Error(
						"Expected at least one search term for --search-terms.",
					);
				}
				options.searchTerms = searchTerms;
				index = parsed.nextIndex;
				break;
			}
			case "--tools": {
				const parsed = readOptionValue(argv, index, value);
				const tools = parseList(parsed.value);
				if (tools.length === 0) {
					throw new Error("Expected at least one tool for --tools.");
				}
				options.tools = tools;
				index = parsed.nextIndex;
				break;
			}
			default:
				throw new Error(`Unknown argument: ${value}`);
		}
	}

	if (options.candidateLimit < options.minCases) {
		throw new Error("--candidate-limit must be >= --min-cases.");
	}

	return options;
}

function ghJson(args) {
	return JSON.parse(
		execFileSync("gh", args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: GH_MAX_BUFFER_BYTES,
		}),
	);
}

function ghText(args) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: GH_MAX_BUFFER_BYTES,
	});
}

function gitText(args) {
	return execFileSync("git", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: GH_MAX_BUFFER_BYTES,
	});
}

function gitRun(args) {
	execFileSync("git", args, {
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: GH_MAX_BUFFER_BYTES,
	});
}

function ghApiJson(path) {
	return ghJson(["api", path]);
}

export function paginateJsonArray(loadPage, pageSize = GITHUB_PAGE_SIZE) {
	const items = [];
	for (let page = 1; ; page += 1) {
		const pageItems = loadPage(page);
		if (!Array.isArray(pageItems)) {
			throw new Error("Expected paginated GitHub response to be an array.");
		}
		items.push(...pageItems);
		if (pageItems.length < pageSize) {
			return items;
		}
	}
}

function ghApiJsonPaginatedArray(path) {
	return paginateJsonArray((page) =>
		ghApiJson(`${path}${path.includes("?") ? "&" : "?"}page=${page}`),
	);
}

function ghApiRaw(path) {
	return ghText(["api", "-H", "Accept: application/vnd.github.raw+json", path]);
}

function ghApiDiff(path) {
	return ghText(["api", "-H", "Accept: application/vnd.github.v3.diff", path]);
}

async function fetchText(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Request failed for ${url}: ${response.status}`);
	}
	return response.text();
}

function semanticDiffPullRequestUrl(repository, number) {
	const [owner, repo] = repository.split("/");
	return `https://app.semanticdiff.com/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${number}`;
}

function extractSemanticDiffController(html, url) {
	const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	const controllerBlock = scriptBlocks
		.map((match) => match[1] ?? "")
		.find((script) => script.includes("new DiffViewerController("));
	if (!controllerBlock) {
		throw new Error(`Missing DiffViewerController script in ${url}.`);
	}

	let captured;
	function DiffViewerController(...args) {
		captured = args;
	}
	const sandbox = {
		window: {
			addEventListener(_event, listener) {
				listener();
			},
		},
		DiffViewerController,
	};
	const context = createContext(sandbox);
	new Script(controllerBlock).runInContext(context, { timeout: 1000 });
	if (!captured || captured.length < 3) {
		throw new Error(
			`Failed to evaluate DiffViewerController payload from ${url}.`,
		);
	}

	const [tree, diffInfo, settings, flags] = captured;
	return {
		tree,
		diffInfo,
		settings,
		flags,
	};
}

function flattenSemanticDiffEntries(node, entries = []) {
	if (Array.isArray(node)) {
		for (const child of node) {
			flattenSemanticDiffEntries(child, entries);
		}
		return entries;
	}
	if (!(node && typeof node === "object")) {
		return entries;
	}
	if (typeof node.diff === "string" && typeof node.tracking_name === "string") {
		entries.push(node);
		return entries;
	}
	const children = node.children;
	if (!(children && typeof children === "object")) {
		return entries;
	}
	for (const child of Object.values(children)) {
		flattenSemanticDiffEntries(child, entries);
	}
	return entries;
}

function encodeGitHubPath(path) {
	return path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function searchPullRequests(repository, limit, searchTerms) {
	const mergedResults = new Map();
	for (const searchTerm of searchTerms) {
		const results = ghJson([
			"search",
			"prs",
			searchTerm,
			"--repo",
			repository,
			"--merged",
			"--match",
			"title",
			"--sort",
			"updated",
			"--order",
			"desc",
			"--limit",
			String(limit),
			"--json",
			"number,title,url,closedAt",
		]);
		for (const result of results) {
			mergedResults.set(String(result.number), result);
		}
	}
	return [...mergedResults.values()];
}

export function fetchPullRequest(repository, number) {
	return ghApiJson(`repos/${repository}/pulls/${number}`);
}

export function fetchPullRequestFiles(repository, number) {
	return ghApiJsonPaginatedArray(
		`repos/${repository}/pulls/${number}/files?per_page=${GITHUB_PAGE_SIZE}`,
	);
}

export function isLargePullRequestDiffError(error) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("(HTTP 406)") ||
		message.includes("diff exceeded the maximum number of files") ||
		message.includes("diff exceeded the maximum number of lines")
	);
}

export function fetchPullRequestDiff(repository, number) {
	try {
		return ghApiDiff(`repos/${repository}/pulls/${number}`);
	} catch (error) {
		if (isLargePullRequestDiffError(error)) {
			return null;
		}
		throw error;
	}
}

export function isPullRequestFilesTruncated(changedFiles, files) {
	return (
		typeof changedFiles === "number" &&
		changedFiles > 0 &&
		files.length < changedFiles
	);
}

export function shouldBypassGitHubPullFilesApi(changedFiles) {
	return (
		typeof changedFiles === "number" && changedFiles > GITHUB_MAX_PULL_FILES
	);
}

function benchmarkLanguageForPath(path) {
	return SUPPORTED_EXTENSIONS.get(extname(path).toLowerCase()) ?? null;
}

function patchLineCount(patch) {
	return patch.split(LINE_SPLIT_RE).length;
}

function benchmarkStatusFromGitHub(status) {
	switch (status) {
		case "added":
			return "added";
		case "modified":
			return "modified";
		case "removed":
			return "deleted";
		case "renamed":
			return "renamed";
		default:
			return null;
	}
}

function isSupportedPullFile(file, options) {
	const benchmarkStatus = benchmarkStatusFromGitHub(file.status);
	const oldPath = file.previous_filename ?? file.filename;
	const newPath = file.filename;
	if (oldPath.endsWith(".d.ts") || newPath.endsWith(".d.ts")) {
		return false;
	}
	const language =
		benchmarkLanguageForPath(newPath) ?? benchmarkLanguageForPath(oldPath);
	if (!(benchmarkStatus && language)) {
		return false;
	}
	if (typeof file.patch !== "string" || file.patch.length === 0) {
		return false;
	}
	if ((file.changes ?? 0) > options.maxFileChanges) {
		return false;
	}
	if (patchLineCount(file.patch) > options.maxPatchLines) {
		return false;
	}
	return true;
}

function selectPullRequestFiles(files, options) {
	return files
		.filter((file) => isSupportedPullFile(file, options))
		.sort((left, right) => {
			const changeDelta = (left.changes ?? 0) - (right.changes ?? 0);
			if (changeDelta !== 0) {
				return changeDelta;
			}
			return left.filename.localeCompare(right.filename);
		})
		.slice(0, options.maxSelectedFiles);
}

function buildRange(lines) {
	if (lines.length === 0) {
		return undefined;
	}
	return {
		startLine: lines[0],
		endLine: lines.at(-1),
	};
}

function parsePatchOperations(fileId, patch) {
	const operations = [];
	let oldLine = 0;
	let newLine = 0;
	let deletedLines = [];
	let insertedLines = [];

	const flush = () => {
		const oldRange = buildRange(deletedLines);
		const newRange = buildRange(insertedLines);
		if (!(oldRange || newRange)) {
			return;
		}
		if (oldRange && newRange) {
			operations.push({ fileId, type: "update", oldRange, newRange });
		} else if (oldRange) {
			operations.push({ fileId, type: "delete", oldRange });
		} else if (newRange) {
			operations.push({ fileId, type: "insert", newRange });
		}
		deletedLines = [];
		insertedLines = [];
	};

	for (const line of patch.split(LINE_SPLIT_RE)) {
		const header = line.match(HUNK_HEADER_RE);
		if (header) {
			flush();
			oldLine = Number.parseInt(header[1] ?? "0", 10);
			newLine = Number.parseInt(header[3] ?? "0", 10);
			continue;
		}
		if (line.startsWith("\\")) {
			continue;
		}
		switch (line[0]) {
			case "-":
				deletedLines.push(oldLine);
				oldLine += 1;
				break;
			case "+":
				insertedLines.push(newLine);
				newLine += 1;
				break;
			case " ":
				flush();
				oldLine += 1;
				newLine += 1;
				break;
			default:
				break;
		}
	}

	flush();
	return operations;
}

function sanitizeSegment(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function caseIdForPullRequest(repository, number) {
	const [owner, repo] = repository.split("/");
	return `github-pr-${sanitizeSegment(owner)}-${sanitizeSegment(repo)}-${number}`;
}

function fileExtension(file) {
	return (
		extname(file.filename || file.previous_filename || "").toLowerCase() ||
		".txt"
	);
}

function fetchFileContents(repository, ref, path) {
	return ghApiRaw(
		`repos/${repository}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(ref)}`,
	);
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildDiffHeaderPaths(file) {
	const oldPath = file.previous_filename ?? file.filename;
	const newPath = file.filename;
	return {
		oldPath,
		newPath,
		oldLabel: file.status === "added" ? "/dev/null" : `a/${oldPath}`,
		newLabel: file.status === "removed" ? "/dev/null" : `b/${newPath}`,
	};
}

export function buildPullDiffFromFiles(pullFiles) {
	return pullFiles
		.map((file) => {
			const { oldPath, newPath, oldLabel, newLabel } =
				buildDiffHeaderPaths(file);
			const lines = [`diff --git a/${oldPath} b/${newPath}`];
			if (file.status === "added") {
				lines.push("new file mode 100644");
			} else if (file.status === "removed") {
				lines.push("deleted file mode 100644");
			} else if (file.status === "renamed") {
				lines.push(`rename from ${oldPath}`);
				lines.push(`rename to ${newPath}`);
			}
			lines.push(`--- ${oldLabel}`);
			lines.push(`+++ ${newLabel}`);
			if (typeof file.patch === "string" && file.patch.length > 0) {
				lines.push(file.patch.trimEnd());
			} else {
				lines.push("Binary files differ");
			}
			return lines.join("\n");
		})
		.join("\n");
}

function patchChangeCounts(patch) {
	let additions = 0;
	let deletions = 0;
	for (const line of patch.split(LINE_SPLIT_RE)) {
		if (
			line.startsWith("@@") ||
			line.startsWith("+++") ||
			line.startsWith("---") ||
			line.startsWith("\\")
		) {
			continue;
		}
		if (line.startsWith("+")) {
			additions += 1;
			continue;
		}
		if (line.startsWith("-")) {
			deletions += 1;
		}
	}
	return {
		additions,
		deletions,
		changes: additions + deletions,
	};
}

function extractGitPatch(lines) {
	const patchStart = lines.findIndex(
		(line) => HUNK_HEADER_RE.test(line) || line === "GIT binary patch",
	);
	if (patchStart === -1) {
		return "";
	}
	return lines.slice(patchStart).join("\n");
}

function decodeGitQuotedPath(value) {
	const bytes = [];
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char !== "\\") {
			bytes.push(char.charCodeAt(0));
			continue;
		}
		const next = value[index + 1] ?? "";
		switch (next) {
			case "\\":
			case '"':
				bytes.push(next.charCodeAt(0));
				index += 1;
				break;
			case "t":
				bytes.push(9);
				index += 1;
				break;
			case "n":
				bytes.push(10);
				index += 1;
				break;
			case "r":
				bytes.push(13);
				index += 1;
				break;
			default: {
				const octal = value.slice(index + 1, index + 4);
				if (OCTAL_ESCAPE_RE.test(octal)) {
					bytes.push(Number.parseInt(octal, 8));
					index += 3;
					break;
				}
				bytes.push(next.charCodeAt(0));
				index += 1;
			}
		}
	}
	return Buffer.from(bytes).toString("utf8");
}

function decodeGitPathToken(token, prefix) {
	const unquoted =
		token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token;
	if (!unquoted.startsWith(prefix)) {
		throw new Error(`Unable to parse git diff path token: ${token}`);
	}
	return decodeGitQuotedPath(unquoted.slice(prefix.length));
}

function readGitPathToken(line, startIndex) {
	if (line[startIndex] === '"') {
		let index = startIndex + 1;
		let escaped = false;
		while (index < line.length) {
			const char = line[index];
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				return {
					token: line.slice(startIndex, index + 1),
					nextIndex: index + 1,
				};
			}
			index += 1;
		}
		throw new Error(`Unterminated quoted git diff path token: ${line}`);
	}
	let endIndex = startIndex;
	while (endIndex < line.length && line[endIndex] !== " ") {
		endIndex += 1;
	}
	return {
		token: line.slice(startIndex, endIndex),
		nextIndex: endIndex,
	};
}

function parseGitDiffHeaderPaths(line) {
	if (!line.startsWith(GIT_DIFF_PREFIX)) {
		return null;
	}
	let index = GIT_DIFF_PREFIX.length;
	const oldToken = readGitPathToken(line, index);
	index = oldToken.nextIndex;
	while (line[index] === " ") {
		index += 1;
	}
	const newToken = readGitPathToken(line, index);
	return {
		oldPath: decodeGitPathToken(oldToken.token, "a/"),
		newPath: decodeGitPathToken(newToken.token, "b/"),
	};
}

function parseGitMetadataPath(line, prefix) {
	return decodeGitQuotedPath(line.slice(prefix.length).trim());
}

export function buildPullFilesFromGitDiff(pullDiff) {
	const chunks = pullDiff
		.split(GIT_DIFF_SPLIT_RE)
		.map((chunk) => chunk.trim())
		.filter((chunk) => chunk.length > 0)
		.map((chunk) => `diff --git ${chunk}`);

	return chunks.map((chunk) => {
		const lines = chunk.split(LINE_SPLIT_RE);
		const header = parseGitDiffHeaderPaths(lines[0] ?? "");
		if (!header) {
			throw new Error(
				`Unable to parse git diff header: ${lines[0] ?? "<empty>"}`,
			);
		}
		let status = "modified";
		let previousFilename = header.oldPath;
		let filename = header.newPath;
		for (const line of lines.slice(1)) {
			if (line.startsWith("new file mode ")) {
				status = "added";
			} else if (line.startsWith("deleted file mode ")) {
				status = "removed";
			} else if (line.startsWith("rename from ")) {
				status = "renamed";
				previousFilename = parseGitMetadataPath(line, "rename from ");
			} else if (line.startsWith("rename to ")) {
				filename = parseGitMetadataPath(line, "rename to ");
			}
		}
		const patch = extractGitPatch(lines);
		const counts = patchChangeCounts(patch);
		return {
			filename,
			...(status === "renamed" ? { previous_filename: previousFilename } : {}),
			status,
			patch,
			additions: counts.additions,
			deletions: counts.deletions,
			changes: counts.changes,
		};
	});
}

function gitFallbackCacheDirectory(repository) {
	const [owner, repo] = repository.split("/");
	return join(
		GIT_FALLBACK_CACHE_ROOT,
		`${sanitizeSegment(owner)}--${sanitizeSegment(repo)}.git`,
	);
}

function ensureGitFallbackRepository(repository) {
	mkdirSync(GIT_FALLBACK_CACHE_ROOT, { recursive: true });
	const repositoryDirectory = gitFallbackCacheDirectory(repository);
	const remoteUrl = `https://github.com/${repository}.git`;
	if (!existsSync(join(repositoryDirectory, "HEAD"))) {
		rmSync(repositoryDirectory, { recursive: true, force: true });
		mkdirSync(repositoryDirectory, { recursive: true });
		gitRun(["init", "--bare", repositoryDirectory]);
		gitRun(["-C", repositoryDirectory, "remote", "add", "origin", remoteUrl]);
		return repositoryDirectory;
	}
	gitRun(["-C", repositoryDirectory, "remote", "set-url", "origin", remoteUrl]);
	return repositoryDirectory;
}

export function fetchPullRequestGitDiff(repository, baseSha, headSha) {
	const repositoryDirectory = ensureGitFallbackRepository(repository);
	gitRun([
		"-C",
		repositoryDirectory,
		"fetch",
		"--no-tags",
		"--depth=1",
		"--filter=blob:none",
		"origin",
		baseSha,
		headSha,
	]);
	return gitText([
		"-C",
		repositoryDirectory,
		"diff",
		"--find-renames",
		"--find-copies",
		"--binary",
		baseSha,
		headSha,
	]);
}

function writeGitHubArchive(caseDirectory, pullRequest, pullFiles, pullDiff) {
	const archiveDirectory = join(caseDirectory, "github");
	writeJson(join(archiveDirectory, "pull-request.json"), pullRequest);
	writeJson(join(archiveDirectory, "files.json"), pullFiles);
	writeFileSync(
		join(archiveDirectory, "pull.diff"),
		pullDiff ?? buildPullDiffFromFiles(pullFiles),
	);
}

async function writeSemanticDiffArchive(
	caseDirectory,
	pullRequest,
	trackedFiles,
) {
	const cacheDirectory = join(caseDirectory, "semanticdiff");
	const diffDirectory = join(cacheDirectory, "diffs");
	mkdirSync(diffDirectory, { recursive: true });

	const pageUrl = semanticDiffPullRequestUrl(
		pullRequest.repository,
		pullRequest.number,
	);
	const html = await fetchText(pageUrl);
	const controller = extractSemanticDiffController(html, pageUrl);
	const flattenedEntries = flattenSemanticDiffEntries(controller.tree);
	const trackedSet = trackedFiles ? new Set(trackedFiles) : null;
	const manifest = [];
	let diffIndex = 0;

	for (const entry of flattenedEntries) {
		if (
			!(
				entry &&
				typeof entry === "object" &&
				typeof entry.diff === "string" &&
				typeof entry.tracking_name === "string"
			)
		) {
			continue;
		}
		if (trackedSet && !trackedSet.has(entry.tracking_name)) {
			continue;
		}
		diffIndex += 1;
		const relativeFile = join(
			"diffs",
			`diff-${String(diffIndex).padStart(3, "0")}.json`,
		);
		const diffUrl = new URL(entry.diff, pageUrl).toString();
		const diffPayload = await fetchText(diffUrl);
		writeFileSync(
			join(cacheDirectory, relativeFile),
			`${diffPayload.trim()}\n`,
		);
		manifest.push({
			tracking_name: entry.tracking_name,
			diff: entry.diff,
			file: relativeFile,
			...(entry.old ? { old: entry.old } : {}),
			...(entry.new ? { new: entry.new } : {}),
			...(typeof entry.semantic === "boolean"
				? { semantic: entry.semantic }
				: {}),
			...(typeof entry.github_hash === "string"
				? { github_hash: entry.github_hash }
				: {}),
			...(typeof entry.review_id === "number"
				? { review_id: entry.review_id }
				: {}),
		});
	}

	if (manifest.length === 0) {
		throw new Error(
			`SemanticDiff archive for ${pullRequest.repository}#${pullRequest.number} did not contain any matching files.`,
		);
	}

	writeJson(join(cacheDirectory, "controller.json"), controller);
	writeJson(join(cacheDirectory, "manifest.json"), manifest);
}

async function writeCaseDirectory(
	root,
	pullRequest,
	pullFiles,
	pullDiff,
	selectedFiles,
) {
	const caseId = caseIdForPullRequest(
		pullRequest.repository,
		pullRequest.number,
	);
	const caseDirectory = join(root, caseId);
	mkdirSync(caseDirectory, { recursive: true });
	writeGitHubArchive(caseDirectory, pullRequest, pullFiles, pullDiff);

	const caseFiles = [];
	const operations = [];

	for (const [index, file] of selectedFiles.entries()) {
		const benchmarkStatus = benchmarkStatusFromGitHub(file.status);
		if (!benchmarkStatus) {
			throw new Error(`Unsupported GitHub file status: ${file.status}`);
		}
		const oldPath =
			benchmarkStatus === "added"
				? null
				: (file.previous_filename ?? file.filename);
		const newPath = benchmarkStatus === "deleted" ? null : file.filename;
		const relativeBefore = `file-${String(index + 1).padStart(2, "0")}-before${fileExtension(file)}`;
		const relativeAfter = `file-${String(index + 1).padStart(2, "0")}-after${fileExtension(file)}`;
		const beforeText = oldPath
			? fetchFileContents(pullRequest.repository, pullRequest.baseSha, oldPath)
			: "";
		const afterText = newPath
			? fetchFileContents(pullRequest.repository, pullRequest.headSha, newPath)
			: "";

		writeFileSync(join(caseDirectory, relativeBefore), beforeText);
		writeFileSync(join(caseDirectory, relativeAfter), afterText);

		const fileId = newPath ?? oldPath ?? `file-${index + 1}`;
		caseFiles.push({
			id: fileId,
			oldPath,
			newPath,
			status: benchmarkStatus,
			language: benchmarkLanguageForPath(newPath ?? oldPath ?? "") ?? "ts",
			beforePath: relativeBefore,
			afterPath: relativeAfter,
		});
		operations.push(...parsePatchOperations(fileId, file.patch));
	}

	const manifest = {
		id: caseId,
		language:
			selectedFiles
				.map(
					(file) =>
						benchmarkLanguageForPath(file.filename) ??
						benchmarkLanguageForPath(file.previous_filename ?? "") ??
						null,
				)
				.find((value) => value !== null) ?? "ts",
		kind: "real",
		description: `${pullRequest.repository}#${pullRequest.number}: ${pullRequest.title}`,
		source: {
			kind: "github-pr",
			repository: pullRequest.repository,
			prNumber: pullRequest.number,
			prUrl: pullRequest.url,
			baseSha: pullRequest.baseSha,
			headSha: pullRequest.headSha,
			selectedFiles: selectedFiles.map((file) => file.filename),
			collectedAt: new Date().toISOString(),
		},
		files: caseFiles,
		truth: {
			operations,
			moves: [],
			renames: [],
			entities: [],
			entityChanges: [],
			graphEdges: [],
			impact: [],
		},
		capabilities: {
			review: true,
			entity: false,
			graph: false,
		},
	};

	writeJson(join(caseDirectory, "case.json"), manifest);
	await writeSemanticDiffArchive(
		caseDirectory,
		pullRequest,
		selectedFiles.map((file) => file.filename),
	);
	return caseDirectory;
}

function reviewMetrics(result) {
	return result?.evaluation.review?.status === "scored"
		? result.evaluation.review
		: null;
}

function semadiffDominatesCase(caseReport) {
	const semadiff = caseReport.results.find(
		(result) => result.tool === "semadiff",
	);
	const semadiffReview = reviewMetrics(semadiff);
	if (!semadiffReview) {
		return false;
	}

	return caseReport.results.every((result) => {
		if (result.tool === "semadiff") {
			return true;
		}
		const review = reviewMetrics(result);
		if (!review) {
			return true;
		}
		return (
			semadiffReview.changedLinePrecision + EPSILON >=
				review.changedLinePrecision &&
			semadiffReview.changedLineRecall + EPSILON >= review.changedLineRecall &&
			(semadiffReview.moveRecall === null ||
				review.moveRecall === null ||
				semadiffReview.moveRecall + EPSILON >= review.moveRecall) &&
			(semadiffReview.renameRecall === null ||
				review.renameRecall === null ||
				semadiffReview.renameRecall + EPSILON >= review.renameRecall)
		);
	});
}

function buildSelectionSummary(report) {
	return {
		version: report.version,
		caseRoot: report.caseRoot,
		generatedAt: report.generatedAt,
		tools: report.tools.map((tool) => ({
			tool: tool.tool,
			toolVersion: tool.toolVersion,
			review: tool.summary.review,
			entity: tool.summary.entity,
			performance: tool.summary.performance,
		})),
		cases: report.cases.map((entry) => ({
			caseId: entry.caseId,
			description: entry.description,
			source: entry.source,
			review: Object.fromEntries(
				entry.results.map((result) => {
					const review = reviewMetrics(result);
					return [
						result.tool,
						review
							? {
									changedLinePrecision: review.changedLinePrecision,
									changedLineRecall: review.changedLineRecall,
									moveRecall: review.moveRecall,
									renameRecall: review.renameRecall,
								}
							: { status: result.evaluation.review.status },
					];
				}),
			),
		})),
	};
}

function loadHarnessModule() {
	const modulePath = pathToFileURL(
		resolve(process.cwd(), "packages/benchmark-harness/dist/index.js"),
	).href;
	return import(modulePath);
}

function loadComparableCases(harness, caseRoot) {
	const benchmarkCases = harness.loadBenchmarkCases(caseRoot);
	return benchmarkCases.filter((benchmarkCase) => {
		try {
			harness.runSemadiffCase(benchmarkCase);
			return true;
		} catch (error) {
			process.stderr.write(
				`Skipping ${benchmarkCase.id}: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			return false;
		}
	});
}

function compareCases(harness, benchmarkCases, caseRoot, tools) {
	return harness.runBenchmarkComparisonSuite(benchmarkCases, {
		caseRoot,
		tools,
	});
}

function clearDirectory(path) {
	rmSync(path, { recursive: true, force: true });
	mkdirSync(path, { recursive: true });
}

function copyWinningCases(
	candidateRoot,
	outputRoot,
	winners,
	minCases,
	maxPerRepo,
) {
	clearDirectory(outputRoot);
	const countsByRepository = new Map();
	const selected = [];
	for (const winner of winners) {
		const repository = winner.source?.repository ?? "unknown";
		const currentCount = countsByRepository.get(repository) ?? 0;
		if (currentCount >= maxPerRepo) {
			continue;
		}
		countsByRepository.set(repository, currentCount + 1);
		selected.push(winner);
		if (selected.length >= minCases) {
			break;
		}
	}
	if (selected.length < minCases) {
		throw new Error(
			`Only ${selected.length} winning cases fit the repository cap of ${maxPerRepo}.`,
		);
	}
	for (const winner of selected) {
		cpSync(
			join(candidateRoot, winner.caseId),
			join(outputRoot, winner.caseId),
			{
				recursive: true,
			},
		);
	}
	return selected;
}

async function hydrateWinnerSemanticDiffArchives(outputRoot, winners) {
	for (const winner of winners) {
		const source = winner.source;
		if (!(source?.repository && source.prNumber)) {
			continue;
		}
		process.stdout.write(
			`  Hydrating SemanticDiff archive for ${source.repository}#${source.prNumber}\n`,
		);
		await writeSemanticDiffArchive(
			join(outputRoot, winner.caseId),
			{
				repository: source.repository,
				number: source.prNumber,
			},
			null,
		);
	}
}

function loadRepositorySearchResults(repository, options) {
	try {
		return searchPullRequests(
			repository,
			options.perRepoLimit,
			options.searchTerms,
		);
	} catch (error) {
		process.stderr.write(
			`Skipping repository ${repository}: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return [];
	}
}

async function collectCandidateCase(
	candidateRoot,
	options,
	repository,
	searchResult,
) {
	const key = `${repository}#${searchResult.number}`;
	let pullRequest;
	let files;
	let pullDiff;
	try {
		pullRequest = fetchPullRequest(repository, searchResult.number);
		if (!pullRequest.merged_at) {
			return false;
		}
		if (shouldBypassGitHubPullFilesApi(pullRequest.changed_files)) {
			files = [];
			pullDiff = null;
		} else {
			files = fetchPullRequestFiles(repository, searchResult.number);
			pullDiff = fetchPullRequestDiff(repository, searchResult.number);
		}
		if (
			shouldBypassGitHubPullFilesApi(pullRequest.changed_files) ||
			isPullRequestFilesTruncated(pullRequest.changed_files, files) ||
			!pullDiff
		) {
			const gitPullDiff = fetchPullRequestGitDiff(
				repository,
				pullRequest.base.sha,
				pullRequest.head.sha,
			);
			pullDiff = gitPullDiff;
			if (
				shouldBypassGitHubPullFilesApi(pullRequest.changed_files) ||
				isPullRequestFilesTruncated(pullRequest.changed_files, files)
			) {
				files = buildPullFilesFromGitDiff(gitPullDiff);
			}
		}
	} catch (error) {
		process.stderr.write(`Skipping ${key}: ${String(error)}\n`);
		return false;
	}

	const selectedFiles = selectPullRequestFiles(files, options);
	if (selectedFiles.length === 0) {
		return false;
	}

	try {
		await writeCaseDirectory(
			candidateRoot,
			{
				...pullRequest,
				repository,
				number: pullRequest.number,
				title: pullRequest.title,
				url: pullRequest.html_url,
				baseSha: pullRequest.base.sha,
				headSha: pullRequest.head.sha,
			},
			files,
			pullDiff,
			selectedFiles,
		);
		process.stdout.write(`  Collected ${repository}#${pullRequest.number}\n`);
		return true;
	} catch (error) {
		process.stderr.write(`Skipping ${key}: ${String(error)}\n`);
		return false;
	}
}

async function collectCandidateCases(options) {
	const candidateRoot = mkdtempSync(join(tmpdir(), "semadiff-real-pr-corpus-"));
	const seen = new Set();
	let collected = 0;

	for (const repository of options.repositories) {
		if (collected >= options.candidateLimit) {
			break;
		}
		process.stdout.write(`Scanning ${repository}...\n`);
		for (const searchResult of loadRepositorySearchResults(
			repository,
			options,
		)) {
			if (collected >= options.candidateLimit) {
				break;
			}
			const key = `${repository}#${searchResult.number}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			if (
				await collectCandidateCase(
					candidateRoot,
					options,
					repository,
					searchResult,
				)
			) {
				collected += 1;
			}
		}
	}

	return candidateRoot;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(`${usage()}\n`);
		return;
	}

	const outputRoot = resolve(process.cwd(), options.outputRoot);
	const candidateRoot = await collectCandidateCases(options);
	const harness = await loadHarnessModule();

	try {
		const candidateCases = loadComparableCases(harness, candidateRoot);
		const candidateReport = compareCases(
			harness,
			candidateCases,
			candidateRoot,
			options.tools,
		);
		writeJson(
			resolve(process.cwd(), "tmp/real-pr-candidate-report.json"),
			buildSelectionSummary(candidateReport),
		);
		const winningCases = candidateReport.cases.filter((entry) =>
			semadiffDominatesCase(entry),
		);
		if (winningCases.length < options.minCases) {
			throw new Error(
				`Collected ${candidateReport.cases.length} candidate cases but only ${winningCases.length} matched or beat all comparison tools.`,
			);
		}

		const selectedWinners = copyWinningCases(
			candidateRoot,
			outputRoot,
			winningCases,
			options.minCases,
			options.maxPerRepo,
		);
		await hydrateWinnerSemanticDiffArchives(outputRoot, selectedWinners);
		const finalReport = compareCases(
			harness,
			harness.loadBenchmarkCases(outputRoot),
			outputRoot,
			options.tools,
		);
		const finalFailures = finalReport.cases.filter(
			(entry) => !semadiffDominatesCase(entry),
		);
		if (finalFailures.length > 0) {
			throw new Error(
				`Final corpus contains ${finalFailures.length} non-dominant cases: ${finalFailures
					.map((entry) => entry.caseId)
					.join(", ")}`,
			);
		}

		writeJson(
			join(outputRoot, "..", "selection-report.json"),
			buildSelectionSummary(finalReport),
		);
		process.stdout.write(
			`Selected ${selectedWinners.length} winning real PR cases in ${outputRoot}.\n`,
		);
	} finally {
		rmSync(candidateRoot, { recursive: true, force: true });
	}
}

const isMainModule =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exit(1);
	});
}
