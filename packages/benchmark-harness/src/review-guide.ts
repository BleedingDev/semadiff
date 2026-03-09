import { structuralDiff } from "@semadiff/core";
import {
	classifyReviewFile,
	composeFileReviewGuide,
	summarizePrReview,
} from "@semadiff/review-guide";

import type {
	BenchmarkCase,
	BenchmarkCaseFile,
	BenchmarkReviewGuideCaseEvaluation,
	BenchmarkReviewGuideCaseOutput,
	BenchmarkReviewGuideCaseReport,
	BenchmarkReviewGuideCheck,
	BenchmarkReviewGuideExpectation,
	BenchmarkReviewGuideExpectationScore,
	BenchmarkReviewGuideFileExpectation,
	BenchmarkReviewGuideFileOutput,
	BenchmarkReviewGuideQueueScore,
	BenchmarkReviewGuideReport,
	BenchmarkReviewGuideReportSummary,
	BenchmarkReviewGuideSignalScore,
} from "./types.js";

const LINE_SPLIT_RE = /\r?\n/u;
const DOC_PATH_RE =
	/(^docs\/)|(^documentation\/)|(^\.github\/)|(\.(md|mdx|rst|txt)$)/u;
const LOCKFILE_PATH_RE =
	/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock)$/u;
const GENERATED_PATH_RE =
	/(^|\/)(dist|build|coverage|generated|gen|vendor|vendors?)\//u;
const MOVE_GUIDANCE_RULE_ID = "guidance:moves";
const RENAME_GUIDANCE_RULE_ID = "guidance:renames";
const CHECK_TESTS_RULE_ID = "question:check_tests";

function roundNumber(value: number) {
	return Number(value.toFixed(3));
}

function average(values: readonly number[]) {
	if (values.length === 0) {
		return null;
	}
	return roundNumber(
		values.reduce((sum, value) => sum + value, 0) / values.length,
	);
}

function recall(expected: number, matched: number) {
	if (expected === 0) {
		return null;
	}
	return roundNumber(matched / expected);
}

