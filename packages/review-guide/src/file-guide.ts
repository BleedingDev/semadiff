import type {
	DiffDocument,
	DiffOperation,
	MoveGroup,
	Range,
	RenameGroup,
} from "@semadiff/core";

import {
	buildReviewDiagnostics,
	diagnosticsCollectionsFromGuide,
} from "./diagnostics.js";
import { summarizePrReview } from "./prioritizer.js";
import type {
	EvidenceRef,
	FileReviewGuide,
	FileReviewGuideInput,
	ReviewPriority,
	ReviewQuestion,
	ReviewReason,
	ReviewTrustBand,
	RuleHit,
} from "./schemas.js";
import {
	REVIEW_GUIDE_RULE_VERSION,
	REVIEW_GUIDE_SCHEMA_VERSION,
} from "./schemas.js";

const collapseWhitespace = (value: string) =>
	value.replaceAll(/\s+/gu, " ").trim();

const normalizeCosmeticText = (value: string) =>
	collapseWhitespace(value).replaceAll(/\s*([=,:;()[\]{}])\s*/gu, "$1");

const lineSpanForRange = (
	range: Range | undefined,
): EvidenceRef["oldLineSpan"] | undefined => {
	if (range === undefined) {
		return undefined;
	}

	return {
		startLine: range.start.line,
		endLine: range.end.line,
	};
};

const makeFileEvidence = (input: FileReviewGuideInput): EvidenceRef => ({
	kind: "file_summary",
	id: `file:${input.file.filename}`,
	file: input.file.filename,
	label: input.file.filename,
});

const makeWarningEvidence = (
	input: FileReviewGuideInput,
	warning: string,
	index: number,
): EvidenceRef => ({
	kind: "warning",
	id: `warning:${input.file.filename}:${index + 1}`,
	file: input.file.filename,
	label: warning,
});

const makeOperationEvidence = (
	input: FileReviewGuideInput,
	operation: DiffOperation,
): EvidenceRef => ({
	kind: "operation",
	id: operation.id,
	file: input.file.filename,
	label: `${operation.type} ${operation.id}`,
	oldLineSpan: lineSpanForRange(operation.oldRange),
	newLineSpan: lineSpanForRange(operation.newRange),
});

const makeMoveEvidence = (
	input: FileReviewGuideInput,
	move: MoveGroup,
): EvidenceRef => ({
	kind: "move",
	id: move.id,
	file: input.file.filename,
	label: `move ${move.id}`,
	oldLineSpan: lineSpanForRange(move.oldRange),
	newLineSpan: lineSpanForRange(move.newRange),
});

const makeRenameEvidence = (
	input: FileReviewGuideInput,
	rename: RenameGroup,
): EvidenceRef => ({
	kind: "rename",
	id: rename.id,
	file: input.file.filename,
	label: `${rename.from} -> ${rename.to}`,
});

const makeReason = ({
	evidence,
	input,
	message,
	ruleId,
	trustBand,
}: {
	evidence: readonly EvidenceRef[];
	input: FileReviewGuideInput;
	message: string;
	ruleId: string;
	trustBand: ReviewTrustBand;
}): ReviewReason => ({
	id: `${ruleId}:${input.file.filename}`,
	scope: "file",
	message,
	trustBand,
	ruleId,
	evidence: [...evidence],
});

const makeQuestion = ({
	evidence,
	input,
	question,
	rationale,
	ruleId,
	suggestedAction,
	trustBand,
}: {
	evidence: readonly EvidenceRef[];
	input: FileReviewGuideInput;
	question: string;
	rationale: string;
	ruleId: string;
	suggestedAction: ReviewQuestion["suggestedAction"];
	trustBand: ReviewTrustBand;
}): ReviewQuestion => ({
	id: `${ruleId}:${input.file.filename}`,
	question,
	rationale,
	trustBand,
	suggestedAction,
	ruleId,
	evidence: [...evidence],
});

