import { type BenchmarkAdapter, resolveBenchmarkAdapters } from "./adapters.js";
import { scoreCase, summarizeReports } from "./run.js";
import type {
	BenchmarkCase,
	BenchmarkCaseReport,
	BenchmarkComparisonCaseReport,
	BenchmarkComparisonReport,
	BenchmarkComparisonToolSummary,
} from "./types.js";

export function runBenchmarkComparisonSuite(
	benchmarkCases: readonly BenchmarkCase[],
	options?: {
		caseRoot?: string | undefined;
		tools?: readonly string[] | undefined;
		adapters?: readonly BenchmarkAdapter[] | undefined;
	},
): BenchmarkComparisonReport {
	const adapters =
		options?.adapters ??
		resolveBenchmarkAdapters(options?.tools ?? ["semadiff"]);

	const cases = benchmarkCases.map((benchmarkCase) => ({
		caseId: benchmarkCase.id,
		description: benchmarkCase.description,
		kind: benchmarkCase.kind,
		capabilities: benchmarkCase.capabilities,
		...(benchmarkCase.source ? { source: benchmarkCase.source } : {}),
		results: adapters.map((adapter) => {
			const output = adapter.runCase(benchmarkCase);
			return {
				tool: output.tool,
				toolVersion: output.toolVersion,
				evaluation: scoreCase(benchmarkCase, output),
				output,
			};
		}),
	})) satisfies readonly BenchmarkComparisonCaseReport[];

	const tools = adapters.map((adapter) => {
		const reports = cases.map((benchmarkCase) => {
			const result = benchmarkCase.results.find(
				(entry) => entry.tool === adapter.tool,
			);
			if (!result) {
				throw new Error(`Missing benchmark result for tool ${adapter.tool}.`);
			}
			return {
				caseId: benchmarkCase.caseId,
				description: benchmarkCase.description,
				kind: benchmarkCase.kind,
				capabilities: benchmarkCase.capabilities,
				...(benchmarkCase.source ? { source: benchmarkCase.source } : {}),
				evaluation: result.evaluation,
				output: result.output,
			} satisfies BenchmarkCaseReport;
		});

		return {
			tool: adapter.tool,
			toolVersion: reports[0]?.output.toolVersion ?? "unknown",
			summary: summarizeReports(reports),
		} satisfies BenchmarkComparisonToolSummary;
	});

	return {
		version: "0.1.0",
		caseRoot: options?.caseRoot ?? process.cwd(),
		generatedAt: new Date().toISOString(),
		cases,
		tools,
	};
}
