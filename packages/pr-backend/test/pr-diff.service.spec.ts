import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.example.test";
const RAW_BASE = "https://raw.example.test";
const PR_URL = "https://github.com/owner/repo/pull/123";

const pullRequestPayload = {
	title: "Improve widgets",
	html_url: PR_URL,
	base: { sha: "base-sha" },
	head: { sha: "head-sha" },
	additions: 4,
	deletions: 2,
	changed_files: 1,
};

const modifiedFilePayload = [
	{
		filename: "src/widget.ts",
		status: "modified",
		additions: 2,
		deletions: 1,
		changes: 3,
		sha: "file-sha",
	},
];

const binaryFilePayload = [
	{
		filename: "assets/logo.bin",
		status: "modified",
		additions: 0,
		deletions: 0,
		changes: 0,
		sha: "binary-sha",
	},
];

const addedFilePayload = [
	{
		filename: "src/added.ts",
		status: "added",
		additions: 3,
		deletions: 0,
		changes: 3,
		sha: "added-sha",
	},
];

const oldWidgetText = ["export function widget() {", "  return 1;", "}"].join(
	"\n",
);

const newWidgetText = ["export function widget() {", "  return 2;", "}"].join(
	"\n",
);

const addedWidgetText = [
	"export function addedWidget() {",
	"  return 3;",
	"}",
].join("\n");

