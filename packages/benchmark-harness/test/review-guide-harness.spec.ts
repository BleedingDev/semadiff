import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	formatReviewGuideDiagnostics,
	loadBenchmarkCases,
	runReviewGuideCase,
	runReviewGuideSuite,
} from "../src/index.js";

const microCaseRoot = join(
	import.meta.dirname,
	"../../../bench/cases/gold/micro",
);
const realCaseRoot = join(import.meta.dirname, "../../../bench/cases/real/prs");

describe("review-guide harness", () => {
	test("scores the seeded micro corpus with embedded review-guide expectations", () => {
		const report = runReviewGuideSuite(loadBenchmarkCases(microCaseRoot), {
			caseRoot: microCaseRoot,
		});

		expect(report.summary.failedCases).toBe(0);
		expect(report.summary.averageExpectationRecall).toBe(1);
		expect(
			report.cases.find(
				(benchmarkCase) => benchmarkCase.caseId === "move-with-edit-ts-001",
			),
		).toMatchObject({
			evaluation: {
				passed: true,
				expectations: {
					checks: 4,
					matchedChecks: 4,
					recall: 1,
				},
			},
			output: {
				summary: {
					queue: [
						{
							filename: "src/example.ts",
							priority: "review_first",
						},
					],
				},
				files: [
					{
						filename: "src/example.ts",
						guide: {
							summary: "Refactor-oriented change with semantic move groups.",
						},
					},
				],
			},
		});
		expect(
			report.cases.find(
				(benchmarkCase) => benchmarkCase.caseId === "rename-local-ts-001",
			)?.evaluation.expectations,
		).toMatchObject({
			checks: 4,
			matchedChecks: 4,
			recall: 1,
			failures: [],
		});
	});

	test("keeps curated real PR slices surfaced and records no deterministic guide regressions", () => {
		const report = runReviewGuideSuite(loadBenchmarkCases(realCaseRoot), {
			caseRoot: realCaseRoot,
		});

		expect(report.summary.failedCases).toBe(0);
		expect(report.summary.cases).toBe(50);
		expect(report.summary.averageSelectedRecall).toBe(1);
		expect(
			report.cases.every((benchmarkCase) => benchmarkCase.evaluation.passed),
		).toBe(true);
	}, 20_000);

	test("formats failing diagnostics with queue and signal context", () => {
		const benchmarkCase = loadBenchmarkCases(microCaseRoot).find(
			(entry) => entry.id === "move-with-edit-ts-001",
		);
		expect(benchmarkCase).toBeDefined();
		if (!benchmarkCase) {
			throw new Error("Expected move-with-edit-ts-001 benchmark case.");
		}

		const report = runReviewGuideCase({
			...benchmarkCase,
			reviewGuide: {
				fileChecks: [
					{
						path: "src/example.ts",
						expectedPriority: "review_next",
					},
				],
			},
		});

		expect(report.evaluation.passed).toBe(false);
		expect(report.evaluation.diagnostics).toEqual(
			expect.arrayContaining([
				'Priority for src/example.ts matches expectation. expected="review_next" actual="review_first"',
			]),
		);
		expect(formatReviewGuideDiagnostics(report)).toContain(
			"move-with-edit-ts-001: fail",
		);
	});
});
