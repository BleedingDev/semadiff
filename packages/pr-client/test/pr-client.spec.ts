import type {
  FileDiffDocument,
  FileDiffPayload,
  FileReviewGuide,
  PrDiffClientContract,
  PrDiffResult,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-backend";
import { Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";
import {
  createHttpPrDiffClient,
  makeHttpPrDiffClientLive,
  makePrDiffEffectClient,
  PrDiffClient,
  PrDiffClientLive,
} from "../src/index.js";

const summaryFixture: PrSummary = {
  pr: {
    title: "Test PR",
    url: "https://github.com/owner/repo/pull/123",
    baseSha: "base",
    headSha: "head",
    additions: 10,
    deletions: 3,
    changedFiles: 2,
  },
  files: [],
};

const fileDiffFixture: FileDiffPayload = {
  file: {
    filename: "src/file.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    changes: 3,
    sha: "sha-1",
  },
  semanticHtml: "<section>semantic</section>",
  linesHtml: "<section>lines</section>",
};

const fileDiffDocumentFixture: FileDiffDocument = {
  file: fileDiffFixture.file,
  diff: {
    version: "0.1.0",
    operations: [],
    moves: [],
    renames: [],
  },
};

const reviewSummaryFixture: PrReviewSummary = {
  version: "0.1.0",
  ruleVersion: "0.1.0",
  themes: ["1 source file(s) carry active code-review weight."],
  queue: [
    {
      filename: "src/file.ts",
      priority: "review_first",
      classification: {
        primaryCategory: "source",
        categories: ["source"],
        trustBand: "deterministic_inference",
        reasons: ["Default source-file classification."],
      },
      reasons: [
        {
          id: "reason:queue",
          scope: "pr",
          message: "Review this file early.",
          trustBand: "deterministic_inference",
          ruleId: "priority:source",
          evidence: [],
        },
      ],
      warnings: [],
    },
  ],
  deprioritized: [],
  deprioritizedGroups: [],
  warnings: [],
};

const fileReviewGuideFixture: FileReviewGuide = {
  version: "0.1.0",
  ruleVersion: "0.1.0",
  filename: "src/file.ts",
  priority: "review_first",
  classification: {
    primaryCategory: "source",
    categories: ["source"],
    trustBand: "deterministic_inference",
    reasons: ["Default source-file classification."],
  },
  summary: "Review source behavior carefully.",
  reasons: [
    {
      id: "reason:file",
      scope: "file",
      message: "Source behavior changed.",
      trustBand: "structural_fact",
      ruleId: "reason:source_change",
      evidence: [],
    },
  ],
  questions: [
    {
      id: "question:tests",
      question: "Were tests updated for this source change?",
      rationale: "Source changed without nearby tests.",
      trustBand: "contextual_hint",
      suggestedAction: "check_tests",
      ruleId: "question:check_tests",
      evidence: [],
    },
  ],
  warnings: [],
};

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("@semadiff/pr-client", () => {
  test("encodes query params for HTTP summary and returns result envelope", async () => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: (input, init) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        return Promise.resolve(
          jsonResponse({
            ok: true,
            data: summaryFixture,
          } satisfies PrDiffResult<PrSummary>)
        );
      },
      headers: { "x-test": "1" },
      credentials: "include",
      endpoints: {
        summaryPath: "/v1/pr/summary",
      },
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe("/v1/pr/summary");
    expect(calls[0]?.url.searchParams.get("prUrl")).toBe(
      "https://github.com/owner/repo/pull/123"
    );
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  test("returns UnknownError for invalid success payload", async () => {
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: () => Promise.resolve(jsonResponse({ not: "a result envelope" })),
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UnknownError");
    }
  });

  test("maps transport exceptions to client errors", async () => {
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: () => {
        throw new Error("network down");
      },
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Error");
      expect(result.error.message).toContain("network down");
    }
  });

  test("maps string transport failures to client errors", async () => {
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: () => Promise.reject("socket closed"),
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("Error");
      expect(result.error.message).toBe("socket closed");
    }
  });

  test("returns GitHubRequestError envelopes for non-ok responses", async () => {
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: () =>
        Promise.resolve(new Response("upstream unavailable", { status: 503 })),
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("GitHubRequestError");
      expect(result.error.message).toContain("HTTP 503");
    }
  });

  test("treats empty success bodies as invalid payloads", async () => {
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: () => Promise.resolve(new Response("", { status: 200 })),
    });

    const result = await client.getPrSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UnknownError");
    }
  });

  test("encodes explicit line-view params for file, document, and review requests", async () => {
    const calls: URL[] = [];
    const client = createHttpPrDiffClient({
      baseUrl: "https://api.example.com",
      fetch: (input) => {
        const url = new URL(String(input));
        calls.push(url);
        let body: PrDiffResult<
          FileDiffPayload | FileDiffDocument | PrReviewSummary | FileReviewGuide
        >;
        if (url.pathname === "/api/semadiff/pr/file-diff") {
          body = {
            ok: true,
            data: fileDiffFixture,
          };
        } else if (url.pathname === "/api/semadiff/pr/file-diff-document") {
          body = {
            ok: true,
            data: fileDiffDocumentFixture,
          };
        } else if (url.pathname === "/api/semadiff/pr/review-summary") {
          body = {
            ok: true,
            data: reviewSummaryFixture,
          };
        } else {
          body = {
            ok: true,
            data: fileReviewGuideFixture,
          };
        }
        return Promise.resolve(jsonResponse(body));
      },
    });

    const fileDiff = await client.getFileDiff({
      prUrl: "https://github.com/owner/repo/pull/123",
      filename: "src/file.ts",
      contextLines: 4,
      lineLayout: "split",
      lineMode: "raw",
      hideComments: true,
      detectMoves: false,
    });
    const fileDiffDocument = await client.getFileDiffDocument({
      prUrl: "https://github.com/owner/repo/pull/123",
      filename: "src/file.ts",
      contextLines: 2,
      lineLayout: "unified",
      detectMoves: true,
    });
    const reviewSummary = await client.getPrReviewSummary({
      prUrl: "https://github.com/owner/repo/pull/123",
    });
    const fileReviewGuide = await client.getFileReviewGuide({
      prUrl: "https://github.com/owner/repo/pull/123",
      filename: "src/file.ts",
      contextLines: 1,
      lineLayout: "split",
      detectMoves: false,
    });
    expect(fileDiff.ok).toBe(true);
    expect(fileDiffDocument.ok).toBe(true);
    expect(reviewSummary.ok).toBe(true);
    expect(fileReviewGuide.ok).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.searchParams.get("contextLines")).toBe("4");
    expect(calls[0]?.searchParams.get("lineLayout")).toBe("split");
    expect(calls[0]?.searchParams.get("lineMode")).toBe("raw");
    expect(calls[0]?.searchParams.get("hideComments")).toBe("true");
    expect(calls[0]?.searchParams.get("detectMoves")).toBe("false");
    expect(calls[1]?.searchParams.get("contextLines")).toBe("2");
    expect(calls[1]?.searchParams.get("lineLayout")).toBe("unified");
    expect(calls[1]?.searchParams.get("detectMoves")).toBe("true");
    expect(calls[2]?.pathname).toBe("/api/semadiff/pr/review-summary");
    expect(calls[2]?.searchParams.get("prUrl")).toBe(
      "https://github.com/owner/repo/pull/123"
    );
    expect(calls[3]?.pathname).toBe("/api/semadiff/pr/file-review-guide");
    expect(calls[3]?.searchParams.get("contextLines")).toBe("1");
    expect(calls[3]?.searchParams.get("lineLayout")).toBe("split");
    expect(calls[3]?.searchParams.get("detectMoves")).toBe("false");
  });

  test("effect client unwraps success and fails on diff/review error envelopes", async () => {
    const promiseClient: PrDiffClientContract = {
      getPrSummary: async () => ({ ok: true, data: summaryFixture }),
      getFileDiff: async () => ({
        ok: false,
        error: { code: "PrFileNotFound", message: "missing" },
      }),
      getFileDiffDocument: async () => ({
        ok: false,
        error: { code: "PrFileNotFound", message: "missing" },
      }),
      getPrReviewSummary: async () => ({
        ok: true,
        data: reviewSummaryFixture,
      }),
      getFileReviewGuide: async () => ({
        ok: false,
        error: { code: "PrFileNotFound", message: "missing" },
      }),
    };
    const effectClient = makePrDiffEffectClient(promiseClient);

    const summaryExit = await Effect.runPromiseExit(
      effectClient.getPrSummary({
        prUrl: "https://github.com/owner/repo/pull/123",
      })
    );
    expect(Exit.isSuccess(summaryExit)).toBe(true);

    const diffExit = await Effect.runPromiseExit(
      effectClient.getFileDiff({
        prUrl: "https://github.com/owner/repo/pull/123",
        filename: "src/file.ts",
      })
    );
    expect(Exit.isFailure(diffExit)).toBe(true);

    const reviewSummaryExit = await Effect.runPromiseExit(
      effectClient.getPrReviewSummary({
        prUrl: "https://github.com/owner/repo/pull/123",
      })
    );
    expect(Exit.isSuccess(reviewSummaryExit)).toBe(true);

    const reviewGuideExit = await Effect.runPromiseExit(
      effectClient.getFileReviewGuide({
        prUrl: "https://github.com/owner/repo/pull/123",
        filename: "src/file.ts",
      })
    );
    expect(Exit.isFailure(reviewGuideExit)).toBe(true);
  });

  test("live layer provides PrDiffClient service", async () => {
    const promiseClient: PrDiffClientContract = {
      getPrSummary: async () => ({ ok: true, data: summaryFixture }),
      getFileDiff: async () => ({
        ok: false,
        error: { code: "PrFileNotFound", message: "missing" },
      }),
      getFileDiffDocument: async () => ({
        ok: false,
        error: { code: "PrFileNotFound", message: "missing" },
      }),
      getPrReviewSummary: async () => ({
        ok: true,
        data: reviewSummaryFixture,
      }),
      getFileReviewGuide: async () => ({
        ok: true,
        data: fileReviewGuideFixture,
      }),
    };
    const program = Effect.gen(function* () {
      const client = yield* PrDiffClient;
      const reviewSummary = yield* client.getPrReviewSummary({
        prUrl: "https://github.com/owner/repo/pull/123",
      });
      const reviewGuide = yield* client.getFileReviewGuide({
        prUrl: "https://github.com/owner/repo/pull/123",
        filename: "src/file.ts",
      });
      return { reviewSummary, reviewGuide };
    }).pipe(Effect.provide(PrDiffClientLive(promiseClient)));

    const result = await Effect.runPromise(program);
    expect(result.reviewSummary.queue[0]?.filename).toBe("src/file.ts");
    expect(result.reviewGuide.filename).toBe("src/file.ts");
  });

  test("http client live helper provides the effect service from HTTP options", async () => {
    const program = Effect.gen(function* () {
      const client = yield* PrDiffClient;
      return yield* client.getPrSummary({
        prUrl: "https://github.com/owner/repo/pull/123",
      });
    }).pipe(
      Effect.provide(
        makeHttpPrDiffClientLive({
          baseUrl: "https://api.example.com",
          fetch: () =>
            Promise.resolve(
              jsonResponse({
                ok: true,
                data: summaryFixture,
              } satisfies PrDiffResult<PrSummary>)
            ),
        })
      )
    );

    const result = await Effect.runPromise(program);
    expect(result.pr.url).toContain("/pull/123");
  });
});