function jsonResponse(payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function textResponse(text: string) {
	return new Response(text, { status: 200 });
}

function createTempRoot() {
	return mkdtempSync(join(tmpdir(), "semadiff-pr-diff-"));
}

function loadBackendForTempRoot(tempRoot: string, token = "test-token") {
	process.env.SEMADIFF_CACHE_DIR = tempRoot;
	process.env.GITHUB_API_BASE = API_BASE;
	process.env.GITHUB_RAW_BASE = RAW_BASE;
	if (token) {
		process.env.GITHUB_TOKEN = token;
	} else {
		Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
	}
	vi.resetModules();
	return import("../src/index.ts");
}

function cacheFilePath(tempRoot: string) {
	return join(tempRoot, ".cache", "semadiff-github.json");
}

function writeCacheFile(
	tempRoot: string,
	entries: [string, { value: string; expiresAt: number }][],
) {
	const filePath = cacheFilePath(tempRoot);
	mkdirSync(join(tempRoot, ".cache"), { recursive: true });
	writeFileSync(filePath, JSON.stringify({ entries }), "utf8");
}

function createFetch(routes: Record<string, Response>) {
	return vi.fn((input: string | URL) => {
		const url = String(input);
		const response = routes[url];
		if (!response) {
			return Promise.resolve(
				new Response(`Unhandled URL: ${url}`, {
					status: 404,
					statusText: "Not Found",
				}),
			);
		}
		return Promise.resolve(response.clone());
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(process.env, "SEMADIFF_CACHE_DIR");
	Reflect.deleteProperty(process.env, "GITHUB_API_BASE");
	Reflect.deleteProperty(process.env, "GITHUB_RAW_BASE");
	Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
});

describe("PrDiffLive", () => {
	it("builds semantic summaries and reuses cached PR and file data", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
				textResponse(oldWidgetText),
			[`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
				textResponse(newWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const summary = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					const first = yield* service.getSummary(PR_URL);
					const second = yield* service.getSummary(PR_URL);
					expect(second).toEqual(first);
					return first;
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(summary.pr).toMatchObject({
				title: "Improve widgets",
				baseSha: "base-sha",
				headSha: "head-sha",
				changedFiles: 1,
			});
			expect(summary.files).toEqual([
				expect.objectContaining({
					filename: "src/widget.ts",
					status: "modified",
					operations: 1,
					reductionPercent: 50,
					language: "ts",
					moveCount: 0,
					renameCount: 0,
				}),
			]);
			expect(fetchMock).toHaveBeenCalledTimes(4);
			expect(existsSync(cacheFilePath(tempRoot))).toBe(true);
			expect(readFileSync(cacheFilePath(tempRoot), "utf8")).toContain(
				"v13:summary:owner/repo@base-sha..head-sha:src/widget.ts",
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("ignores malformed cached summaries and recomputes valid file summaries", async () => {
		const tempRoot = createTempRoot();
		writeCacheFile(tempRoot, [
			[
				"v13:summary:owner/repo@base-sha..head-sha:src/widget.ts",
				{
					value: JSON.stringify({ cached: "but-invalid" }),
					expiresAt: Date.now() + 60_000,
				},
			],
		]);
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
				textResponse(oldWidgetText),
			[`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
				textResponse(newWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const summary = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getSummary(PR_URL);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(summary.files).toEqual([
				expect.objectContaining({
					filename: "src/widget.ts",
					operations: 1,
					reductionPercent: 50,
				}),
			]);
			expect(fetchMock).toHaveBeenCalledTimes(4);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("returns empty diff documents for binary files", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(binaryFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/assets/logo.bin`]:
				textResponse("old\u0000data"),
			[`${RAW_BASE}/owner/repo/head-sha/assets/logo.bin`]:
				textResponse("new\u0000data"),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const payload = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getFileDiffDocument(
						PR_URL,
						"assets/logo.bin",
						0,
						"split",
						true,
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(payload.file).toEqual(
				expect.objectContaining({
					filename: "assets/logo.bin",
					binary: true,
					warnings: [
						"BINARY FILE — semantic diff is unavailable for this file.",
					],
				}),
			);
			expect(payload.diff).toEqual({
				version: "0.1.0",
				operations: [],
				moves: [],
				renames: [],
			});
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("returns empty file-diff html for binary files", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(binaryFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/assets/logo.bin`]:
				textResponse("old\u0000data"),
			[`${RAW_BASE}/owner/repo/head-sha/assets/logo.bin`]:
				textResponse("new\u0000data"),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const payload = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getFileDiff(
						PR_URL,
						"assets/logo.bin",
						0,
						"split",
						"semantic",
						false,
						true,
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(payload).toEqual({
				file: expect.objectContaining({
					filename: "assets/logo.bin",
					binary: true,
				}),
				semanticHtml: "",
				linesHtml: "",
			});
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("surfaces PrFileNotFound when a requested file is missing from the pull request", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const error = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* Effect.flip(
						service.getFileDiff(
							PR_URL,
							"src/missing.ts",
							0,
							"split",
							"semantic",
							false,
							true,
						),
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(error).toEqual(
				expect.objectContaining({
					_tag: "PrFileNotFound",
					filename: "src/missing.ts",
				}),
			);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("falls back to warning-only file summaries when semantic fetching fails", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
			[`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
				textResponse(newWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const summary = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getSummary(PR_URL);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(summary.files).toEqual([
				expect.objectContaining({
					filename: "src/widget.ts",
					status: "modified",
					warnings: [
						expect.stringContaining(
							"SEMANTIC SUMMARY FAILED (GitHubRequestError)",
						),
					],
				}),
			]);
			expect(summary.files[0]?.operations).toBeUndefined();
			expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("computes added-file summaries without fetching base content", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]: jsonResponse({
				...pullRequestPayload,
				additions: 3,
				deletions: 0,
			}),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(addedFilePayload),
			[`${RAW_BASE}/owner/repo/head-sha/src/added.ts`]:
				textResponse(addedWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const summary = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getSummary(PR_URL);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(summary.files).toEqual([
				expect.objectContaining({
					filename: "src/added.ts",
					status: "added",
					operations: 1,
					language: "ts",
				}),
			]);
			expect(fetchMock).toHaveBeenCalledTimes(3);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("ignores malformed cached file-diff payloads and rebuilds html output", async () => {
		const tempRoot = createTempRoot();
		writeCacheFile(tempRoot, [
			[
				"v13:diff:owner/repo@base-sha..head-sha:src/widget.ts:ctx=0:layout=split:mode=semantic:comments=show:moves=on",
				{
					value: JSON.stringify({ invalid: true }),
					expiresAt: Date.now() + 60_000,
				},
			],
		]);
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
				textResponse(oldWidgetText),
			[`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
				textResponse(newWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const payload = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getFileDiff(
						PR_URL,
						"src/widget.ts",
						0,
						"split",
						"semantic",
						false,
						true,
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(payload.file).toEqual(
				expect.objectContaining({
					filename: "src/widget.ts",
					reductionPercent: 50,
				}),
			);
			expect(payload.semanticHtml).toContain("widget");
			expect(payload.linesHtml).toContain('class="sd-inline-add"');
			expect(fetchMock).toHaveBeenCalledTimes(4);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("returns cached file-diff payloads without refetching raw file contents", async () => {
		const tempRoot = createTempRoot();
		writeCacheFile(tempRoot, [
			[
				"v13:diff:owner/repo@base-sha..head-sha:src/widget.ts:ctx=0:layout=split:mode=semantic:comments=show:moves=on",
				{
					value: JSON.stringify({
						file: {
							filename: "src/widget.ts",
							status: "modified",
							additions: 2,
							deletions: 1,
							changes: 3,
							sha: "file-sha",
						},
						semanticHtml: "<section>cached semantic</section>",
						linesHtml: "<section>cached lines</section>",
					}),
					expiresAt: Date.now() + 60_000,
				},
			],
		]);
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const payload = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getFileDiff(
						PR_URL,
						"src/widget.ts",
						0,
						"split",
						"semantic",
						false,
						true,
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(payload.semanticHtml).toContain("cached semantic");
			expect(payload.linesHtml).toContain("cached lines");
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("reuses cached raw file text across distinct diff render variants", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
			[`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
				textResponse(oldWidgetText),
			[`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
				textResponse(newWidgetText),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const [semanticPayload, rawPayload] = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* Effect.all([
						service.getFileDiff(
							PR_URL,
							"src/widget.ts",
							0,
							"split",
							"semantic",
							false,
							true,
						),
						service.getFileDiff(
							PR_URL,
							"src/widget.ts",
							1,
							"unified",
							"raw",
							true,
							false,
						),
					]);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(semanticPayload.semanticHtml).toContain("widget");
			expect(rawPayload.linesHtml).toContain('class="sd-inline-add"');
			expect(fetchMock).toHaveBeenCalledTimes(4);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("returns cached diff documents without rebuilding semantic documents", async () => {
		const tempRoot = createTempRoot();
		writeCacheFile(tempRoot, [
			[
				"v13:diff:owner/repo@base-sha..head-sha:src/widget.ts:ctx=0:layout=split:mode=semantic:comments=show:moves=on:doc",
				{
					value: JSON.stringify({
						file: {
							filename: "src/widget.ts",
							status: "modified",
							additions: 2,
							deletions: 1,
							changes: 3,
							sha: "file-sha",
						},
						diff: {
							version: "0.1.0",
							operations: [],
							moves: [],
							renames: [],
						},
					}),
					expiresAt: Date.now() + 60_000,
				},
			],
		]);
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const payload = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* service.getFileDiffDocument(
						PR_URL,
						"src/widget.ts",
						0,
						"split",
						true,
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(payload.diff).toEqual({
				version: "0.1.0",
				operations: [],
				moves: [],
				renames: [],
			});
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("surfaces PrFileNotFound for missing diff documents", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]:
				jsonResponse(pullRequestPayload),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				jsonResponse(modifiedFilePayload),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const backend = await loadBackendForTempRoot(tempRoot);
			const error = await Effect.runPromise(
				Effect.gen(function* () {
					const service = yield* backend.PrDiffService;
					return yield* Effect.flip(
						service.getFileDiffDocument(
							PR_URL,
							"src/missing.ts",
							0,
							"split",
							true,
						),
					);
				}).pipe(Effect.provide(backend.PrDiffLive)),
			);

			expect(error).toEqual(
				expect.objectContaining({
					_tag: "PrFileNotFound",
					filename: "src/missing.ts",
				}),
			);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
