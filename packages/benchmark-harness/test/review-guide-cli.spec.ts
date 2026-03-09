import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const tempDirs: string[] = [];

function makeTempDir() {
	const directory = mkdtempSync(join(tmpdir(), "semadiff-review-guide-cli-"));
	tempDirs.push(directory);
	return directory;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const directory = tempDirs.pop();
		if (directory) {
			rmSync(directory, { recursive: true, force: true });
		}
	}
});

describe("review-guide CLI", () => {
	test("emits a deterministic report file in review-guide mode", () => {
		const tempDir = makeTempDir();
		const outputPath = join(tempDir, "review-guide-report.json");
		const stdout = execFileSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"packages/benchmark-harness/src/cli.ts",
				"--mode",
				"review-guide",
				"--cases",
				"bench/cases/gold/micro",
				"--output",
				outputPath,
			],
			{
				cwd: resolve(import.meta.dirname, "../../.."),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
			caseRoot: string;
			summary: { cases: number; failedCases: number };
			cases: Array<{
				caseId: string;
				evaluation: { passed: boolean };
				output: {
					summary: {
						queue: Array<{ filename: string; priority: string }>;
					};
				};
			}>;
		};

		expect(report.caseRoot).toContain("bench/cases/gold/micro");
		expect(report.summary.cases).toBe(6);
		expect(report.summary.failedCases).toBe(0);
		expect(
			report.cases.find(
				(benchmarkCase) => benchmarkCase.caseId === "move-with-edit-ts-001",
			),
		).toMatchObject({
			evaluation: { passed: true },
			output: {
				summary: {
					queue: [{ filename: "src/example.ts", priority: "review_first" }],
				},
			},
		});
		expect(stdout).toContain('"averageExpectationRecall": 1');
	});

	test("writes structured diagnostics to stderr in verbose mode", () => {
		const tempDir = makeTempDir();
		const outputPath = join(tempDir, "review-guide-report.json");
		const result = spawnSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"packages/benchmark-harness/src/cli.ts",
				"--mode",
				"review-guide",
				"--cases",
				"bench/cases/gold/micro",
				"--output",
				outputPath,
				"--verbose",
			],
			{
				cwd: resolve(import.meta.dirname, "../../.."),
				encoding: "utf8",
			},
		);

		if (result.status !== 0) {
			throw new Error(result.stderr || "Expected review-guide CLI to succeed.");
		}

		const loggedReport = readFileSync(outputPath, "utf8");
		expect(loggedReport).toContain('"caseId": "move-with-edit-ts-001"');
		expect(result.stderr).toContain("[review-guide] cases=6");
		expect(result.stderr).toContain("move-with-edit-ts-001: pass");
		expect(result.stderr).toContain("queue recall=");
	});
});