const makeRuleHit = ({
	evidence,
	input,
	summary,
	ruleId,
	weight,
}: {
	evidence: readonly EvidenceRef[];
	input: FileReviewGuideInput;
	summary: string;
	ruleId: string;
	weight?: number;
}): RuleHit => ({
	ruleId,
	stage: "guidance",
	summary,
	weight,
	evidence: evidence.length > 0 ? [...evidence] : [makeFileEvidence(input)],
});

const countOperationTypes = (diff: DiffDocument) => ({
	delete: diff.operations.filter((operation) => operation.type === "delete")
		.length,
	insert: diff.operations.filter((operation) => operation.type === "insert")
		.length,
	move: diff.operations.filter((operation) => operation.type === "move").length,
	update: diff.operations.filter((operation) => operation.type === "update")
		.length,
});

const isWhitespaceOnlyUpdate = (operation: DiffOperation) => {
	if (operation.type !== "update") {
		return false;
	}
	if (operation.oldText === undefined || operation.newText === undefined) {
		return false;
	}

	return (
		normalizeCosmeticText(operation.oldText) ===
		normalizeCosmeticText(operation.newText)
	);
};

const isCosmeticLikely = (diff: DiffDocument) => {
	if (
		diff.operations.length === 0 ||
		diff.moves.length > 0 ||
		diff.renames.length > 0
	) {
		return false;
	}

	return diff.operations.every(isWhitespaceOnlyUpdate);
};

const isManualReview = (priority: ReviewPriority) =>
	priority === "manual_review";

const buildSummary = ({
	cosmeticLikely,
	hasMoveSignals,
	hasRenameSignals,
	input,
	manualReview,
	operationCounts,
	parserFallback,
}: {
	cosmeticLikely: boolean;
	hasMoveSignals: boolean;
	hasRenameSignals: boolean;
	input: FileReviewGuideInput;
	manualReview: boolean;
	operationCounts: ReturnType<typeof countOperationTypes>;
	parserFallback: boolean;
}) => {
	if (manualReview && parserFallback) {
		return "Manual native review recommended; semantic guidance is low-confidence.";
	}
	if (manualReview) {
		return "Manual native review recommended because semantic guidance is limited.";
	}
	if (cosmeticLikely) {
		return "Likely cosmetic update with whitespace-only structural edits.";
	}
	if (hasMoveSignals && hasRenameSignals) {
		return "Refactor-oriented change with move and rename signals.";
	}
	if (hasMoveSignals) {
		return "Refactor-oriented change with semantic move groups.";
	}
	if (hasRenameSignals) {
		return "Rename-oriented update with grouped identifier changes.";
	}
	if (operationCounts.insert > 0 || operationCounts.delete > 0) {
		return "Behavioral change candidate spanning insert/delete operations.";
	}
	return `Structured update touching ${input.diff.operations.length} operation(s).`;
};

const pushOperationShapeReason = ({
	input,
	operationCounts,
	operationEvidence,
	reasons,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	operationCounts: ReturnType<typeof countOperationTypes>;
	operationEvidence: EvidenceRef[];
	reasons: ReviewReason[];
	ruleHits: RuleHit[];
}) => {
	if (input.diff.operations.length === 0) {
		reasons.push(
			makeReason({
				evidence: [makeFileEvidence(input)],
				input,
				message: "No structural operations were produced for this file diff.",
				ruleId: "guidance:no_operations",
				trustBand: "deterministic_inference",
			}),
		);
		ruleHits.push(
			makeRuleHit({
				evidence: [makeFileEvidence(input)],
				input,
				summary: "No structural operations were produced for this file diff.",
				ruleId: "guidance:no_operations",
			}),
		);
		return;
	}

	const message = `Diff contains ${operationCounts.update} update(s), ${operationCounts.insert} insert(s), ${operationCounts.delete} delete(s), and ${operationCounts.move} move op(s).`;
	reasons.push(
		makeReason({
			evidence: operationEvidence.slice(0, 3),
			input,
			message,
			ruleId: "guidance:operation_shape",
			trustBand: "deterministic_inference",
		}),
	);

	ruleHits.push(
		makeRuleHit({
			evidence: operationEvidence.slice(0, 3),
			input,
			summary: message,
			ruleId: "guidance:operation_shape",
			weight: input.diff.operations.length,
		}),
	);
};

