import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadBenchmarkCase, loadBenchmarkCases } from "../src/index.js";

const MISSING_FILE_ID_RE = /must declare fileId/;
const UNKNOWN_FILE_ID_RE = /unknown fileId/;
const MISSING_LANGUAGE_RE = /language to be present/;
const INVALID_KIND_RE = /supported benchmark kind/;
const NON_EMPTY_ARRAY_RE = /non-empty array/;
const NO_CASES_FOUND_RE = /No benchmark cases found/;
const NOT_DIRECTORY_RE = /not a directory/;
const FILE_STATUS_RE = /allowed file status/;
const FILE_PATH_RE = /oldPath, newPath, or both/;
const BEFORE_CONTENT_RE = /define before or beforePath/;
const AFTER_CONTENT_RE = /define after or afterPath/;
const SOURCE_KIND_RE = /kind to be github-pr/;
const ENTITY_SIDE_RE = /side to be old or new/;
const CHANGE_KINDS_RE = /changeKinds to be a non-empty array/;
const ENTITY_ENDPOINT_RE = /define before, after, or both/;
const OPTIONAL_STRING_RE = /non-empty string when provided/;
const NON_EMPTY_STRING_RE = /non-empty string/;
const BOOLEAN_RE = /to be a boolean/;
const INTEGER_RE = /to be an integer/;
const LINE_RANGE_RE = /positive integer|>= startLine/;
const MOVE_RANGE_RE = /include both ranges/;
const ENTITY_KIND_RE =
	/to be one of function, class, method, interface, typeAlias, variable/;
const ENTITY_CHANGE_KIND_RE =
	/to be one of added, deleted, modified, moved, renamed/;
const SELECTED_FILES_ARRAY_RE = /selectedFiles to be an array/;
const SELECTED_FILES_ENTRY_RE = /selectedFiles\[0\] to be a non-empty string/;
const RAW_CASE_OBJECT_RE = /contain an object/;
const POSITIVE_INTEGER_RE = /occurrences to be a positive integer/;
const tempDirectories: string[] = [];

function createTempDirectory(prefix: string) {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	tempDirectories.push(directory);
	return directory;
}

function writeCaseFixture(
	root: string,
	caseId: string,
	caseJson: Record<string, unknown>,
	files: Record<string, string> = {},
) {
	const caseDirectory = join(root, caseId);
	mkdirSync(caseDirectory, { recursive: true });
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = join(caseDirectory, relativePath);
		mkdirSync(dirname(absolutePath), { recursive: true });
		writeFileSync(absolutePath, content, "utf8");
	}
	const caseFilePath = join(caseDirectory, "case.json");
	writeFileSync(caseFilePath, JSON.stringify(caseJson, null, 2), "utf8");
	return caseFilePath;
}

function makeCaseJson(overrides: Record<string, unknown> = {}) {
	return {
		id: "fixture",
		language: "ts",
		kind: "micro",
		description: "Fixture benchmark case",
		source: {
			kind: "github-pr",
			repository: "org/repo",
			prNumber: 1,
			prUrl: "https://github.com/org/repo/pull/1",
			baseSha: "base",
			headSha: "head",
			selectedFiles: ["src/value.ts"],
			collectedAt: "2024-01-01T00:00:00.000Z",
			searchTerm: "value",
		},
		files: [
			{
				id: "src/value.ts",
				oldPath: "src/value.ts",
				newPath: "src/value.ts",
				status: "modified",
				beforePath: "before.ts",
				afterPath: "after.ts",
			},
		],
		truth: {
			operations: [
				{
					type: "update",
					oldRange: { startLine: 1, endLine: 1 },
					newRange: { startLine: 1, endLine: 1 },
				},
			],
			moves: [],
			renames: [],
			entities: [],
			entityChanges: [],
		},
		capabilities: {
			review: true,
			entity: false,
			graph: false,
		},
		...overrides,
	};
}

afterEach(() => {
	while (tempDirectories.length > 0) {
		const directory = tempDirectories.pop();
		if (directory) {
			rmSync(directory, { recursive: true, force: true });
		}
	}
});

