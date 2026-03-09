import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect, Layer, Option } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const API_BASE = "https://api.example.test";
const RAW_BASE = "https://raw.example.test";
const pullRef = { owner: "owner", repo: "repo", number: 123 };

function createTempRoot() {
	return mkdtempSync(join(tmpdir(), "semadiff-github-"));
}

function cacheFilePath(tempRoot: string) {
	return join(tempRoot, ".cache", "semadiff-github.json");
}

function writeCacheFile(
	tempRoot: string,
	entries: [string, { value: string; expiresAt: number }][],
) {
	mkdirSync(join(tempRoot, ".cache"), { recursive: true });
	writeFileSync(cacheFilePath(tempRoot), JSON.stringify({ entries }), "utf8");
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

function listFile(index: number) {
	return {
		filename: `src/file-${index}.ts`,
		status: "modified",
		additions: 1,
		deletions: 1,
		changes: 2,
		sha: `sha-${index}`,
	};
}

function loadGitHubModule(tempRoot: string, token = "test-token") {
	process.env.SEMADIFF_CACHE_DIR = tempRoot;
	process.env.GITHUB_API_BASE = API_BASE;
	process.env.GITHUB_RAW_BASE = RAW_BASE;
	process.env.GITHUB_TOKEN = token;
	vi.resetModules();
	return import("../src/github.ts");
}

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(process.env, "SEMADIFF_CACHE_DIR");
	Reflect.deleteProperty(process.env, "GITHUB_API_BASE");
	Reflect.deleteProperty(process.env, "GITHUB_RAW_BASE");
	Reflect.deleteProperty(process.env, "GITHUB_TOKEN");
});

describe("GitHub services", () => {
	it("persists file cache entries across layer instances", async () => {
		const tempRoot = createTempRoot();
		try {
			const github = await loadGitHubModule(tempRoot);
			await Effect.runPromise(
				Effect.gen(function* () {
					const cache = yield* github.GitHubCache;
					yield* cache.set("persisted", "value", 60_000);
					const hit = yield* cache.get("persisted");
					expect(Option.isSome(hit) ? hit.value : null).toBe("value");
				}).pipe(Effect.provide(github.GitHubCacheLive)),
			);

			const githubReloaded = await loadGitHubModule(tempRoot);
			await Effect.runPromise(
				Effect.gen(function* () {
					const cache = yield* githubReloaded.GitHubCache;
					const hit = yield* cache.get("persisted");
					expect(Option.isSome(hit) ? hit.value : null).toBe("value");
				}).pipe(Effect.provide(githubReloaded.GitHubCacheLive)),
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("drops expired cache entries loaded from disk", async () => {
		const tempRoot = createTempRoot();
		writeCacheFile(tempRoot, [
			[
				"stale",
				{
					value: "expired",
					expiresAt: Date.now() - 1,
				},
			],
		]);

		try {
			const github = await loadGitHubModule(tempRoot);
			await Effect.runPromise(
				Effect.gen(function* () {
					const cache = yield* github.GitHubCache;
					const hit = yield* cache.get("stale");
					expect(Option.isNone(hit)).toBe(true);
				}).pipe(Effect.provide(github.GitHubCacheLive)),
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("falls back from malformed cached JSON and fetches a valid pull request", async () => {
		const tempRoot = createTempRoot();
		const url = `${API_BASE}/repos/owner/repo/pulls/123`;
		writeCacheFile(tempRoot, [
			[
				`json:${url}`,
				{
					value: "{not-json",
					expiresAt: Date.now() + 60_000,
				},
			],
		]);
		const fetchMock = createFetch({
			[url]: new Response(
				JSON.stringify({
					title: "PR",
					html_url: "https://github.com/owner/repo/pull/123",
					base: { sha: "base" },
					head: { sha: "head" },
					additions: 2,
					deletions: 1,
					changed_files: 1,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const github = await loadGitHubModule(tempRoot);
			const layer = github.GitHubClientLive.pipe(
				Layer.provide(github.GitHubConfig.layer),
				Layer.provide(github.GitHubCacheLive),
			);
			const pullRequest = await Effect.runPromise(
				Effect.gen(function* () {
					const client = yield* github.GitHubClient;
					return yield* client.getPullRequest(pullRef);
				}).pipe(Effect.provide(layer)),
			);

			expect(pullRequest.title).toBe("PR");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("paginates pull request files until the final short page", async () => {
		const tempRoot = createTempRoot();
		const pageOne = Array.from({ length: 100 }, (_, index) =>
			listFile(index + 1),
		);
		const pageTwo = [listFile(101)];
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
				new Response(JSON.stringify(pageOne), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			[`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=2`]:
				new Response(JSON.stringify(pageTwo), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const github = await loadGitHubModule(tempRoot);
			const layer = github.GitHubClientLive.pipe(
				Layer.provide(github.GitHubConfig.layer),
				Layer.provide(github.GitHubCacheLive),
			);
			const files = await Effect.runPromise(
				Effect.gen(function* () {
					const client = yield* github.GitHubClient;
					return yield* client.listPullRequestFiles(pullRef);
				}).pipe(Effect.provide(layer)),
			);

			expect(files).toHaveLength(101);
			expect(files.at(-1)?.filename).toBe("src/file-101.ts");
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("encodes raw file paths and reuses cached file text", async () => {
		const tempRoot = createTempRoot();
		const encodedPath = `${RAW_BASE}/owner/repo/head-sha/src%20space/widget%23file.ts`;
		const fetchMock = createFetch({
			[encodedPath]: new Response("export const value = 1;", { status: 200 }),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const github = await loadGitHubModule(tempRoot);
			const layer = github.GitHubClientLive.pipe(
				Layer.provide(github.GitHubConfig.layer),
				Layer.provide(github.GitHubCacheLive),
			);
			const fileText = await Effect.runPromise(
				Effect.gen(function* () {
					const client = yield* github.GitHubClient;
					const first = yield* client.getFileText({
						owner: "owner",
						repo: "repo",
						sha: "head-sha",
						path: "src space/widget#file.ts",
					});
					const second = yield* client.getFileText({
						owner: "owner",
						repo: "repo",
						sha: "head-sha",
						path: "src space/widget#file.ts",
					});
					expect(second).toBe(first);
					return first;
				}).pipe(Effect.provide(layer)),
			);

			expect(fileText).toBe("export const value = 1;");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("surfaces decode errors for malformed pull request payloads", async () => {
		const tempRoot = createTempRoot();
		const fetchMock = createFetch({
			[`${API_BASE}/repos/owner/repo/pulls/123`]: new Response(
				JSON.stringify({ title: "Missing fields" }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		});
		vi.stubGlobal("fetch", fetchMock);

		try {
			const github = await loadGitHubModule(tempRoot);
			const layer = github.GitHubClientLive.pipe(
				Layer.provide(github.GitHubConfig.layer),
				Layer.provide(github.GitHubCacheLive),
			);
			const error = await Effect.runPromise(
				Effect.gen(function* () {
					const client = yield* github.GitHubClient;
					return yield* Effect.flip(client.getPullRequest(pullRef));
				}).pipe(Effect.provide(layer)),
			);

			expect(error).toEqual(
				expect.objectContaining({
					_tag: "GitHubDecodeError",
					url: `${API_BASE}/repos/owner/repo/pulls/123`,
				}),
			);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
