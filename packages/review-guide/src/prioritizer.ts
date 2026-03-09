import { classifyReviewFile } from "./classifier.js";
import {
	buildReviewDiagnostics,
	diagnosticsCollectionsFromQueue,
} from "./diagnostics.js";
import type {
	EvidenceRef,
	FileClassification,
	PrReviewSummary,
	ReviewFileSummaryInput,
	ReviewPrioritizationInput,
	ReviewPriority,
	ReviewQueueEntry,
	ReviewQueueGroup,
	ReviewReason,
	ReviewScoreBreakdownEntry,
	ReviewTrustBand,
	RuleHit,
} from "./schemas.js";
import {
	REVIEW_GUIDE_RULE_VERSION,
	REVIEW_GUIDE_SCHEMA_VERSION,
} from "./schemas.js";

const PRIORITY_SORT_ORDER: Record<ReviewPriority, number> = {
	review_first: 0,
	manual_review: 1,
	review_next: 2,
	skim: 3,
	deprioritized: 4,
};

const DEPRIORITIZED_GROUP_LABELS = {
	docs: "Docs Only",
	generated: "Generated Artifacts",
	lockfile: "Lockfiles",
	vendored: "Vendored Code",
} as const;

const CATEGORY_SCORE = {
	binary: 32,
	config: 20,
	docs: -18,
	generated: -70,
	lockfile: -80,
	oversized: 28,
	parser_fallback: 0,
	source: 38,
	test: 24,
	unknown: 10,
	vendored: -85,
} as const;

const STATUS_SCORE = {
	added: 20,
	modified: 18,
	removed: 12,
	renamed: 16,
	unknown: 8,
} as const;

const isManualReviewCategory = (
	category: FileClassification["primaryCategory"],
) => {
	return category === "binary" || category === "oversized";
};

const isDeprioritizedCategory = (
	category: FileClassification["primaryCategory"],
) => {
	return (
		category === "docs" ||
		category === "generated" ||
		category === "lockfile" ||
		category === "vendored"
	);
};

const hasSemanticMetadata = (file: ReviewFileSummaryInput) =>
	file.reductionPercent !== undefined ||
	file.operations !== undefined ||
	file.moveCount !== undefined ||
	file.renameCount !== undefined ||
	file.language !== undefined;

const hasSemanticFailureWarning = (file: ReviewFileSummaryInput) =>
	(file.warnings ?? []).some((warning) =>
		warning.startsWith("SEMANTIC SUMMARY FAILED"),
	);

const changeMagnitudeScore = (file: ReviewFileSummaryInput) => {
	const changeCount =
		file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0);

	if (changeCount <= 0) {
		return 0;
	}
	if (changeCount <= 10) {
		return 8;
	}
	if (changeCount <= 50) {
		return 15;
	}
	if (changeCount <= 200) {
		return 20;
	}
	return 16;
};

const makeFileEvidence = (file: ReviewFileSummaryInput): EvidenceRef => ({
	kind: "file_summary",
	id: `file:${file.filename}`,
	file: file.filename,
	label: file.filename,
});

const makeWarningEvidence = (
	file: ReviewFileSummaryInput,
	warning: string,
	index: number,
): EvidenceRef => ({
	kind: "warning",
	id: `warning:${file.filename}:${index + 1}`,
	file: file.filename,
	label: warning,
});

const makeReason = ({
	evidence,
	file,
	message,
	ruleId,
	trustBand,
}: {
	evidence: readonly EvidenceRef[];
	file: ReviewFileSummaryInput;
	message: string;
	ruleId: string;
	trustBand: ReviewTrustBand;
}): ReviewReason => ({
	id: `${ruleId}:${file.filename}`,
	scope: "pr",
	message,
	trustBand,
	ruleId,
	evidence: [...evidence],
});