const pushManualReviewGuidance = ({
	input,
	reasons,
	questions,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	reasons: ReviewReason[];
	questions: ReviewQuestion[];
	ruleHits: RuleHit[];
}) => {
	const evidence = [makeFileEvidence(input)];

	reasons.push(
		makeReason({
			evidence,
			input,
			message:
				"This file should be reviewed in the native diff because semantic guidance is structurally limited.",
			ruleId: "guidance:manual_review",
			trustBand: "structural_fact",
		}),
	);
	questions.push(
		makeQuestion({
			evidence,
			input,
			question:
				"Inspect this file in the native diff before trusting semantic guidance.",
			rationale:
				"Binary or oversized files can hide relevant changes outside the semantic view.",
			ruleId: "question:manual_review",
			suggestedAction: "open_native_diff",
			trustBand: "structural_fact",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence,
			input,
			summary: "Manual review guidance emitted for limited semantic coverage.",
			ruleId: "guidance:manual_review",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence,
			input,
			summary: "Manual review question emitted.",
			ruleId: "question:manual_review",
		}),
	);
};

const pushParserFallbackGuidance = ({
	input,
	questions,
	reasons,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	questions: ReviewQuestion[];
	reasons: ReviewReason[];
	ruleHits: RuleHit[];
}) => {
	const evidence = (input.file.warnings ?? []).map((warning, index) =>
		makeWarningEvidence(input, warning, index),
	);

	reasons.push(
		makeReason({
			evidence,
			input,
			message:
				"Parser fallback reduces semantic trust; verify grouping and unchanged context manually.",
			ruleId: "guidance:parser_fallback",
			trustBand: "low_confidence",
		}),
	);
	questions.push(
		makeQuestion({
			evidence,
			input,
			question:
				"Verify this file in the native diff because semantic grouping is low-confidence.",
			rationale:
				"Parser fallback means the file summary may miss or misgroup structural boundaries.",
			ruleId: "question:parser_fallback",
			suggestedAction: "open_native_diff",
			trustBand: "low_confidence",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence,
			input,
			summary: "Low-confidence guidance emitted due to parser fallback.",
			ruleId: "guidance:parser_fallback",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence,
			input,
			summary: "Parser-fallback verification question emitted.",
			ruleId: "question:parser_fallback",
		}),
	);
};

const pushMoveGuidance = ({
	input,
	moveEvidence,
	questions,
	reasons,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	moveEvidence: EvidenceRef[];
	questions: ReviewQuestion[];
	reasons: ReviewReason[];
	ruleHits: RuleHit[];
}) => {
	reasons.push(
		makeReason({
			evidence: moveEvidence,
			input,
			message: `Semantic diff linked ${input.diff.moves.length} move group(s) across this file.`,
			ruleId: "guidance:moves",
			trustBand: "deterministic_inference",
		}),
	);
	questions.push(
		makeQuestion({
			evidence: moveEvidence,
			input,
			question: "Check that moved blocks preserve behavior after relocation.",
			rationale: "Move groups can hide small edits inside relocated code.",
			ruleId: "question:moves",
			suggestedAction: "inspect_moves",
			trustBand: "deterministic_inference",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: moveEvidence,
			input,
			summary: "Move-oriented guidance emitted from semantic move groups.",
			ruleId: "guidance:moves",
			weight: input.diff.moves.length,
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: moveEvidence,
			input,
			summary: "Move verification question emitted.",
			ruleId: "question:moves",
			weight: input.diff.moves.length,
		}),
	);
};

