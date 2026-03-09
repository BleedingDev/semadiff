#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadBenchmarkCases } from "./cases.js";
import { runBenchmarkComparisonSuite } from "./compare.js";
import {
	formatReviewGuideDiagnostics,
	runReviewGuideSuite,
} from "./review-guide.js";
import { runBenchmarkSuite } from "./run.js";
import type { BenchmarkReviewGuideReport } from "./types.js";

interface CliOptions {
	cases: string;
	output?: string | undefined;
	help: boolean;
	mode: "benchmark" | "review-guide";
	tools: string[];
	verbose: boolean;
}

function usage() {
	return [
		"Usage: benchmark-harness [--cases <dir>] [--output <file>] [--tools <list>] [--mode <benchmark|review-guide>]",
		"",
		"Options:",
		"  --cases   Benchmark case root directory (default: bench/cases/gold/micro)",
		"  --mode    Output standard diff benchmarks or deterministic review-guide evaluation",
		"  --output  Write the JSON report to a file as well as stdout",
		"  --tools   Comma-separated tools (default: semadiff)",
		"  --verbose Print per-case review-guide diagnostics to stderr",
		"  --help    Show this message",
	].join("\n");
}

function readOptionValue(
	argv: readonly string[],
	index: number,
	flag: string,
): { value: string; nextIndex: number } {
	const value = argv[index + 1];
	if (!value) {
		throw new Error(`Missing value for ${flag}.`);
	}
	return {
		value,
		nextIndex: index + 1,
	};
}

function parseArgs(argv: readonly string[]): CliOptions {
	const options: CliOptions = {
		cases: "bench/cases/gold/micro",
		help: false,
		mode: "benchmark",
		tools: ["semadiff"],
		verbose: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		switch (value) {
			case "--":
				break;
			case "--help":
				options.help = true;
				break;
			case "--cases": {
				const parsed = readOptionValue(argv, index, "--cases");
				options.cases = parsed.value;
				index = parsed.nextIndex;
				break;
			}
			case "--mode": {
				const parsed = readOptionValue(argv, index, "--mode");
				if (parsed.value !== "benchmark" && parsed.value !== "review-guide") {
					throw new Error(
						`Unsupported mode "${parsed.value}". Expected benchmark or review-guide.`,
					);
				}
				options.mode = parsed.value;
				index = parsed.nextIndex;
				break;
			}
			case "--output": {
				const parsed = readOptionValue(argv, index, "--output");
				options.output = parsed.value;
				index = parsed.nextIndex;
				break;
			}
			case "--tools": {
				const parsed = readOptionValue(argv, index, "--tools");
				options.tools = parsed.value
					.split(",")
					.map((entry) => entry.trim())
					.filter((entry) => entry.length > 0);
				if (options.tools.length === 0) {
					throw new Error("Expected at least one tool name for --tools.");
				}
				index = parsed.nextIndex;
				break;
			}
			case "--verbose":
				options.verbose = true;
				break;
			default:
				throw new Error(`Unknown argument: ${value}`);
		}
	}

	return options;
}

function logReviewGuideSummary(report: BenchmarkReviewGuideReport) {
	process.stderr.write(
		`[review-guide] cases=${report.summary.cases} passed=${report.summary.passedCases} failed=${report.summary.failedCases} queueRecall=${report.summary.averageQueueRecall ?? "n/a"} selectedRecall=${report.summary.averageSelectedRecall ?? "n/a"}\n`,
	);
}

function logReviewGuideDetails(report: BenchmarkReviewGuideReport) {
	for (const benchmarkCase of report.cases) {
		process.stderr.write(`${formatReviewGuideDiagnostics(benchmarkCase)}\n`);
	}
}

try {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(`${usage()}\n`);
		process.exit(0);
	}

	const caseRoot = resolve(process.cwd(), options.cases);
	const benchmarkCases = loadBenchmarkCases(caseRoot);
	const report = (() => {
		if (options.mode === "review-guide") {
			return runReviewGuideSuite(benchmarkCases, { caseRoot });
		}
		if (options.tools.length === 1 && options.tools[0] === "semadiff") {
			return runBenchmarkSuite(benchmarkCases, { caseRoot });
		}
		return runBenchmarkComparisonSuite(benchmarkCases, {
			caseRoot,
			tools: options.tools,
		});
	})();
	if (options.mode === "review-guide") {
		logReviewGuideSummary(report as BenchmarkReviewGuideReport);
		if (options.verbose) {
			logReviewGuideDetails(report as BenchmarkReviewGuideReport);
		}
	}
	const output = `${JSON.stringify(report, null, 2)}\n`;

	if (options.output) {
		const outputPath = resolve(process.cwd(), options.output);
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, output);
	}

	process.stdout.write(output);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n`);
	process.exit(1);
}