const makeRuleHit = ({
	evidence,
	file,
	summary,
	ruleId,
	weight,
}: {
	evidence: readonly EvidenceRef[];
	file: ReviewFileSummaryInput;
	summary: string;
	ruleId: string;
	weight?: number;
}): RuleHit => ({
	ruleId,
	stage: "prioritization",
	summary,
	weight,
	evidence: evidence.length > 0 ? [...evidence] : [makeFileEvidence(file)],
});

const makeScoreEntry = ({
	file,
	id,
	label,
	score,
}: {
	file: ReviewFileSummaryInput;
	id: string;
	label: string;
	score: number;
}): ReviewScoreBreakdownEntry => ({
	id: `${id}:${file.filename}`,
	file: file.filename,
	label,
	score,
});

const buildThemeSummary = ({
	deprioritizedCount,
	manualReviewCount,
	parserFallbackCount,
	refactorSignalCount,
	reviewFirstCount,
	sourceCount,
	testCount,
}: {
	deprioritizedCount: number;
	manualReviewCount: number;
	parserFallbackCount: number;
	refactorSignalCount: number;
	reviewFirstCount: number;
	sourceCount: number;
	testCount: number;
}) => {
	const themes: string[] = [];

	if (reviewFirstCount > 0) {
		themes.push(`${reviewFirstCount} file(s) should be reviewed first.`);
	}
	if (sourceCount > 0) {
		themes.push(
			`${sourceCount} source file(s) carry active code-review weight.`,
		);
	}
	if (testCount > 0) {
		themes.push(`${testCount} test file(s) changed in this PR.`);
	}
	if (manualReviewCount > 0) {
		themes.push(
			`${manualReviewCount} file(s) require manual review because semantic guidance is limited.`,
		);
	}
	if (parserFallbackCount > 0) {
		themes.push(
			`Semantic confidence is reduced for ${parserFallbackCount} file(s).`,
		);
	}
	if (refactorSignalCount > 0) {
		themes.push(
			`${refactorSignalCount} file(s) include semantic move or rename signals.`,
		);
	}
	if (deprioritizedCount > 0) {
		themes.push(
			`${deprioritizedCount} file(s) matched low-signal buckets and can be collapsed by default.`,
		);
	}

	return themes;
};

interface PrioritizedFile {
	readonly classification: FileClassification;
	readonly diagnostics: {
		readonly ruleHits: RuleHit[];
		readonly scoreBreakdown: ReviewScoreBreakdownEntry[];
	};
	readonly entry: ReviewQueueEntry;
	readonly file: ReviewFileSummaryInput;
	readonly priority: ReviewPriority;
	readonly score: number;
}

interface ScoreContext {
	readonly categoryScore: number;
	readonly classification: FileClassification;
	readonly file: ReviewFileSummaryInput;
	readonly fileEvidence: EvidenceRef;
	readonly moveScore: number;
	readonly parserFallbackScore: number;
	readonly renameGroupScore: number;
	readonly renameScore: number;
	readonly scoreBreakdown: ReviewScoreBreakdownEntry[];
	readonly sizeScore: number;
	readonly statusScore: number;
	readonly structuralCompressionScore: number;
	readonly totalScore: number;
	readonly warningEvidence: EvidenceRef[];
	readonly warningScore: number;
}

const compressionScore = (file: ReviewFileSummaryInput) => {
	if (file.reductionPercent === undefined) {
		return 0;
	}
	if (file.reductionPercent >= 60) {
		return 6;
	}
	if (file.reductionPercent >= 30) {
		return 3;
	}
	return 0;
};

