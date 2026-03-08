import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  loadBenchmarkCases,
  runBenchmarkComparisonSuite,
} from "../src/index.js";
import type { BenchmarkComparisonCaseToolReport } from "../src/types.js";

const caseRoot = join(import.meta.dirname, "../../../bench/cases/real/prs");
const comparisonTools = [
  "semadiff",
  "git-diff",
  "git-diff-color-moved",
  "difftastic",
  "semanticdiff",
] as const;

function reviewScore(result: BenchmarkComparisonCaseToolReport) {
  return result.evaluation.review.status === "scored"
    ? result.evaluation.review
    : null;
}

function semadiffMatchesOrBeats(result: {
  caseId: string;
  results: readonly BenchmarkComparisonCaseToolReport[];
}) {
  const semadiff = result.results.find((entry) => entry.tool === "semadiff");
  const semadiffReview = semadiff ? reviewScore(semadiff) : null;
  if (!semadiffReview) {
    return false;
  }
  return result.results.every((entry) => {
    if (entry.tool === "semadiff") {
      return true;
    }
    const review = reviewScore(entry);
    if (!review) {
      return true;
    }
    return (
      semadiffReview.changedLinePrecision >= review.changedLinePrecision &&
      semadiffReview.changedLineRecall >= review.changedLineRecall &&
      (semadiffReview.moveRecall === null ||
        review.moveRecall === null ||
        semadiffReview.moveRecall >= review.moveRecall) &&
      (semadiffReview.renameRecall === null ||
        review.renameRecall === null ||
        semadiffReview.renameRecall >= review.renameRecall)
    );
  });
}

describe("real PR corpus", () => {
  test("loads the curated real TypeScript PR slices", () => {
    const benchmarkCases = loadBenchmarkCases(caseRoot);
    expect(benchmarkCases).toHaveLength(50);
    expect(
      new Set(
        benchmarkCases.flatMap((benchmarkCase) =>
          benchmarkCase.source?.repository
            ? [benchmarkCase.source.repository]
            : []
        )
      ).size
    ).toBeGreaterThanOrEqual(5);
    expect(
      benchmarkCases.every(
        (benchmarkCase) =>
          benchmarkCase.kind === "real" &&
          benchmarkCase.capabilities.review &&
          !benchmarkCase.capabilities.entity &&
          benchmarkCase.source?.kind === "github-pr"
      )
    ).toBe(true);
    expect(
      benchmarkCases.every((benchmarkCase) =>
        existsSync(
          join(dirname(benchmarkCase.sourcePath), "github", "pull.diff")
        )
      )
    ).toBe(true);
    expect(
      benchmarkCases.every((benchmarkCase) =>
        existsSync(
          join(
            dirname(benchmarkCase.sourcePath),
            "semanticdiff",
            "manifest.json"
          )
        )
      )
    ).toBe(true);
  });

  test("semadiff matches or beats the configured review tools across the corpus", () => {
    const report = runBenchmarkComparisonSuite(loadBenchmarkCases(caseRoot), {
      caseRoot,
      tools: [...comparisonTools],
    });

    const failures = report.cases.flatMap((benchmarkCase) =>
      semadiffMatchesOrBeats(benchmarkCase)
        ? []
        : [
            {
              caseId: benchmarkCase.caseId,
              scores: benchmarkCase.results.map((entry) => ({
                tool: entry.tool,
                review: reviewScore(entry),
              })),
            },
          ]
    );

    expect(failures).toEqual([]);
  }, 15_000);
});