describe("benchmark case loading", () => {
	test("loads file-backed case content and github metadata", () => {
		const root = createTempDirectory("benchmark-cases-");
		const caseFilePath = writeCaseFixture(root, "fixture", makeCaseJson(), {
			"before.ts": "export const value = 1;\n",
			"after.ts": "export const value = 2;\n",
		});

		const benchmarkCase = loadBenchmarkCase(caseFilePath);

		expect(benchmarkCase.source).toEqual({
			kind: "github-pr",
			repository: "org/repo",
			prNumber: 1,
			prUrl: "https://github.com/org/repo/pull/1",
			baseSha: "base",
			headSha: "head",
			selectedFiles: ["src/value.ts"],
			collectedAt: "2024-01-01T00:00:00.000Z",
			searchTerm: "value",
		});
		expect(benchmarkCase.files).toEqual([
			expect.objectContaining({
				id: "src/value.ts",
				before: "export const value = 1;\n",
				after: "export const value = 2;\n",
			}),
		]);
		expect(benchmarkCase.truth.operations[0]).toEqual({
			type: "update",
			oldRange: { startLine: 1, endLine: 1 },
			newRange: { startLine: 1, endLine: 1 },
		});
	});

	test("requires explicit file ids for multi-file truth references", () => {
		const root = createTempDirectory("benchmark-cases-");
		const caseFilePath = writeCaseFixture(
			root,
			"missing-file-id",
			makeCaseJson({
				id: "missing-file-id",
				files: [
					{
						id: "src/a.ts",
						oldPath: "src/a.ts",
						newPath: "src/a.ts",
						status: "modified",
						before: "export const a = 1;\n",
						after: "export const a = 2;\n",
					},
					{
						id: "src/b.ts",
						oldPath: "src/b.ts",
						newPath: "src/b.ts",
						status: "modified",
						before: "export const b = 1;\n",
						after: "export const b = 2;\n",
					},
				],
			}),
		);

		expect(() => loadBenchmarkCase(caseFilePath)).toThrow(MISSING_FILE_ID_RE);
	});

	test("rejects truth references to unknown file ids", () => {
		const root = createTempDirectory("benchmark-cases-");
		const caseFilePath = writeCaseFixture(
			root,
			"unknown-file-id",
			makeCaseJson({
				id: "unknown-file-id",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [
						{
							type: "update",
							fileId: "src/missing.ts",
							oldRange: { startLine: 1, endLine: 1 },
							newRange: { startLine: 1, endLine: 1 },
						},
					],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [],
				},
			}),
		);

		expect(() => loadBenchmarkCase(caseFilePath)).toThrow(UNKNOWN_FILE_ID_RE);
	});

	test("rejects malformed case metadata before loading files", () => {
		const root = createTempDirectory("benchmark-cases-");
		const missingLanguagePath = writeCaseFixture(
			root,
			"missing-language",
			makeCaseJson({
				id: "missing-language",
				language: undefined,
			}),
		);
		const invalidKindPath = writeCaseFixture(
			root,
			"invalid-kind",
			makeCaseJson({
				id: "invalid-kind",
				kind: "unsupported",
			}),
		);
		const emptyFilesPath = writeCaseFixture(
			root,
			"empty-files",
			makeCaseJson({
				id: "empty-files",
				files: [],
			}),
		);

		expect(() => loadBenchmarkCase(missingLanguagePath)).toThrow(
			MISSING_LANGUAGE_RE,
		);
		expect(() => loadBenchmarkCase(invalidKindPath)).toThrow(INVALID_KIND_RE);
		expect(() => loadBenchmarkCase(emptyFilesPath)).toThrow(NON_EMPTY_ARRAY_RE);
	});

	test("supports added and deleted file fixtures while rejecting invalid file entries", () => {
		const root = createTempDirectory("benchmark-cases-");
		const validCasePath = writeCaseFixture(
			root,
			"file-statuses",
			makeCaseJson({
				id: "file-statuses",
				files: [
					{
						id: "src/added.ts",
						oldPath: null,
						newPath: "src/added.ts",
						status: "added",
						after: "export const added = true;\n",
					},
					{
						id: "src/deleted.ts",
						oldPath: "src/deleted.ts",
						newPath: null,
						status: "deleted",
						before: "export const removed = true;\n",
					},
					{
						id: "src/renamed.ts",
						oldPath: "src/old-name.ts",
						newPath: "src/renamed.ts",
						status: "renamed",
						before: "export const renamed = true;\n",
						after: "export const renamed = true;\n",
					},
				],
				truth: {
					operations: [
						{
							type: "insert",
							fileId: "src/added.ts",
							newRange: { startLine: 1, endLine: 1 },
						},
						{
							type: "delete",
							fileId: "src/deleted.ts",
							oldRange: { startLine: 1, endLine: 1 },
						},
						{
							type: "move",
							fileId: "src/renamed.ts",
							oldRange: { startLine: 1, endLine: 1 },
							newRange: { startLine: 1, endLine: 1 },
						},
					],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [],
				},
			}),
		);
		const invalidStatusPath = writeCaseFixture(
			root,
			"invalid-status",
			makeCaseJson({
				id: "invalid-status",
				files: [
					{
						id: "src/file.ts",
						oldPath: "src/file.ts",
						newPath: "src/file.ts",
						status: "copied",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
			}),
		);
		const missingPathPath = writeCaseFixture(
			root,
			"missing-paths",
			makeCaseJson({
				id: "missing-paths",
				files: [
					{
						id: "src/file.ts",
						oldPath: null,
						newPath: null,
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
			}),
		);
		const missingBeforePath = writeCaseFixture(
			root,
			"missing-before",
			makeCaseJson({
				id: "missing-before",
				files: [
					{
						id: "src/file.ts",
						oldPath: "src/file.ts",
						newPath: "src/file.ts",
						status: "modified",
						after: "export const value = 2;\n",
					},
				],
			}),
		);
		const missingAfterPath = writeCaseFixture(
			root,
			"missing-after",
			makeCaseJson({
				id: "missing-after",
				files: [
					{
						id: "src/file.ts",
						oldPath: "src/file.ts",
						newPath: "src/file.ts",
						status: "modified",
						before: "export const value = 1;\n",
					},
				],
			}),
		);

		expect(loadBenchmarkCase(validCasePath).files).toEqual([
			expect.objectContaining({
				id: "src/added.ts",
				before: "",
				after: "export const added = true;\n",
			}),
			expect.objectContaining({
				id: "src/deleted.ts",
				before: "export const removed = true;\n",
				after: "",
			}),
			expect.objectContaining({
				id: "src/renamed.ts",
				oldPath: "src/old-name.ts",
				newPath: "src/renamed.ts",
			}),
		]);
		expect(() => loadBenchmarkCase(invalidStatusPath)).toThrow(FILE_STATUS_RE);
		expect(() => loadBenchmarkCase(missingPathPath)).toThrow(FILE_PATH_RE);
		expect(() => loadBenchmarkCase(missingBeforePath)).toThrow(
			BEFORE_CONTENT_RE,
		);
		expect(() => loadBenchmarkCase(missingAfterPath)).toThrow(AFTER_CONTENT_RE);
	});

	test("applies defaults for optional source, truth, and file metadata", () => {
		const root = createTempDirectory("benchmark-cases-");
		const caseFilePath = writeCaseFixture(
			root,
			"defaulted-metadata",
			makeCaseJson({
				id: "defaulted-metadata",
				source: {
					kind: "github-pr",
					repository: "org/repo",
					prNumber: 2,
					prUrl: "https://github.com/org/repo/pull/2",
					baseSha: "base-2",
					headSha: "head-2",
				},
				files: [
					{
						oldPath: "src/deleted.ts",
						newPath: null,
						status: "deleted",
						before: "export const removed = true;\n",
					},
				],
				truth: {
					operations: [
						{
							type: "delete",
							oldRange: { startLine: 1, endLine: 1 },
						},
					],
				},
			}),
		);

		expect(loadBenchmarkCase(caseFilePath)).toEqual(
			expect.objectContaining({
				source: {
					kind: "github-pr",
					repository: "org/repo",
					prNumber: 2,
					prUrl: "https://github.com/org/repo/pull/2",
					baseSha: "base-2",
					headSha: "head-2",
					selectedFiles: [],
				},
				files: [
					expect.objectContaining({
						id: "src/deleted.ts",
						oldPath: "src/deleted.ts",
						newPath: null,
						language: "ts",
						before: "export const removed = true;\n",
						after: "",
					}),
				],
				truth: {
					operations: [
						{
							type: "delete",
							oldRange: { startLine: 1, endLine: 1 },
						},
					],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [],
					graphEdges: [],
					impact: [],
				},
			}),
		);
	});

	test("validates source metadata and entity truth payloads", () => {
		const root = createTempDirectory("benchmark-cases-");
		const invalidSourcePath = writeCaseFixture(
			root,
			"invalid-source",
			makeCaseJson({
				id: "invalid-source",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				source: {
					kind: "local",
					repository: "org/repo",
					prNumber: 1,
					prUrl: "https://github.com/org/repo/pull/1",
					baseSha: "base",
					headSha: "head",
				},
			}),
		);
		const invalidEntitySidePath = writeCaseFixture(
			root,
			"invalid-entity-side",
			makeCaseJson({
				id: "invalid-entity-side",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [],
					entities: [
						{
							side: "middle",
							kind: "function",
							name: "value",
							fileId: "src/value.ts",
							range: { startLine: 1, endLine: 1 },
						},
					],
					entityChanges: [],
				},
			}),
		);
		const missingChangeKindsPath = writeCaseFixture(
			root,
			"missing-change-kinds",
			makeCaseJson({
				id: "missing-change-kinds",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [
						{
							kind: "function",
							before: {
								kind: "function",
								name: "value",
								fileId: "src/value.ts",
								range: { startLine: 1, endLine: 1 },
							},
							changeKinds: [],
						},
					],
				},
			}),
		);
		const missingEntityEndpointPath = writeCaseFixture(
			root,
			"missing-entity-endpoint",
			makeCaseJson({
				id: "missing-entity-endpoint",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [
						{
							kind: "function",
							changeKinds: ["modified"],
						},
					],
				},
			}),
		);

		expect(() => loadBenchmarkCase(invalidSourcePath)).toThrow(SOURCE_KIND_RE);
		expect(() => loadBenchmarkCase(invalidEntitySidePath)).toThrow(
			ENTITY_SIDE_RE,
		);
		expect(() => loadBenchmarkCase(missingChangeKindsPath)).toThrow(
			CHANGE_KINDS_RE,
		);
		expect(() => loadBenchmarkCase(missingEntityEndpointPath)).toThrow(
			ENTITY_ENDPOINT_RE,
		);
	});

	test("rejects malformed optional source metadata and capabilities", () => {
		const root = createTempDirectory("benchmark-cases-");
		const invalidSelectedFilesTypePath = writeCaseFixture(
			root,
			"invalid-selected-files-type",
			makeCaseJson({
				id: "invalid-selected-files-type",
				source: {
					...makeCaseJson().source,
					selectedFiles: "src/value.ts",
				},
			}),
		);
		const invalidSelectedFilesEntryPath = writeCaseFixture(
			root,
			"invalid-selected-files-entry",
			makeCaseJson({
				id: "invalid-selected-files-entry",
				source: {
					...makeCaseJson().source,
					selectedFiles: [1],
				},
			}),
		);
		const invalidSearchTermPath = writeCaseFixture(
			root,
			"invalid-search-term",
			makeCaseJson({
				id: "invalid-search-term",
				source: {
					...makeCaseJson().source,
					searchTerm: "",
				},
			}),
		);
		const invalidPrNumberPath = writeCaseFixture(
			root,
			"invalid-pr-number",
			makeCaseJson({
				id: "invalid-pr-number",
				source: {
					...makeCaseJson().source,
					prNumber: "1",
				},
			}),
		);
		const invalidCapabilitiesPath = writeCaseFixture(
			root,
			"invalid-capabilities",
			makeCaseJson({
				id: "invalid-capabilities",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				capabilities: {
					review: "yes",
					entity: false,
					graph: false,
				},
			}),
		);

		expect(() => loadBenchmarkCase(invalidSelectedFilesTypePath)).toThrow(
			SELECTED_FILES_ARRAY_RE,
		);
		expect(() => loadBenchmarkCase(invalidSelectedFilesEntryPath)).toThrow(
			SELECTED_FILES_ENTRY_RE,
		);
		expect(() => loadBenchmarkCase(invalidSearchTermPath)).toThrow(
			OPTIONAL_STRING_RE,
		);
		expect(() => loadBenchmarkCase(invalidPrNumberPath)).toThrow(INTEGER_RE);
		expect(() => loadBenchmarkCase(invalidCapabilitiesPath)).toThrow(
			BOOLEAN_RE,
		);
	});

	test("rejects malformed ranges, rename truth, entity truth, and raw case files", () => {
		const root = createTempDirectory("benchmark-cases-");
		const invalidOperationRangePath = writeCaseFixture(
			root,
			"invalid-operation-range",
			makeCaseJson({
				id: "invalid-operation-range",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [
						{
							type: "update",
							oldRange: { startLine: 2, endLine: 1 },
							newRange: { startLine: 1, endLine: 1 },
						},
					],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [],
				},
			}),
		);
		const invalidMovePath = writeCaseFixture(
			root,
			"invalid-move",
			makeCaseJson({
				id: "invalid-move",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [{ oldRange: { startLine: 1, endLine: 1 } }],
					renames: [],
					entities: [],
					entityChanges: [],
				},
			}),
		);
		const invalidRenamePath = writeCaseFixture(
			root,
			"invalid-rename",
			makeCaseJson({
				id: "invalid-rename",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [{ from: "old", to: "new", occurrences: 0 }],
					entities: [],
					entityChanges: [],
				},
			}),
		);
		const invalidEntityKindPath = writeCaseFixture(
			root,
			"invalid-entity-kind",
			makeCaseJson({
				id: "invalid-entity-kind",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [],
					entities: [
						{
							side: "new",
							kind: "module",
							name: "value",
							range: { startLine: 1, endLine: 1 },
						},
					],
					entityChanges: [],
				},
			}),
		);
		const invalidEntityChangeKindPath = writeCaseFixture(
			root,
			"invalid-entity-change-kind",
			makeCaseJson({
				id: "invalid-entity-change-kind",
				files: [
					{
						id: "src/value.ts",
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
				truth: {
					operations: [],
					moves: [],
					renames: [],
					entities: [],
					entityChanges: [
						{
							kind: "function",
							before: {
								kind: "function",
								name: "value",
								range: { startLine: 1, endLine: 1 },
							},
							changeKinds: ["copied"],
						},
					],
				},
			}),
		);
		const invalidFileLanguagePath = writeCaseFixture(
			root,
			"invalid-file-language",
			makeCaseJson({
				id: "invalid-file-language",
				files: [
					{
						oldPath: "src/value.ts",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
						language: "",
					},
				],
			}),
		);
		const invalidNullablePath = writeCaseFixture(
			root,
			"invalid-nullable-path",
			makeCaseJson({
				id: "invalid-nullable-path",
				files: [
					{
						oldPath: "",
						newPath: "src/value.ts",
						status: "modified",
						before: "export const value = 1;\n",
						after: "export const value = 2;\n",
					},
				],
			}),
		);
		const rawCasePath = writeCaseFixture(
			root,
			"raw-array",
			[] as unknown as Record<string, unknown>,
		);

		expect(() => loadBenchmarkCase(invalidOperationRangePath)).toThrow(
			LINE_RANGE_RE,
		);
		expect(() => loadBenchmarkCase(invalidMovePath)).toThrow(MOVE_RANGE_RE);
		expect(() => loadBenchmarkCase(invalidRenamePath)).toThrow(
			POSITIVE_INTEGER_RE,
		);
		expect(() => loadBenchmarkCase(invalidEntityKindPath)).toThrow(
			ENTITY_KIND_RE,
		);
		expect(() => loadBenchmarkCase(invalidEntityChangeKindPath)).toThrow(
			ENTITY_CHANGE_KIND_RE,
		);
		expect(() => loadBenchmarkCase(invalidFileLanguagePath)).toThrow(
			NON_EMPTY_STRING_RE,
		);
		expect(() => loadBenchmarkCase(invalidNullablePath)).toThrow(
			NON_EMPTY_STRING_RE,
		);
		expect(() => loadBenchmarkCase(rawCasePath)).toThrow(RAW_CASE_OBJECT_RE);
	});

	test("rejects empty or non-directory benchmark roots", () => {
		const emptyRoot = createTempDirectory("benchmark-empty-root-");
		const fileRootParent = createTempDirectory("benchmark-file-root-");
		const filePath = join(fileRootParent, "not-a-directory.json");
		writeFileSync(filePath, "{}", "utf8");

		expect(() => loadBenchmarkCases(emptyRoot)).toThrow(NO_CASES_FOUND_RE);
		expect(() => loadBenchmarkCases(filePath)).toThrow(NOT_DIRECTORY_RE);
	});
});