const buildScoreContext = (
	file: ReviewFileSummaryInput,
	classification: FileClassification,
): ScoreContext => {
	const fileEvidence = makeFileEvidence(file);
	const warningEvidence = (file.warnings ?? []).map((warning, index) =>
		makeWarningEvidence(file, warning, index),
	);
	const statusScore = STATUS_SCORE[file.status] ?? STATUS_SCORE.unknown;
	const categoryScore =
		CATEGORY_SCORE[classification.primaryCategory] ?? CATEGORY_SCORE.unknown;
	const sizeScore = changeMagnitudeScore(file);
	const warningScore = Math.min((file.warnings ?? []).length * 4, 12);
	const renameScore = file.previousFilename ? 6 : 0;
	const parserFallbackScore = classification.categories.includes(
		"parser_fallback",
	)
		? 18
		: 0;
	const moveScore = Math.min((file.moveCount ?? 0) * 6, 18);
	const renameGroupScore = Math.min((file.renameCount ?? 0) * 5, 15);
	const structuralCompressionScore = compressionScore(file);
	const scoreBreakdown: ReviewScoreBreakdownEntry[] = [
		makeScoreEntry({
			file,
			id: "status",
			label: `Status ${file.status}`,
			score: statusScore,
		}),
		makeScoreEntry({
			file,
			id: "category",
			label: `Category ${classification.primaryCategory}`,
			score: categoryScore,
		}),
		makeScoreEntry({
			file,
			id: "change-size",
			label: "Change magnitude",
			score: sizeScore,
		}),
	];

	if (warningScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "warnings",
				label: "Warning density",
				score: warningScore,
			}),
		);
	}
	if (renameScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "rename",
				label: "Rename-aware file",
				score: renameScore,
			}),
		);
	}
	if (parserFallbackScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "parser-fallback",
				label: "Parser fallback escalation",
				score: parserFallbackScore,
			}),
		);
	}
	if (moveScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "moves",
				label: "Detected semantic moves",
				score: moveScore,
			}),
		);
	}
	if (renameGroupScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "rename-groups",
				label: "Detected semantic renames",
				score: renameGroupScore,
			}),
		);
	}
	if (structuralCompressionScore > 0) {
		scoreBreakdown.push(
			makeScoreEntry({
				file,
				id: "reduction",
				label: "Semantic reduction percent",
				score: structuralCompressionScore,
			}),
		);
	}

	const totalScore = scoreBreakdown.reduce(
		(total, entry) => total + entry.score,
		0,
	);

	return {
		categoryScore,
		classification,
		file,
		fileEvidence,
		moveScore,
		parserFallbackScore,
		renameGroupScore,
		renameScore,
		scoreBreakdown,
		sizeScore,
		statusScore,
		structuralCompressionScore,
		totalScore,
		warningEvidence,
		warningScore,
	};
};

const pushClassificationReason = (
	context: ScoreContext,
	reasons: ReviewReason[],
	ruleHits: RuleHit[],
) => {
	reasons.push(
		makeReason({
			evidence: [context.fileEvidence],
			file: context.file,
			message:
				context.classification.reasons[0] ??
				"Deterministic file classification applied.",
			ruleId: `classification:${context.classification.primaryCategory}`,
			trustBand: context.classification.trustBand,
		}),
	);

	ruleHits.push(
		makeRuleHit({
			evidence: [context.fileEvidence],
			file: context.file,
			summary: `Classified ${context.file.filename} as ${context.classification.primaryCategory}.`,
			ruleId: `classification:${context.classification.primaryCategory}`,
			weight: context.categoryScore,
		}),
	);
};

