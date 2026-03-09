import type {
	EvidenceRef,
	ReviewDiagnostics,
	ReviewQuestion,
	ReviewReason,
	ReviewScoreBreakdownEntry,
	ReviewTrustBand,
	RuleHit,
} from "./schemas.js";
import {
	REVIEW_GUIDE_RULE_VERSION,
	REVIEW_GUIDE_SCHEMA_VERSION,
} from "./schemas.js";

const evidenceKey = (evidence: EvidenceRef) =>
	[
		evidence.kind,
		evidence.id,
		evidence.file ?? "",
		evidence.oldLineSpan?.startLine ?? "",
		evidence.oldLineSpan?.endLine ?? "",
		evidence.newLineSpan?.startLine ?? "",
		evidence.newLineSpan?.endLine ?? "",
	].join(":");

const uniqueEvidence = (refs: readonly EvidenceRef[]) => {
	const seen = new Set<string>();
	const result: EvidenceRef[] = [];

	for (const ref of refs) {
		const key = evidenceKey(ref);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(ref);
	}

	return result;
};

export const collectTrustBandCounts = (
	trustBands: readonly ReviewTrustBand[],
): ReviewDiagnostics["trustBandCounts"] => {
	const counts = {
		structuralFact: 0,
		deterministicInference: 0,
		contextualHint: 0,
		lowConfidence: 0,
	};

	for (const trustBand of trustBands) {
		switch (trustBand) {
			case "structural_fact":
				counts.structuralFact += 1;
				break;
			case "deterministic_inference":
				counts.deterministicInference += 1;
				break;
			case "contextual_hint":
				counts.contextualHint += 1;
				break;
			case "low_confidence":
				counts.lowConfidence += 1;
				break;
			default:
				break;
		}
	}

	return counts;
};

const buildConsistency = ({
	collections,
	evidenceIndex,
	expectedRuleIds,
	ruleHits,
}: {
	collections: readonly { owner: string; refs: readonly EvidenceRef[] }[];
	evidenceIndex: readonly EvidenceRef[];
	expectedRuleIds: readonly string[];
	ruleHits: readonly RuleHit[];
}) => {
	const indexedKeys = new Set(evidenceIndex.map(evidenceKey));
	const ruleIds = new Set(ruleHits.map((ruleHit) => ruleHit.ruleId));
	const missingRuleIds = [
		...new Set(expectedRuleIds.filter((id) => !ruleIds.has(id))),
	];
	const emptyEvidenceOwners = collections
		.filter((collection) => collection.refs.length === 0)
		.map((collection) => collection.owner);
	const warnings: string[] = [];

	for (const collection of collections) {
		for (const ref of collection.refs) {
			if (!indexedKeys.has(evidenceKey(ref))) {
				warnings.push(
					`Evidence ${ref.id} referenced by ${collection.owner} is missing from diagnostics index.`,
				);
			}
		}
	}
	for (const ruleHit of ruleHits) {
		if (ruleHit.evidence.length === 0) {
			warnings.push(`Rule hit ${ruleHit.ruleId} was emitted without evidence.`);
		}
	}
	for (const owner of emptyEvidenceOwners) {
		warnings.push(`${owner} was emitted without evidence refs.`);
	}
	for (const ruleId of missingRuleIds) {
		warnings.push(
			`Expected rule ${ruleId} is missing from diagnostics rule hits.`,
		);
	}

	return {
		missingRuleIds,
		emptyEvidenceOwners,
		warnings,
	};
};

export const buildReviewDiagnostics = ({
	additionalEvidence = [],
	expectedRuleIds,
	ruleHits,
	scoreBreakdown,
	traceCollections,
	trustBands,
}: {
	additionalEvidence?: readonly EvidenceRef[];
	expectedRuleIds: readonly string[];
	ruleHits: readonly RuleHit[];
	scoreBreakdown: readonly ReviewScoreBreakdownEntry[];
	traceCollections: readonly { owner: string; refs: readonly EvidenceRef[] }[];
	trustBands: readonly ReviewTrustBand[];
}): ReviewDiagnostics => {
	const evidenceIndex = uniqueEvidence([
		...additionalEvidence,
		...ruleHits.flatMap((ruleHit) => ruleHit.evidence),
		...traceCollections.flatMap((collection) => collection.refs),
	]);
	const consistency = buildConsistency({
		collections: traceCollections,
		evidenceIndex,
		expectedRuleIds,
		ruleHits,
	});

	return {
		version: REVIEW_GUIDE_SCHEMA_VERSION,
		ruleVersion: REVIEW_GUIDE_RULE_VERSION,
		ruleHits: [...ruleHits],
		scoreBreakdown: [...scoreBreakdown],
		evidenceIndex,
		traceSummary: {
			ruleHitCount: ruleHits.length,
			scoreEntryCount: scoreBreakdown.length,
			evidenceCount: evidenceIndex.length,
		},
		consistency,
		trustBandCounts: collectTrustBandCounts(trustBands),
	};
};

export const diagnosticsCollectionsFromGuide = ({
	questions,
	reasons,
}: {
	questions: readonly ReviewQuestion[];
	reasons: readonly ReviewReason[];
}) => [
	...reasons.map((reason) => ({
		owner: `reason:${reason.id}`,
		refs: reason.evidence,
	})),
	...questions.map((question) => ({
		owner: `question:${question.id}`,
		refs: question.evidence,
	})),
];

export const diagnosticsCollectionsFromQueue = (
	reasons: readonly ReviewReason[],
) =>
	reasons.map((reason) => ({
		owner: `reason:${reason.id}`,
		refs: reason.evidence,
	}));

export const formatReviewDiagnosticsText = (diagnostics: ReviewDiagnostics) => {
	const lines = [
		`review-guide diagnostics v${diagnostics.version}`,
		`rule version: ${diagnostics.ruleVersion}`,
		`trace summary: ${diagnostics.traceSummary.ruleHitCount} rule hits, ${diagnostics.traceSummary.scoreEntryCount} score entries, ${diagnostics.traceSummary.evidenceCount} evidence refs`,
		`trust bands: structural_fact=${diagnostics.trustBandCounts.structuralFact}, deterministic_inference=${diagnostics.trustBandCounts.deterministicInference}, contextual_hint=${diagnostics.trustBandCounts.contextualHint}, low_confidence=${diagnostics.trustBandCounts.lowConfidence}`,
	];

	if (diagnostics.consistency.warnings.length > 0) {
		lines.push("consistency warnings:");
		for (const warning of diagnostics.consistency.warnings) {
			lines.push(`- ${warning}`);
		}
	}

	if (diagnostics.ruleHits.length > 0) {
		lines.push("rule hits:");
		for (const ruleHit of diagnostics.ruleHits) {
			lines.push(
				`- [${ruleHit.stage}] ${ruleHit.ruleId}: ${ruleHit.summary} (${ruleHit.evidence.length} evidence)`,
			);
		}
	}

	if (diagnostics.scoreBreakdown.length > 0) {
		lines.push("score breakdown:");
		for (const entry of diagnostics.scoreBreakdown) {
			lines.push(
				`- ${entry.file ?? "n/a"} ${entry.label}: ${entry.score} (${entry.id})`,
			);
		}
	}

	if (diagnostics.evidenceIndex.length > 0) {
		lines.push("evidence index:");
		for (const evidence of diagnostics.evidenceIndex) {
			lines.push(`- ${evidence.kind}:${evidence.id} ${evidence.label}`);
		}
	}

	return lines.join("\n");
};
