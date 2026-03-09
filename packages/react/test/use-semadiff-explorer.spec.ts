// @vitest-environment jsdom

import type {
  FileDiffPayload,
  FileReviewGuide,
  PrDiffClientError,
  PrDiffResult,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-client";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type SemaDiffFileDiffClient,
  type SemaDiffFileReviewGuideClient,
  type SemaDiffReviewSummaryClient,
  type SemaDiffSummaryClient,
  useSemaDiffExplorer,
} from "../src/index.js";

const PR_URL = "https://github.com/owner/repo/pull/123";

const summaryFixture: PrSummary = {
  pr: {
    title: "Review guide plumbing",
    url: PR_URL,
    baseSha: "base",
    headSha: "head",
    additions: 8,
    deletions: 3,
    changedFiles: 2,
  },
  files: [
    {
      filename: "src/a.ts",
      status: "modified",
      additions: 3,
      deletions: 1,
      changes: 4,
      sha: "sha-a",
    },
    {
      filename: "src/b.ts",
      status: "modified",
      additions: 5,
      deletions: 2,
      changes: 7,
      sha: "sha-b",
    },
  ],
};

const reviewSummaryFixture: PrReviewSummary = {
  version: "0.1.0",
  ruleVersion: "0.1.0",
  themes: ["2 source file(s) carry active code-review weight."],
  queue: [
    {
      filename: "src/a.ts",
      priority: "review_first",
      classification: {
        primaryCategory: "source",
        categories: ["source"],
        trustBand: "deterministic_inference",
        reasons: ["Default source-file classification."],
      },
      reasons: [
        {
          id: "reason:a",
          scope: "pr",
          message: "Review src/a.ts early.",
          trustBand: "deterministic_inference",
          ruleId: "priority:source",
          evidence: [],
        },
      ],
      warnings: [],
    },
    {
      filename: "src/b.ts",
      priority: "review_next",
      classification: {
        primaryCategory: "source",
        categories: ["source"],
        trustBand: "deterministic_inference",
        reasons: ["Default source-file classification."],
      },
      reasons: [
        {
          id: "reason:b",
          scope: "pr",
          message: "Review src/b.ts next.",
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

const primaryFile = summaryFixture.files[0];

const diffFixture = (filename: string): FileDiffPayload => ({
  file:
    summaryFixture.files.find((file) => file.filename === filename) ??
    primaryFile,
  semanticHtml: `<section>${filename}:semantic</section>`,
  linesHtml: `<section>${filename}:lines</section>`,
});

const reviewGuideFixture = (filename: string): FileReviewGuide => ({
  version: "0.1.0",
  ruleVersion: "0.1.0",
  filename,
  priority: filename === "src/a.ts" ? "review_first" : "review_next",
  classification: {
    primaryCategory: "source",
    categories: ["source"],
    trustBand: "deterministic_inference",
    reasons: ["Default source-file classification."],
  },
  summary: `Review ${filename} carefully.`,
  reasons: [
    {
      id: `reason:${filename}`,
      scope: "file",
      message: `${filename} changes source behavior.`,
      trustBand: "structural_fact",
      ruleId: "reason:source_change",
      evidence: [],
    },
  ],
  questions: [
    {
      id: `question:${filename}`,
      question: "Were tests updated for this change?",
      rationale: "Source changed without matching tests.",
      trustBand: "contextual_hint",
      suggestedAction: "check_tests",
      ruleId: "question:check_tests",
      evidence: [],
    },
  ],
  warnings: [],
});

type ExplorerClient = SemaDiffSummaryClient &
  SemaDiffFileDiffClient &
  SemaDiffReviewSummaryClient &
  SemaDiffFileReviewGuideClient;

const ok = <T>(data: T): PrDiffResult<T> => ({ ok: true, data });

const createClient = () => {
  const summaryCalls: string[] = [];
  const reviewSummaryCalls: string[] = [];
  const diffCalls: string[] = [];
  const reviewGuideCalls: string[] = [];

  const client: ExplorerClient = {
    getPrSummary: (input) => {
      summaryCalls.push(input.prUrl);
      return Promise.resolve(ok(summaryFixture));
    },
    getPrReviewSummary: (input) => {
      reviewSummaryCalls.push(input.prUrl);
      return Promise.resolve(ok(reviewSummaryFixture));
    },
    getFileDiff: (input) => {
      diffCalls.push(input.filename);
      return Promise.resolve(ok(diffFixture(input.filename)));
    },
    getFileReviewGuide: (input) => {
      reviewGuideCalls.push(
        [
          input.filename,
          input.contextLines ?? -1,
          input.lineLayout ?? "unified",
          input.detectMoves ?? true,
        ].join("|")
      );
      return Promise.resolve(ok(reviewGuideFixture(input.filename)));
    },
  };

  return {
    client,
    summaryCalls,
    reviewSummaryCalls,
    diffCalls,
    reviewGuideCalls,
  };
};

const getDebugEvents = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls
    .map((call) => call[0])
    .filter((value): value is string => typeof value === "string");

afterEach(() => {
  vi.restoreAllMocks();
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("useSemaDiffExplorer", () => {
  it("loads summary and review summary eagerly, prefetches diffs, and fetches the selected file guide lazily", async () => {
    const debugLogger = vi.fn();
    const {
      client,
      summaryCalls,
      reviewSummaryCalls,
      diffCalls,
      reviewGuideCalls,
    } = createClient();

    const { result } = renderHook(() =>
      useSemaDiffExplorer({
        client,
        prUrl: PR_URL,
        contextLines: 3,
        debugLogger,
      })
    );

    await waitFor(() => {
      expect(result.current.summary?.files).toHaveLength(2);
      expect(result.current.reviewSummary?.queue).toHaveLength(2);
      expect(result.current.diffData?.file.filename).toBe("src/a.ts");
      expect(result.current.reviewGuideData?.filename).toBe("src/a.ts");
    });

    expect(summaryCalls).toEqual([PR_URL]);
    expect(reviewSummaryCalls).toEqual([PR_URL]);
    expect(diffCalls).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts"]));
    expect(reviewGuideCalls).toEqual(["src/a.ts|3|unified|true"]);
    expect(getDebugEvents(debugLogger)).toEqual(
      expect.arrayContaining([
        "summary:fetch:start",
        "review-summary:fetch:start",
        "review-guide:fetch:start",
      ])
    );
  });

  it("reuses cached review guides across selection changes and logs cache hits in debug mode", async () => {
    const debugLogger = vi.fn();
    const { client, reviewGuideCalls } = createClient();

    const { result } = renderHook(() =>
      useSemaDiffExplorer({
        client,
        prUrl: PR_URL,
        contextLines: 2,
        debugLogger,
      })
    );

    await waitFor(() => {
      expect(result.current.reviewGuideData?.filename).toBe("src/a.ts");
    });

    act(() => {
      result.current.setSelectedFile("src/b.ts");
    });

    await waitFor(() => {
      expect(result.current.reviewGuideData?.filename).toBe("src/b.ts");
    });

    act(() => {
      result.current.setSelectedFile("src/a.ts");
    });

    await waitFor(() => {
      expect(result.current.reviewGuideData?.filename).toBe("src/a.ts");
    });

    expect(reviewGuideCalls).toEqual([
      "src/a.ts|2|unified|true",
      "src/b.ts|2|unified|true",
    ]);
    expect(getDebugEvents(debugLogger)).toContain("review-guide:cache-hit");
  });

  it("invalidates review state on refresh and refetches the active guide", async () => {
    const debugLogger = vi.fn();
    const { client, summaryCalls, reviewSummaryCalls, reviewGuideCalls } =
      createClient();

    const { result } = renderHook(() =>
      useSemaDiffExplorer({
        client,
        prUrl: PR_URL,
        contextLines: 1,
        debugLogger,
      })
    );

    await waitFor(() => {
      expect(result.current.reviewGuideData?.filename).toBe("src/a.ts");
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(summaryCalls).toHaveLength(2);
      expect(reviewSummaryCalls).toHaveLength(2);
      expect(reviewGuideCalls).toHaveLength(2);
      expect(result.current.reviewGuideData?.filename).toBe("src/a.ts");
    });

    expect(getDebugEvents(debugLogger)).toEqual(
      expect.arrayContaining(["cache:clear", "review-guide:fetch:start"])
    );
  });

  it("surfaces review transport failures separately from diff and summary state", async () => {
    const reviewError: PrDiffClientError = {
      code: "GitHubRequestError",
      message: "review guide failed",
    };
    const client: ExplorerClient = {
      getPrSummary: async () => ok(summaryFixture),
      getPrReviewSummary: async () => ok(reviewSummaryFixture),
      getFileDiff: async (input) => ok(diffFixture(input.filename)),
      getFileReviewGuide: async () => ({
        ok: false,
        error: reviewError,
      }),
    };

    const { result } = renderHook(() =>
      useSemaDiffExplorer({
        client,
        prUrl: PR_URL,
      })
    );

    await waitFor(() => {
      expect(result.current.summary?.files).toHaveLength(2);
      expect(result.current.reviewSummary?.queue).toHaveLength(2);
      expect(result.current.reviewGuideError?.message).toBe(
        "review guide failed"
      );
    });

    expect(result.current.diffError).toBeNull();
    expect(result.current.summaryError).toBeNull();
    expect(result.current.reviewSummaryError).toBeNull();
  });
});