const pushSemanticSignalReasons = (
	context: ScoreContext,
	reasons: ReviewReason[],
	ruleHits: RuleHit[],
) => {
	if (context.classification.categories.includes("parser_fallback")) {
		reasons.push(
			makeReason({
				evidence:
					context.warningEvidence.length > 0
						? context.warningEvidence
						: [context.fileEvidence],
				file: context.file,
				message:
					"Semantic parser fallback detected; review with lower trust in semantic grouping.",
				ruleId: "priority:parser_fallback",
				trustBand: "low_confidence",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence:
					context.warningEvidence.length > 0
						? context.warningEvidence
						: [context.fileEvidence],
				file: context.file,
				summary:
					"Escalated priority because parser fallback reduces semantic confidence.",
				ruleId: "priority:parser_fallback",
				weight: context.parserFallbackScore,
			}),
		);
	}

	if (
		(context.file.moveCount ?? 0) > 0 ||
		(context.file.renameCount ?? 0) > 0
	) {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Semantic summary reports ${context.file.moveCount ?? 0} move group(s) and ${context.file.renameCount ?? 0} rename group(s).`,
				ruleId: "priority:semantic_refactor_signals",
				trustBand: "deterministic_inference",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary:
					"Elevated by semantic move/rename signals from the summary metadata.",
				ruleId: "priority:semantic_refactor_signals",
				weight: context.moveScore + context.renameGroupScore,
			}),
		);
	}

	if (context.structuralCompressionScore > 0) {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Semantic reduction percent is ${context.file.reductionPercent}%, suggesting structurally-compressed churn.`,
				ruleId: "priority:reduction_percent",
				trustBand: "deterministic_inference",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: `Semantic reduction percent ${context.file.reductionPercent}% elevated prioritization.`,
				ruleId: "priority:reduction_percent",
				weight: context.structuralCompressionScore,
			}),
		);
	}
};

const determinePriority = (
	classification: FileClassification,
	score: number,
): ReviewPriority => {
	if (isManualReviewCategory(classification.primaryCategory)) {
		return "manual_review";
	}
	if (isDeprioritizedCategory(classification.primaryCategory)) {
		return "deprioritized";
	}
	if (score >= 70) {
		return "review_first";
	}
	if (score >= 45) {
		return "review_next";
	}
	return "skim";
};

