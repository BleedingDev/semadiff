import type {
  PrDiffClientContract,
  PrDiffResult,
  PrSummary,
} from "@semadiff/pr-backend";
import { Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";
import {
  createHttpPrDiffClient,
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

  test("effect client unwraps success and fails on error envelope", async () => {
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
    };
    const program = Effect.gen(function* () {
      const client = yield* PrDiffClient;
      return yield* client.getPrSummary({
        prUrl: "https://github.com/owner/repo/pull/123",
      });
    }).pipe(Effect.provide(PrDiffClientLive(promiseClient)));

    const result = await Effect.runPromise(program);
    expect(result.pr.title).toBe("Test PR");
  });
});
