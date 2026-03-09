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
  body: "Adds review guidance plumbing.",
  html_url: PR_URL,
  user: { login: "satan" },
  labels: [{ name: "review-guide" }, { name: "backend" }],
  base: { sha: "base-sha", ref: "main" },
  head: { sha: "head-sha", ref: "feat/review-guide" },
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

const commitPayload = [
  {
    sha: "commit-1",
    commit: {
      message: "feat: add review guide\n\nwith more detail",
    },
  },
];

const oldWidgetText = ["export function widget() {", "  return 1;", "}"].join(
  "\n"
);

const newWidgetText = ["export function widget() {", "  return 2;", "}"].join(
  "\n"
);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text: string) {
  return new Response(text, { status: 200 });
}

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), "semadiff-pr-review-"));
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
  entries: [string, { value: string; expiresAt: number }][]
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
        })
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

describe("PrReviewLive", () => {
  it("builds review summaries and file guides with normalized context", async () => {
    const tempRoot = createTempRoot();
    const fetchMock = createFetch({
      [`${API_BASE}/repos/owner/repo/pulls/123`]:
        jsonResponse(pullRequestPayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
        jsonResponse(modifiedFilePayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/commits?per_page=100&page=1`]:
        jsonResponse(commitPayload),
      [`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
        textResponse(oldWidgetText),
      [`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
        textResponse(newWidgetText),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const backend = await loadBackendForTempRoot(tempRoot);
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* backend.PrReviewService;
          const summary = yield* service.getReviewSummary(PR_URL);
          const guide = yield* service.getFileReviewGuide(
            PR_URL,
            "src/widget.ts",
            3,
            "split",
            true
          );
          return { summary, guide };
        }).pipe(Effect.provide(backend.PrReviewLive))
      );

      expect(result.summary.queue[0]?.filename).toBe("src/widget.ts");
      expect(result.summary.themes).toContain(
        "1 source file(s) carry active code-review weight."
      );
      expect(result.summary.warnings).toContain(
        "Source changes are present without matching test-file changes in the PR."
      );
      expect(result.guide.filename).toBe("src/widget.ts");
      expect(
        result.guide.questions.some((q) => q.ruleId === "question:check_tests")
      ).toBe(true);
      expect(result.guide.diagnostics?.consistency.warnings).toEqual([]);
      expect(existsSync(cacheFilePath(tempRoot))).toBe(true);
      expect(readFileSync(cacheFilePath(tempRoot), "utf8")).toContain(
        "review:0.1.0:v1:summary:https://github.com/owner/repo/pull/123:base-sha:head-sha"
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reuses cached review outputs on repeated calls", async () => {
    const tempRoot = createTempRoot();
    const fetchMock = createFetch({
      [`${API_BASE}/repos/owner/repo/pulls/123`]:
        jsonResponse(pullRequestPayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
        jsonResponse(modifiedFilePayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/commits?per_page=100&page=1`]:
        jsonResponse(commitPayload),
      [`${RAW_BASE}/owner/repo/base-sha/src/widget.ts`]:
        textResponse(oldWidgetText),
      [`${RAW_BASE}/owner/repo/head-sha/src/widget.ts`]:
        textResponse(newWidgetText),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const backend = await loadBackendForTempRoot(tempRoot);
      await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* backend.PrReviewService;
          const first = yield* service.getReviewSummary(PR_URL);
          const second = yield* service.getReviewSummary(PR_URL);
          const firstGuide = yield* service.getFileReviewGuide(
            PR_URL,
            "src/widget.ts",
            3,
            "split",
            true
          );
          const secondGuide = yield* service.getFileReviewGuide(
            PR_URL,
            "src/widget.ts",
            3,
            "split",
            true
          );
          expect(second).toEqual(first);
          expect(secondGuide).toEqual(firstGuide);
        }).pipe(Effect.provide(backend.PrReviewLive))
      );

      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("degrades cleanly when commit context cannot be fetched", async () => {
    const tempRoot = createTempRoot();
    const fetchMock = createFetch({
      [`${API_BASE}/repos/owner/repo/pulls/123`]:
        jsonResponse(pullRequestPayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
        jsonResponse(modifiedFilePayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/commits?per_page=100&page=1`]:
        jsonResponse({ message: "boom" }, 500),
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
          const service = yield* backend.PrReviewService;
          return yield* service.getReviewSummary(PR_URL);
        }).pipe(Effect.provide(backend.PrReviewLive))
      );

      expect(
        summary.warnings.some((warning) =>
          warning.includes("commit headlines unavailable")
        )
      ).toBe(true);
      expect(summary.queue[0]?.filename).toBe("src/widget.ts");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores malformed cached review payloads and recomputes", async () => {
    const tempRoot = createTempRoot();
    writeCacheFile(tempRoot, [
      [
        "review:0.1.0:v1:summary:https://github.com/owner/repo/pull/123:base-sha:head-sha",
        {
          value: JSON.stringify({ cached: "invalid" }),
          expiresAt: Date.now() + 60_000,
        },
      ],
    ]);
    const fetchMock = createFetch({
      [`${API_BASE}/repos/owner/repo/pulls/123`]:
        jsonResponse(pullRequestPayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/files?per_page=100&page=1`]:
        jsonResponse(modifiedFilePayload),
      [`${API_BASE}/repos/owner/repo/pulls/123/commits?per_page=100&page=1`]:
        jsonResponse(commitPayload),
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
          const service = yield* backend.PrReviewService;
          return yield* service.getReviewSummary(PR_URL);
        }).pipe(Effect.provide(backend.PrReviewLive))
      );

      expect(summary.queue[0]?.filename).toBe("src/widget.ts");
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