const pushBucketReasons = (
	context: ScoreContext,
	priority: ReviewPriority,
	reasons: ReviewReason[],
	ruleHits: RuleHit[],
) => {
	if (priority === "manual_review") {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message:
					"Manual review required because semantic guidance is limited for this file type or size.",
				ruleId: `priority:${context.classification.primaryCategory}:manual_review`,
				trustBand: "structural_fact",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: "Assigned to manual-review bucket.",
				ruleId: `priority:${context.classification.primaryCategory}:manual_review`,
				weight: context.categoryScore,
			}),
		);
		return;
	}

	if (priority === "deprioritized") {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message:
					"Deprioritized because the file matched a low-signal bucket that is usually skimmable.",
				ruleId: `priority:${context.classification.primaryCategory}:deprioritized`,
				trustBand: "deterministic_inference",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: "Assigned to deprioritized bucket.",
				ruleId: `priority:${context.classification.primaryCategory}:deprioritized`,
				weight: context.categoryScore,
			}),
		);
		return;
	}

	const changeCount =
		context.file.changes ??
		(context.file.additions ?? 0) + (context.file.deletions ?? 0);

	if (changeCount > 0) {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Change magnitude contributes ${context.sizeScore} prioritization points.`,
				ruleId: "priority:change_magnitude",
				trustBand: "deterministic_inference",
			}),
		);

		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: `Change magnitude contributed ${context.sizeScore} prioritization points.`,
				ruleId: "priority:change_magnitude",
				weight: context.sizeScore,
			}),
		);
	}

	ruleHits.push(
		makeRuleHit({
			evidence: [context.fileEvidence],
			file: context.file,
			summary: `Computed total prioritization score ${context.totalScore}.`,
			ruleId: "priority:total_score",
			weight: context.totalScore,
		}),
	);
};

const pushPriorityOutcomeReason = (
	context: ScoreContext,
	priority: ReviewPriority,
	reasons: ReviewReason[],
	ruleHits: RuleHit[],
) => {
	if (priority === "review_first") {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Promoted to review-first with deterministic score ${context.totalScore}.`,
				ruleId: "priority:review_first",
				trustBand:
					context.classification.trustBand === "low_confidence"
						? "low_confidence"
						: "deterministic_inference",
			}),
		);
		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: `File promoted to review-first with score ${context.totalScore}.`,
				ruleId: "priority:review_first",
				weight: context.totalScore,
			}),
		);
		return;
	}

	if (priority === "review_next") {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Ranked for active review with deterministic score ${context.totalScore}.`,
				ruleId: "priority:review_next",
				trustBand: "deterministic_inference",
			}),
		);
		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: `File ranked for active review with score ${context.totalScore}.`,
				ruleId: "priority:review_next",
				weight: context.totalScore,
			}),
		);
		return;
	}

	if (priority === "skim") {
		reasons.push(
			makeReason({
				evidence: [context.fileEvidence],
				file: context.file,
				message: `Skim bucket assigned with deterministic score ${context.totalScore}.`,
				ruleId: "priority:skim",
				trustBand: "deterministic_inference",
			}),
		);
		ruleHits.push(
			makeRuleHit({
				evidence: [context.fileEvidence],
				file: context.file,
				summary: `File assigned to skim bucket with score ${context.totalScore}.`,
				ruleId: "priority:skim",
				weight: context.totalScore,
			}),
		);
	}
};

const prioritizeFile = (file: ReviewFileSummaryInput): PrioritizedFile => {
	const classification = classifyReviewFile(file);
	const context = buildScoreContext(file, classification);
	const reasons: ReviewReason[] = [];
	const ruleHits: RuleHit[] = [];
	const priority = determinePriority(classification, context.totalScore);

	pushClassificationReason(context, reasons, ruleHits);
	pushSemanticSignalReasons(context, reasons, ruleHits);
	pushBucketReasons(context, priority, reasons, ruleHits);
	pushPriorityOutcomeReason(context, priority, reasons, ruleHits);

	return {
		classification,
		diagnostics: {
			ruleHits,
			scoreBreakdown: context.scoreBreakdown,
		},
		entry: {
			filename: file.filename,
			priority,
			classification,
			reasons,
			warnings: file.warnings ?? [],
		},
		file,
		priority,
		score: context.totalScore,
	};
};

const comparePrioritizedFiles = (
	left: PrioritizedFile,
	right: PrioritizedFile,
) =>
	PRIORITY_SORT_ORDER[left.priority] - PRIORITY_SORT_ORDER[right.priority] ||
	right.score - left.score ||
	left.file.filename.localeCompare(right.file.filename);

const buildDeprioritizedGroups = (entries: readonly ReviewQueueEntry[]) => {
	const grouped = new Map<string, ReviewQueueEntry[]>();

	for (const entry of entries) {
		const groupId = entry.classification.primaryCategory;
		const existing = grouped.get(groupId) ?? [];
		existing.push(entry);
		grouped.set(groupId, existing);
	}

	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(
			([id, groupEntries]): ReviewQueueGroup => ({
				id,
				label:
					DEPRIORITIZED_GROUP_LABELS[
						id as keyof typeof DEPRIORITIZED_GROUP_LABELS
					] ?? id,
				entries: [...groupEntries].sort((left, right) =>
					left.filename.localeCompare(right.filename),
				),
			}),
		);
};

const buildWarnings = ({
	deprioritizedCount,
	fileCount,
	manualReviewCount,
	missingSemanticCount,
	parserFallbackCount,
	semanticFailureCount,
	testCount,
	sourceCount,
}: {
	deprioritizedCount: number;
	fileCount: number;
	manualReviewCount: number;
	missingSemanticCount: number;
	parserFallbackCount: number;
	semanticFailureCount: number;
	testCount: number;
	sourceCount: number;
}) => {
	const warnings: string[] = [];

	if (parserFallbackCount > 0) {
		warnings.push(
			`${parserFallbackCount} file(s) fell back to low-confidence semantic parsing.`,
		);
	}
	if (manualReviewCount > 0) {
		warnings.push(
			`${manualReviewCount} file(s) require manual/native review because they are binary or oversized.`,
		);
	}
	if (semanticFailureCount > 0) {
		warnings.push(
			`${semanticFailureCount} file(s) reported semantic summary failures; prioritization is degraded to warning-aware heuristics.`,
		);
	}
	if (missingSemanticCount > 0) {
		warnings.push(
			`${missingSemanticCount} file(s) are missing semantic summary metadata; prioritization is using path and churn heuristics only.`,
		);
	}
	if (fileCount > 0 && deprioritizedCount === fileCount) {
		warnings.push(
			"All changed files matched deprioritized buckets; verify the PR is mostly generated, vendored, lockfile, or docs churn.",
		);
	}
	if (sourceCount > 0 && testCount === 0) {
		warnings.push(
			"Source changes are present without matching test-file changes in the PR.",
		);
	}

	return warnings;
};

const buildDiagnostics = (prioritizedFiles: readonly PrioritizedFile[]) =>
	buildReviewDiagnostics({
		expectedRuleIds: prioritizedFiles.flatMap((item) =>
			item.entry.reasons.map((reason) => reason.ruleId),
		),
		ruleHits: prioritizedFiles.flatMap((item) => item.diagnostics.ruleHits),
		scoreBreakdown: prioritizedFiles.flatMap(
			(item) => item.diagnostics.scoreBreakdown,
		),
		traceCollections: prioritizedFiles.flatMap((item) =>
			diagnosticsCollectionsFromQueue(item.entry.reasons),
		),
		trustBands: prioritizedFiles.flatMap((item) => [
			item.classification.trustBand,
			...item.entry.reasons.map((reason) => reason.trustBand),
		]),
	});

export const summarizePrReview = (
	input: ReviewPrioritizationInput,
): PrReviewSummary => {
	const prioritizedFiles = input.files
		.map(prioritizeFile)
		.sort(comparePrioritizedFiles);

	const queue = prioritizedFiles
		.filter((item) => item.priority !== "deprioritized")
		.map((item) => item.entry);
	const deprioritized = prioritizedFiles
		.filter((item) => item.priority === "deprioritized")
		.map((item) => item.entry);

	const reviewFirstCount = queue.filter(
		(entry) => entry.priority === "review_first",
	).length;
	const manualReviewCount = queue.filter(
		(entry) => entry.priority === "manual_review",
	).length;
	const parserFallbackCount = prioritizedFiles.filter((item) =>
		item.classification.categories.includes("parser_fallback"),
	).length;
	const deprioritizedCount = deprioritized.length;
	const refactorSignalCount = prioritizedFiles.filter(
		(item) =>
			(item.file.moveCount ?? 0) > 0 || (item.file.renameCount ?? 0) > 0,
	).length;
	const sourceCount = prioritizedFiles.filter(
		(item) => item.classification.primaryCategory === "source",
	).length;
	const missingSemanticCount = prioritizedFiles.filter(
		(item) =>
			!(
				item.file.binary ||
				item.file.oversized ||
				hasSemanticMetadata(item.file)
			) &&
			(item.file.warnings ?? []).length === 0 &&
			!hasSemanticFailureWarning(item.file),
	).length;
	const semanticFailureCount = prioritizedFiles.filter((item) =>
		hasSemanticFailureWarning(item.file),
	).length;
	const testCount = prioritizedFiles.filter(
		(item) => item.classification.primaryCategory === "test",
	).length;

	return {
		version: REVIEW_GUIDE_SCHEMA_VERSION,
		ruleVersion: REVIEW_GUIDE_RULE_VERSION,
		themes: buildThemeSummary({
			deprioritizedCount,
			manualReviewCount,
			parserFallbackCount,
			refactorSignalCount,
			reviewFirstCount,
			sourceCount,
			testCount,
		}),
		queue,
		deprioritized,
		deprioritizedGroups: buildDeprioritizedGroups(deprioritized),
		warnings: buildWarnings({
			deprioritizedCount,
			fileCount: prioritizedFiles.length,
			manualReviewCount,
			missingSemanticCount,
			parserFallbackCount,
			semanticFailureCount,
			sourceCount,
			testCount,
		}),
		diagnostics: buildDiagnostics(prioritizedFiles),
	};
};