function splitLines(text: string) {
	if (text.length === 0) {
		return [""];
	}
	const lines = text.split(LINE_SPLIT_RE);
	if (lines.length > 1 && lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

function countLines(text?: string) {
	return text ? splitLines(text).length : 0;
}

function normalizeFilename(file: BenchmarkCaseFile) {
	return file.newPath ?? file.oldPath ?? file.id;
}

function normalizeFileStatus(
	file: BenchmarkCaseFile,
): "added" | "modified" | "removed" | "renamed" {
	switch (file.status) {
		case "deleted":
			return "removed";
		default:
			return file.status;
	}
}

function calculateReductionPercent(
	diff: ReturnType<typeof structuralDiff>,
): number | undefined {
	const changeLines = diff.operations.reduce(
		(total, operation) =>
			total + countLines(operation.oldText) + countLines(operation.newText),
		0,
	);
	if (diff.operations.length === 0 || changeLines === 0) {
		return undefined;
	}
	const ratio = 1 - diff.operations.length / changeLines;
	return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

function buildReviewInput(
	file: BenchmarkCaseFile,
	diff: ReturnType<typeof structuralDiff>,
) {
	const filename = normalizeFilename(file);
	const beforeLines = splitLines(file.before).length;
	const afterLines = splitLines(file.after).length;
	const changeCount = diff.operations.reduce((total, operation) => {
		const oldSpan =
			operation.oldRange !== undefined
				? operation.oldRange.end.line - operation.oldRange.start.line + 1
				: 0;
		const newSpan =
			operation.newRange !== undefined
				? operation.newRange.end.line - operation.newRange.start.line + 1
				: 0;
		return total + Math.max(oldSpan, newSpan, 1);
	}, 0);

	return {
		filename,
		status: normalizeFileStatus(file),
		additions: Math.max(0, afterLines - beforeLines),
		deletions: Math.max(0, beforeLines - afterLines),
		changes: Math.max(changeCount, diff.operations.length),
		sha: `benchmark:${file.id}`,
		reductionPercent: calculateReductionPercent(diff),
		operations: diff.operations.length,
		moveCount: diff.moves.length,
		renameCount: diff.renames.length,
		language: file.language,
	};
}

function isDeprioritizedPath(filename: string) {
	return (
		DOC_PATH_RE.test(filename) ||
		LOCKFILE_PATH_RE.test(filename) ||
		GENERATED_PATH_RE.test(filename)
	);
}

function findSummaryEntry(
	summary: BenchmarkReviewGuideCaseOutput["summary"],
	filename: string,
) {
	return [...summary.queue, ...summary.deprioritized].find(
		(entry) => entry.filename === filename,
	);
}

function findFileOutput(
	output: BenchmarkReviewGuideCaseOutput,
	expectation: BenchmarkReviewGuideFileExpectation,
) {
	return output.files.find((entry) => {
		if (expectation.fileId && entry.fileId === expectation.fileId) {
			return true;
		}
		if (expectation.path && entry.filename === expectation.path) {
			return true;
		}
		return false;
	});
}

function hasMoveGuidance(file: BenchmarkReviewGuideFileOutput) {
	return (
		guideHasRuleId(file, "reason", MOVE_GUIDANCE_RULE_ID) ||
		file.guide.questions.some(
			(question) => question.suggestedAction === "inspect_moves",
		)
	);
}

function hasRenameGuidance(file: BenchmarkReviewGuideFileOutput) {
	return (
		guideHasRuleId(file, "reason", RENAME_GUIDANCE_RULE_ID) ||
		file.guide.questions.some(
			(question) => question.suggestedAction === "inspect_renames",
		)
	);
}

function hasBehaviorQuestion(file: BenchmarkReviewGuideFileOutput) {
	return guideHasRuleId(file, "question", CHECK_TESTS_RULE_ID);
}

function deriveExpectedQueueSets(benchmarkCase: BenchmarkCase) {
	const selectedFiles = new Set<string>();
	for (const filename of benchmarkCase.source?.selectedFiles ?? []) {
		selectedFiles.add(filename);
	}
	const queued = new Set(
		[...selectedFiles].filter((filename) => !isDeprioritizedPath(filename)),
	);
	const deprioritized = new Set<string>();
	for (const filename of benchmarkCase.files.map((file) =>
		normalizeFilename(file),
	)) {
		if (isDeprioritizedPath(filename)) {
			deprioritized.add(filename);
		}
	}
	for (const filename of benchmarkCase.reviewGuide?.reviewFirst ?? []) {
		queued.add(filename);
		deprioritized.delete(filename);
	}
	for (const filename of benchmarkCase.reviewGuide?.reviewNext ?? []) {
		queued.add(filename);
		deprioritized.delete(filename);
	}
	for (const filename of benchmarkCase.reviewGuide?.deprioritized ?? []) {
		deprioritized.add(filename);
		queued.delete(filename);
	}
	return {
		queued,
		deprioritized,
		selectedFiles,
	};
}

function evaluateQueue(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkReviewGuideCaseOutput,
	diagnostics: string[],
): BenchmarkReviewGuideQueueScore {
	const actualQueue = new Set(
		output.summary.queue.map((entry) => entry.filename),
	);
	const actualDeprioritized = new Set(
		output.summary.deprioritized.map((entry) => entry.filename),
	);
	const expected = deriveExpectedQueueSets(benchmarkCase);
	const matchedQueuedFiles = [...expected.queued].filter((filename) =>
		actualQueue.has(filename),
	).length;
	const matchedDeprioritizedFiles = [...expected.deprioritized].filter(
		(filename) => actualDeprioritized.has(filename),
	).length;
	const surfacedSelectedFiles = [...expected.selectedFiles].filter(
		(filename) => {
			if (expected.deprioritized.has(filename)) {
				return actualDeprioritized.has(filename);
			}
			return actualQueue.has(filename);
		},
	).length;

	for (const filename of expected.queued) {
		if (!actualQueue.has(filename)) {
			diagnostics.push(
				`Expected queued file '${filename}' was not surfaced in the review queue.`,
			);
		}
	}
	for (const filename of expected.deprioritized) {
		if (!actualDeprioritized.has(filename)) {
			diagnostics.push(
				`Expected deprioritized file '${filename}' was not placed in a deprioritized bucket.`,
			);
		}
	}

	return {
		expectedQueuedFiles: expected.queued.size,
		matchedQueuedFiles,
		queueRecall: recall(expected.queued.size, matchedQueuedFiles),
		expectedDeprioritizedFiles: expected.deprioritized.size,
		matchedDeprioritizedFiles,
		deprioritizedRecall: recall(
			expected.deprioritized.size,
			matchedDeprioritizedFiles,
		),
		selectedFiles: expected.selectedFiles.size,
		surfacedSelectedFiles,
		selectedRecall: recall(expected.selectedFiles.size, surfacedSelectedFiles),
	};
}

function guideHasRuleId(
	file: BenchmarkReviewGuideFileOutput,
	kind: "question" | "reason",
	ruleId: string,
) {
	const collection =
		kind === "question" ? file.guide.questions : file.guide.reasons;
	return collection.some((entry) => entry.ruleId === ruleId);
}

function guideContainsWarning(
	file: BenchmarkReviewGuideFileOutput,
	warning: string,
) {
	return file.guide.warnings.some((entry) => entry.includes(warning));
}

function evaluateSignals(
	output: BenchmarkReviewGuideCaseOutput,
	diagnostics: string[],
): BenchmarkReviewGuideSignalScore {
	const moveCandidates = output.files.filter((file) => file.moveCount > 0);
	const renameCandidates = output.files.filter((file) => file.renameCount > 0);
	const behaviorCandidates = output.files.filter(
		(file) =>
			file.guide.classification.primaryCategory === "source" &&
			file.operationCount > 0,
	);

	const matchedMoveSignals = moveCandidates.filter((file) =>
		hasMoveGuidance(file),
	).length;
	const matchedRenameSignals = renameCandidates.filter((file) =>
		hasRenameGuidance(file),
	).length;
	const matchedBehaviorQuestions = behaviorCandidates.filter((file) =>
		hasBehaviorQuestion(file),
	).length;

	for (const file of moveCandidates) {
		if (!hasMoveGuidance(file)) {
			diagnostics.push(
				`Expected move guidance for '${file.filename}' but no move-specific reason or action was emitted.`,
			);
		}
	}
	for (const file of renameCandidates) {
		if (!hasRenameGuidance(file)) {
			diagnostics.push(
				`Expected rename guidance for '${file.filename}' but no rename-specific reason or action was emitted.`,
			);
		}
	}
	for (const file of behaviorCandidates) {
		if (!hasBehaviorQuestion(file)) {
			diagnostics.push(
				`Expected test-coverage question for source file '${file.filename}' but none was emitted.`,
			);
		}
	}

	return {
		expectedMoveSignals: moveCandidates.length,
		matchedMoveSignals,
		moveSignalRecall: recall(moveCandidates.length, matchedMoveSignals),
		expectedRenameSignals: renameCandidates.length,
		matchedRenameSignals,
		renameSignalRecall: recall(renameCandidates.length, matchedRenameSignals),
		expectedBehaviorQuestions: behaviorCandidates.length,
		matchedBehaviorQuestions,
		behaviorQuestionRecall: recall(
			behaviorCandidates.length,
			matchedBehaviorQuestions,
		),
	};
}

function expectationLabel(expectation: BenchmarkReviewGuideFileExpectation) {
	return (
		expectation.path ??
		expectation.fileId ??
		"unknown review-guide expectation target"
	);
}

function makeCheck(params: {
	id: string;
	passed: boolean;
	message: string;
	expected?: unknown;
	actual?: unknown;
}): BenchmarkReviewGuideCheck {
	return {
		id: params.id,
		passed: params.passed,
		message: params.message,
		...(params.expected !== undefined ? { expected: params.expected } : {}),
		...(params.actual !== undefined ? { actual: params.actual } : {}),
	};
}

function createSelectedSurfaceCheck(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkReviewGuideCaseOutput,
): BenchmarkReviewGuideCheck {
	const selectedFiles = benchmarkCase.source?.selectedFiles ?? [];
	const surfaced = new Set([
		...output.summary.queue.map((entry) => entry.filename),
		...output.summary.deprioritized.map((entry) => entry.filename),
	]);
	const missing = selectedFiles.filter((filename) => !surfaced.has(filename));
	return makeCheck({
		id: "selected-files-surfaced",
		passed: missing.length === 0,
		message: "Selected files stay surfaced by the deterministic review guide.",
		expected: selectedFiles,
		actual: missing.length === 0 ? selectedFiles : missing,
	});
}

function evaluateStructuredFileExpectation(
	output: BenchmarkReviewGuideCaseOutput,
	expectation: BenchmarkReviewGuideFileExpectation,
): readonly BenchmarkReviewGuideCheck[] {
	const file = findFileOutput(output, expectation);
	const label = expectationLabel(expectation);
	if (!file) {
		return [
			makeCheck({
				id: `file:${label}`,
				passed: false,
				message: `Review guide output exists for ${label}.`,
				expected: label,
				actual: "missing",
			}),
		];
	}

	const checks: BenchmarkReviewGuideCheck[] = [];
	if (expectation.expectedPriority) {
		checks.push(
			makeCheck({
				id: `priority:${label}`,
				passed: file.guide.priority === expectation.expectedPriority,
				message: `Priority for ${label} matches expectation.`,
				expected: expectation.expectedPriority,
				actual: file.guide.priority,
			}),
		);
	}
	if (expectation.expectedCategory) {
		checks.push(
			makeCheck({
				id: `category:${label}`,
				passed:
					file.guide.classification.primaryCategory ===
					expectation.expectedCategory,
				message: `Category for ${label} matches expectation.`,
				expected: expectation.expectedCategory,
				actual: file.guide.classification.primaryCategory,
			}),
		);
	}
	for (const ruleId of expectation.requiredQuestionRuleIds ?? []) {
		checks.push(
			makeCheck({
				id: `question-rule:${label}:${ruleId}`,
				passed: guideHasRuleId(file, "question", ruleId),
				message: `Question rule ${ruleId} is present for ${label}.`,
				expected: ruleId,
				actual: file.guide.questions.map((entry) => entry.ruleId),
			}),
		);
	}
	for (const ruleId of expectation.requiredReasonRuleIds ?? []) {
		checks.push(
			makeCheck({
				id: `reason-rule:${label}:${ruleId}`,
				passed: guideHasRuleId(file, "reason", ruleId),
				message: `Reason rule ${ruleId} is present for ${label}.`,
				expected: ruleId,
				actual: file.guide.reasons.map((entry) => entry.ruleId),
			}),
		);
	}
	for (const warning of expectation.requiredWarnings ?? []) {
		checks.push(
			makeCheck({
				id: `warning:${label}:${warning}`,
				passed: guideContainsWarning(file, warning),
				message: `Warning ${warning} is present for ${label}.`,
				expected: warning,
				actual: file.guide.warnings,
			}),
		);
	}
	return checks;
}

function evaluateExternalExpectation(
	output: BenchmarkReviewGuideCaseOutput,
	expectation: BenchmarkReviewGuideExpectation,
): readonly BenchmarkReviewGuideCheck[] {
	const checks: BenchmarkReviewGuideCheck[] = [];

	if (expectation.topQueueFileIds) {
		checks.push(
			makeCheck({
				id: "top-queue",
				passed: expectation.topQueueFileIds.every(
					(filename, index) =>
						output.summary.queue[index]?.filename === filename,
				),
				message: "Top review queue ordering matches expectation.",
				expected: expectation.topQueueFileIds,
				actual: output.summary.queue
					.slice(0, expectation.topQueueFileIds.length)
					.map((entry) => entry.filename),
			}),
		);
	}

	for (const [filename, priority] of Object.entries(
		expectation.expectedPriorities ?? {},
	)) {
		const guide = output.files.find(
			(entry) => entry.filename === filename,
		)?.guide;
		checks.push(
			makeCheck({
				id: `priority:${filename}`,
				passed: guide?.priority === priority,
				message: `Priority for ${filename} matches expectation.`,
				expected: priority,
				actual: guide?.priority ?? null,
			}),
		);
	}

	for (const [filename, category] of Object.entries(
		expectation.expectedCategories ?? {},
	)) {
		const guide = output.files.find(
			(entry) => entry.filename === filename,
		)?.guide;
		checks.push(
			makeCheck({
				id: `category:${filename}`,
				passed: guide?.classification.primaryCategory === category,
				message: `Category for ${filename} matches expectation.`,
				expected: category,
				actual: guide?.classification.primaryCategory ?? null,
			}),
		);
	}

	const expectedQuestions = expectation.expectedQuestionIncludes ?? {};
	for (const [filename, fragments] of Object.entries(expectedQuestions)) {
		const guide = output.files.find(
			(entry) => entry.filename === filename,
		)?.guide;
		const questionTexts = guide?.questions.map((entry) => entry.question) ?? [];
		for (const fragment of fragments) {
			checks.push(
				makeCheck({
					id: `question:${filename}:${fragment}`,
					passed: questionTexts.some((question) => question.includes(fragment)),
					message: `Question for ${filename} includes '${fragment}'.`,
					expected: fragment,
					actual: questionTexts,
				}),
			);
		}
	}

	if (expectation.expectedWarningsInclude) {
		const warnings = output.files.flatMap((entry) => entry.guide.warnings);
		for (const warning of expectation.expectedWarningsInclude) {
			checks.push(
				makeCheck({
					id: `warning:${warning}`,
					passed: warnings.some((entry) => entry.includes(warning)),
					message: `At least one guide warning includes '${warning}'.`,
					expected: warning,
					actual: warnings,
				}),
			);
		}
	}

	return checks;
}

function evaluateExpectationChecks(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkReviewGuideCaseOutput,
	externalExpectation?: BenchmarkReviewGuideExpectation,
): {
	score: BenchmarkReviewGuideExpectationScore;
	checks: readonly BenchmarkReviewGuideCheck[];
	diagnostics: readonly string[];
} {
	const structuredChecks = (
		benchmarkCase.reviewGuide?.fileChecks ?? []
	).flatMap((expectation) =>
		evaluateStructuredFileExpectation(output, expectation),
	);
	const externalChecks = externalExpectation
		? evaluateExternalExpectation(output, externalExpectation)
		: [];
	const defaultChecks =
		structuredChecks.length === 0 &&
		externalChecks.length === 0 &&
		benchmarkCase.source?.selectedFiles.length
			? [createSelectedSurfaceCheck(benchmarkCase, output)]
			: [];
	const checks = [...structuredChecks, ...externalChecks, ...defaultChecks];
	const diagnostics = checks
		.filter((check) => !check.passed)
		.map(
			(check) =>
				`${check.message} expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(check.actual)}`,
		);
	const matchedChecks = checks.filter((check) => check.passed).length;

	return {
		score: {
			checks: checks.length,
			matchedChecks,
			recall: recall(checks.length, matchedChecks),
			failures: diagnostics,
		},
		checks,
		diagnostics,
	};
}

function summarizeReviewGuideCase(
	benchmarkCase: BenchmarkCase,
): BenchmarkReviewGuideCaseOutput {
	const context = {
		title: benchmarkCase.description,
		labels: [],
		commitHeadlines: [],
	};
	const files = benchmarkCase.files.map((file) => {
		const diff = structuralDiff(file.before, file.after, {
			language: file.language,
			detectMoves: true,
		});
		return {
			benchmarkFile: file,
			diff,
			reviewInput: buildReviewInput(file, diff),
		};
	});
	const summary = summarizePrReview({
		context,
		files: files.map((entry) => entry.reviewInput),
	});
	return {
		summary,
		files: files.map((entry): BenchmarkReviewGuideFileOutput => {
			const classification = classifyReviewFile(entry.reviewInput);
			const guide = composeFileReviewGuide({
				context,
				file: entry.reviewInput,
				classification,
				diff: entry.diff,
			});
			const summaryEntry = findSummaryEntry(
				summary,
				entry.reviewInput.filename,
			);
			return {
				fileId: entry.benchmarkFile.id,
				filename: entry.reviewInput.filename,
				operationCount: entry.diff.operations.length,
				moveCount: entry.diff.moves.length,
				renameCount: entry.diff.renames.length,
				...(summaryEntry
					? {
							summaryEntry: {
								priority: summaryEntry.priority,
								primaryCategory: summaryEntry.classification.primaryCategory,
							},
						}
					: {}),
				guide,
			};
		}),
	};
}

export function evaluateReviewGuideCase(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkReviewGuideCaseOutput,
	externalExpectation?: BenchmarkReviewGuideExpectation,
): BenchmarkReviewGuideCaseEvaluation {
	const diagnostics: string[] = [];
	const queue = evaluateQueue(benchmarkCase, output, diagnostics);
	const signals = evaluateSignals(output, diagnostics);
	const expectations = evaluateExpectationChecks(
		benchmarkCase,
		output,
		externalExpectation,
	);
	diagnostics.push(...expectations.diagnostics);
	const passedChecks = expectations.checks.filter(
		(check) => check.passed,
	).length;
	const failedChecks = expectations.checks.length - passedChecks;

	return {
		status: "scored",
		totalChecks: expectations.checks.length,
		passedChecks,
		failedChecks,
		checks: expectations.checks,
		queue,
		signals,
		expectations: expectations.score,
		passed: diagnostics.length === 0 && failedChecks === 0,
		diagnostics,
	};
}

export function runReviewGuideCase(
	benchmarkCase: BenchmarkCase,
	externalExpectation?: BenchmarkReviewGuideExpectation,
): BenchmarkReviewGuideCaseReport {
	const output = summarizeReviewGuideCase(benchmarkCase);
	return {
		caseId: benchmarkCase.id,
		description: benchmarkCase.description,
		kind: benchmarkCase.kind,
		capabilities: benchmarkCase.capabilities,
		...(benchmarkCase.source ? { source: benchmarkCase.source } : {}),
		queue: output.summary.queue.map((entry) => ({
			filename: entry.filename,
			priority: entry.priority,
			category: entry.classification.primaryCategory,
		})),
		deprioritized: output.summary.deprioritized.map((entry) => ({
			filename: entry.filename,
			priority: entry.priority,
			category: entry.classification.primaryCategory,
		})),
		fileGuides: output.files.map((entry) => entry.guide),
		evaluation: evaluateReviewGuideCase(
			benchmarkCase,
			output,
			externalExpectation,
		),
		output,
	};
}

export function summarizeReviewGuideReports(
	reports: readonly BenchmarkReviewGuideCaseReport[],
): BenchmarkReviewGuideReportSummary {
	const totalChecks = reports.reduce(
		(total, report) => total + report.evaluation.totalChecks,
		0,
	);
	const passedChecks = reports.reduce(
		(total, report) => total + report.evaluation.passedChecks,
		0,
	);
	const failedChecks = reports.reduce(
		(total, report) => total + report.evaluation.failedChecks,
		0,
	);

	return {
		cases: reports.length,
		totalChecks,
		passedChecks,
		failedChecks,
		passRate: totalChecks === 0 ? 1 : roundNumber(passedChecks / totalChecks),
		passedCases: reports.filter((report) => report.evaluation.passed).length,
		failedCases: reports.filter((report) => !report.evaluation.passed).length,
		averageQueueRecall: average(
			reports.flatMap((report) =>
				report.evaluation.queue.queueRecall === null
					? []
					: [report.evaluation.queue.queueRecall],
			),
		),
		averageDeprioritizedRecall: average(
			reports.flatMap((report) =>
				report.evaluation.queue.deprioritizedRecall === null
					? []
					: [report.evaluation.queue.deprioritizedRecall],
			),
		),
		averageSelectedRecall: average(
			reports.flatMap((report) =>
				report.evaluation.queue.selectedRecall === null
					? []
					: [report.evaluation.queue.selectedRecall],
			),
		),
		averageMoveSignalRecall: average(
			reports.flatMap((report) =>
				report.evaluation.signals.moveSignalRecall === null
					? []
					: [report.evaluation.signals.moveSignalRecall],
			),
		),
		averageRenameSignalRecall: average(
			reports.flatMap((report) =>
				report.evaluation.signals.renameSignalRecall === null
					? []
					: [report.evaluation.signals.renameSignalRecall],
			),
		),
		averageBehaviorQuestionRecall: average(
			reports.flatMap((report) =>
				report.evaluation.signals.behaviorQuestionRecall === null
					? []
					: [report.evaluation.signals.behaviorQuestionRecall],
			),
		),
		averageExpectationRecall: average(
			reports.flatMap((report) =>
				report.evaluation.expectations.recall === null
					? []
					: [report.evaluation.expectations.recall],
			),
		),
	};
}

export function runReviewGuideSuite(
	benchmarkCases: readonly BenchmarkCase[],
	options?: {
		caseRoot?: string | undefined;
		expectations?:
			| Readonly<Record<string, BenchmarkReviewGuideExpectation>>
			| undefined;
	},
): BenchmarkReviewGuideReport {
	const cases = benchmarkCases.map((benchmarkCase) =>
		runReviewGuideCase(
			benchmarkCase,
			options?.expectations?.[benchmarkCase.id],
		),
	);
	return {
		version: "0.1.0",
		tool: "review-guide",
		caseRoot: options?.caseRoot ?? process.cwd(),
		generatedAt: new Date().toISOString(),
		cases,
		summary: summarizeReviewGuideReports(cases),
	};
}

export function formatReviewGuideDiagnostics(
	report: BenchmarkReviewGuideCaseReport,
) {
	return [
		`${report.caseId}: ${report.evaluation.passed ? "pass" : "fail"}`,
		`  queue recall=${report.evaluation.queue.queueRecall ?? "n/a"} selected=${report.evaluation.queue.selectedRecall ?? "n/a"} deprioritized=${report.evaluation.queue.deprioritizedRecall ?? "n/a"}`,
		`  signals move=${report.evaluation.signals.moveSignalRecall ?? "n/a"} rename=${report.evaluation.signals.renameSignalRecall ?? "n/a"} behavior=${report.evaluation.signals.behaviorQuestionRecall ?? "n/a"}`,
		...report.evaluation.diagnostics.map((entry) => `  - ${entry}`),
	].join("\n");
}