const pushRenameGuidance = ({
	input,
	questions,
	reasons,
	renameEvidence,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	questions: ReviewQuestion[];
	reasons: ReviewReason[];
	renameEvidence: EvidenceRef[];
	ruleHits: RuleHit[];
}) => {
	reasons.push(
		makeReason({
			evidence: renameEvidence,
			input,
			message: `Semantic diff grouped ${input.diff.renames.length} rename pattern(s) in this file.`,
			ruleId: "guidance:renames",
			trustBand: "deterministic_inference",
		}),
	);
	questions.push(
		makeQuestion({
			evidence: renameEvidence,
			input,
			question:
				"Confirm grouped renames are semantic-only and not hiding behavioral edits.",
			rationale:
				"Rename groups often compress broad identifier changes into one structural update.",
			ruleId: "question:renames",
			suggestedAction: "inspect_renames",
			trustBand: "deterministic_inference",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: renameEvidence,
			input,
			summary: "Rename-oriented guidance emitted from semantic rename groups.",
			ruleId: "guidance:renames",
			weight: input.diff.renames.length,
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: renameEvidence,
			input,
			summary: "Rename verification question emitted.",
			ruleId: "question:renames",
			weight: input.diff.renames.length,
		}),
	);
};

const pushCosmeticGuidance = ({
	input,
	operationEvidence,
	questions,
	reasons,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	operationEvidence: EvidenceRef[];
	questions: ReviewQuestion[];
	reasons: ReviewReason[];
	ruleHits: RuleHit[];
}) => {
	reasons.push(
		makeReason({
			evidence: operationEvidence,
			input,
			message:
				"All operations are whitespace-only updates with no move or rename groups, so the change is likely cosmetic.",
			ruleId: "guidance:cosmetic_likely",
			trustBand: "deterministic_inference",
		}),
	);
	questions.push(
		makeQuestion({
			evidence: operationEvidence,
			input,
			question: "Confirm the file is formatting-only and safe to skim.",
			rationale:
				"Whitespace-only update operations usually indicate low-risk cosmetic churn.",
			ruleId: "question:cosmetic_likely",
			suggestedAction: "skip_by_default",
			trustBand: "deterministic_inference",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: operationEvidence,
			input,
			summary:
				"Cosmetic-likely guidance emitted for whitespace-only update operations.",
			ruleId: "guidance:cosmetic_likely",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: operationEvidence,
			input,
			summary: "Cosmetic-likely skip question emitted.",
			ruleId: "question:cosmetic_likely",
		}),
	);
};

const pushBehaviorQuestion = ({
	input,
	operationCounts,
	operationEvidence,
	questions,
	ruleHits,
}: {
	input: FileReviewGuideInput;
	operationCounts: ReturnType<typeof countOperationTypes>;
	operationEvidence: EvidenceRef[];
	questions: ReviewQuestion[];
	ruleHits: RuleHit[];
}) => {
	const touchesBehavior =
		operationCounts.insert > 0 ||
		operationCounts.delete > 0 ||
		operationCounts.update > 0;

	if (!touchesBehavior || input.classification.primaryCategory !== "source") {
		return;
	}

	questions.push(
		makeQuestion({
			evidence: operationEvidence.slice(0, 3),
			input,
			question:
				"Were tests updated for the behavioral surface touched by this file?",
			rationale:
				"Source-file inserts, deletes, and updates usually deserve a quick test-coverage check.",
			ruleId: "question:check_tests",
			suggestedAction: "check_tests",
			trustBand: "contextual_hint",
		}),
	);
	ruleHits.push(
		makeRuleHit({
			evidence: operationEvidence.slice(0, 3),
			input,
			summary:
				"Behavior-oriented test-coverage question emitted for source file operations.",
			ruleId: "question:check_tests",
		}),
	);
};

const buildDiagnostics = ({
	classificationTrustBand,
	filePrioritySummary,
	questions,
	reasons,
	ruleHits,
}: {
	classificationTrustBand: ReviewTrustBand;
	filePrioritySummary: ReturnType<typeof summarizePrReview>;
	questions: ReviewQuestion[];
	reasons: ReviewReason[];
	ruleHits: RuleHit[];
}) =>
	buildReviewDiagnostics({
		expectedRuleIds: [
			...reasons.map((reason) => reason.ruleId),
			...questions.map((question) => question.ruleId),
		],
		ruleHits,
		scoreBreakdown:
			filePrioritySummary.diagnostics?.scoreBreakdown.filter(
				(entry) => entry.file !== undefined,
			) ?? [],
		traceCollections: diagnosticsCollectionsFromGuide({
			questions,
			reasons,
		}),
		trustBands: [
			classificationTrustBand,
			...reasons.map((reason) => reason.trustBand),
			...questions.map((question) => question.trustBand),
		],
	});

export const composeFileReviewGuide = (
	input: FileReviewGuideInput,
): FileReviewGuide => {
	const filePrioritySummary = summarizePrReview({
		context: input.context,
		files: [input.file],
	});
	const priority =
		filePrioritySummary.queue[0]?.priority ??
		filePrioritySummary.deprioritized[0]?.priority ??
		"review_next";
	const reasons: ReviewReason[] = [
		makeReason({
			evidence: [makeFileEvidence(input)],
			input,
			message:
				input.classification.reasons[0] ??
				"Deterministic file classification applied.",
			ruleId: `guidance:classification:${input.classification.primaryCategory}`,
			trustBand: input.classification.trustBand,
		}),
	];
	const questions: ReviewQuestion[] = [];
	const ruleHits: RuleHit[] = [
		makeRuleHit({
			evidence: [makeFileEvidence(input)],
			input,
			summary: `Classification reason emitted for ${input.classification.primaryCategory}.`,
			ruleId: `guidance:classification:${input.classification.primaryCategory}`,
		}),
	];
	const operationEvidence = input.diff.operations.map((operation) =>
		makeOperationEvidence(input, operation),
	);
	const moveEvidence = input.diff.moves.map((move) =>
		makeMoveEvidence(input, move),
	);
	const renameEvidence = input.diff.renames.map((rename) =>
		makeRenameEvidence(input, rename),
	);
	const operationCounts = countOperationTypes(input.diff);
	const parserFallback =
		input.classification.categories.includes("parser_fallback");
	const cosmeticLikely = isCosmeticLikely(input.diff);
	const manualReview = isManualReview(priority);
	const hasMoveSignals = input.diff.moves.length > 0;
	const hasRenameSignals = input.diff.renames.length > 0;

	pushOperationShapeReason({
		input,
		operationCounts,
		operationEvidence,
		reasons,
		ruleHits,
	});

	if (manualReview) {
		pushManualReviewGuidance({ input, reasons, questions, ruleHits });
	}
	if (parserFallback) {
		pushParserFallbackGuidance({ input, questions, reasons, ruleHits });
	}
	if (hasMoveSignals) {
		pushMoveGuidance({ input, moveEvidence, questions, reasons, ruleHits });
	}
	if (hasRenameSignals) {
		pushRenameGuidance({ input, questions, reasons, renameEvidence, ruleHits });
	}
	if (cosmeticLikely) {
		pushCosmeticGuidance({
			input,
			operationEvidence,
			questions,
			reasons,
			ruleHits,
		});
	}
	if (!cosmeticLikely) {
		pushBehaviorQuestion({
			input,
			operationCounts,
			operationEvidence,
			questions,
			ruleHits,
		});
	}

	return {
		version: REVIEW_GUIDE_SCHEMA_VERSION,
		ruleVersion: REVIEW_GUIDE_RULE_VERSION,
		filename: input.file.filename,
		priority,
		classification: input.classification,
		summary: buildSummary({
			cosmeticLikely,
			hasMoveSignals,
			hasRenameSignals,
			input,
			manualReview,
			operationCounts,
			parserFallback,
		}),
		reasons,
		questions,
		warnings: input.file.warnings ?? [],
		diagnostics: buildDiagnostics({
			classificationTrustBand: input.classification.trustBand,
			filePrioritySummary,
			questions,
			reasons,
			ruleHits,
		}),
	};
};
