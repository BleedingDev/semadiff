import type { DiffOperation, NormalizerLanguage } from "@semadiff/core";
import type {
	EntityChangeKind,
	SemanticEntityKind,
} from "@semadiff/entity-core";
import type {
	FileReviewGuide,
	PrReviewSummary,
	ReviewCategory,
	ReviewPriority,
} from "@semadiff/review-guide";

export type BenchmarkKind = "micro" | "real" | "research";

export type BenchmarkFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface BenchmarkCapabilities {
	review: boolean;
	entity: boolean;
	graph: boolean;
}

export interface BenchmarkLineRange {
	startLine: number;
	endLine: number;
}

export interface BenchmarkOperationTruth {
	fileId?: string | undefined;
	type: DiffOperation["type"];
	oldRange?: BenchmarkLineRange | undefined;
	newRange?: BenchmarkLineRange | undefined;
}

export interface BenchmarkMoveTruth {
	fileId?: string | undefined;
	oldRange: BenchmarkLineRange;
	newRange: BenchmarkLineRange;
}

export interface BenchmarkRenameTruth {
	from: string;
	to: string;
	occurrences?: number | undefined;
}

export interface BenchmarkEntityEndpointTruth {
	fileId?: string | undefined;
	kind: SemanticEntityKind;
	name: string;
	range: BenchmarkLineRange;
	parentName?: string | undefined;
	exported: boolean;
}

export interface BenchmarkEntityTruth extends BenchmarkEntityEndpointTruth {
	side: "old" | "new";
}

export interface BenchmarkEntityChangeTruth {
	kind: SemanticEntityKind;
	before?: BenchmarkEntityEndpointTruth | undefined;
	after?: BenchmarkEntityEndpointTruth | undefined;
	changeKinds: readonly EntityChangeKind[];
}

export interface BenchmarkTruth {
	operations: readonly BenchmarkOperationTruth[];
	moves: readonly BenchmarkMoveTruth[];
	renames: readonly BenchmarkRenameTruth[];
	entities: readonly BenchmarkEntityTruth[];
	entityChanges: readonly BenchmarkEntityChangeTruth[];
	graphEdges: readonly unknown[];
	impact: readonly unknown[];
}

export interface BenchmarkCaseFile {
	id: string;
	oldPath: string | null;
	newPath: string | null;
	status: BenchmarkFileStatus;
	language: NormalizerLanguage;
	before: string;
	after: string;
}

export interface BenchmarkCaseSource {
	kind: "github-pr";
	repository: string;
	prNumber: number;
	prUrl: string;
	baseSha: string;
	headSha: string;
	selectedFiles: readonly string[];
	collectedAt?: string | undefined;
	searchTerm?: string | undefined;
}

export interface BenchmarkCase {
	id: string;
	language: NormalizerLanguage;
	kind: BenchmarkKind;
	description: string;
	files: readonly BenchmarkCaseFile[];
	truth: BenchmarkTruth;
	capabilities: BenchmarkCapabilities;
	sourcePath: string;
	source?: BenchmarkCaseSource | undefined;
	reviewGuide?: BenchmarkReviewGuideExpectations | undefined;
}

export interface BenchmarkReviewGuideFileExpectation {
	fileId?: string | undefined;
	path?: string | undefined;
	expectedPriority?: ReviewPriority | undefined;
	expectedCategory?: ReviewCategory | undefined;
	requiredQuestionRuleIds?: readonly string[] | undefined;
	requiredReasonRuleIds?: readonly string[] | undefined;
	requiredWarnings?: readonly string[] | undefined;
}

export interface BenchmarkReviewGuideExpectations {
	reviewFirst?: readonly string[] | undefined;
	reviewNext?: readonly string[] | undefined;
	deprioritized?: readonly string[] | undefined;
	manualReview?: readonly string[] | undefined;
	fileChecks?: readonly BenchmarkReviewGuideFileExpectation[] | undefined;
}

export interface BenchmarkReviewRow {
	fileId: string;
	type: "equal" | "insert" | "delete" | "replace" | "gap" | "hunk" | "move";
	oldLine?: number | null | undefined;
	newLine?: number | null | undefined;
	text?: string | undefined;
	hidden?: number | undefined;
	oldText?: string | undefined;
	newText?: string | undefined;
	header?: string | undefined;
}

export interface ProjectedDiffOperation {
	fileId: string;
	type: DiffOperation["type"];
	oldRange?: BenchmarkLineRange | undefined;
	newRange?: BenchmarkLineRange | undefined;
	moveId?: string | undefined;
	renameGroupId?: string | undefined;
}

export interface ProjectedMove {
	fileId: string;
	oldRange: BenchmarkLineRange;
	newRange: BenchmarkLineRange;
	confidence: number;
	operationIds: readonly string[];
}

export interface ProjectedRename {
	from: string;
	to: string;
	occurrences: number;
	confidence: number;
}

export interface ProjectedEntity {
	id: string;
	fileId: string;
	kind: SemanticEntityKind;
	name: string;
	range: BenchmarkLineRange;
	parentName?: string | undefined;
	path?: string | undefined;
	exported: boolean;
}

export interface ProjectedEntityChange {
	id: string;
	kind: SemanticEntityKind;
	before?: ProjectedEntity | undefined;
	after?: ProjectedEntity | undefined;
	changeKinds: readonly EntityChangeKind[];
	confidence: number;
	linkedOperationIds: readonly string[];
}

export interface BenchmarkToolResult {
	tool: string;
	toolVersion: string;
	caseId: string;
	capabilities: BenchmarkCapabilities;
	result: {
		durationMs: number;
		operations: readonly ProjectedDiffOperation[];
		moves: readonly ProjectedMove[];
		renames: readonly ProjectedRename[];
		reviewRows: readonly BenchmarkReviewRow[];
		entities: {
			old: readonly ProjectedEntity[];
			new: readonly ProjectedEntity[];
		};
		entityChanges: readonly ProjectedEntityChange[];
	};
}

export interface SemadiffBenchmarkResult extends BenchmarkToolResult {
	tool: "semadiff";
}

export interface BenchmarkUnsupportedLane {
	status: "unsupported";
	reason: string;
}

export interface BenchmarkReviewScore {
	status: "scored";
	expectedChangedLines: number;
	actualChangedLines: number;
	matchedChangedLines: number;
	changedLinePrecision: number;
	changedLineRecall: number;
	expectedMoves: number;
	actualMoves: number;
	matchedMoves: number;
	moveRecall: number | null;
	expectedRenames: number;
	actualRenames: number;
	matchedRenames: number;
	renameRecall: number | null;
}

export interface BenchmarkPerformanceScore {
	status: "scored";
	runtimeMs: number;
	operationCount: number;
	moveCount: number;
	renameCount: number;
}

export interface BenchmarkEntityScore {
	status: "scored";
	expectedEntities: number;
	actualEntities: number;
	matchedEntities: number;
	entityPrecision: number;
	entityRecall: number;
	entityF1: number;
	expectedChanges: number;
	actualChanges: number;
	matchedChanges: number;
	changePrecision: number;
	changeRecall: number;
	changeF1: number;
}

export interface BenchmarkCaseEvaluation {
	review: BenchmarkReviewScore | BenchmarkUnsupportedLane;
	entity: BenchmarkEntityScore | BenchmarkUnsupportedLane;
	graph: BenchmarkUnsupportedLane;
	performance: BenchmarkPerformanceScore;
}

export interface BenchmarkCaseReport {
	caseId: string;
	description: string;
	kind: BenchmarkKind;
	capabilities: BenchmarkCapabilities;
	source?: BenchmarkCaseSource | undefined;
	evaluation: BenchmarkCaseEvaluation;
	output: BenchmarkToolResult;
}

export interface BenchmarkReportSummary {
	review: {
		cases: number;
		averagePrecision: number | null;
		averageRecall: number | null;
		averageMoveRecall: number | null;
		averageRenameRecall: number | null;
	};
	performance: {
		cases: number;
		totalRuntimeMs: number;
		medianRuntimeMs: number | null;
		p95RuntimeMs: number | null;
	};
	entity: {
		supportedCases: number;
		unsupportedCases: number;
		averagePrecision: number | null;
		averageRecall: number | null;
		averageF1: number | null;
		averageChangePrecision: number | null;
		averageChangeRecall: number | null;
		averageChangeF1: number | null;
	};
	graph: {
		supportedCases: number;
		unsupportedCases: number;
	};
}

export interface BenchmarkReport {
	version: "0.1.0";
	tool: "semadiff";
	caseRoot: string;
	generatedAt: string;
	cases: readonly BenchmarkCaseReport[];
	summary: BenchmarkReportSummary;
}

export interface BenchmarkComparisonCaseToolReport {
	tool: string;
	toolVersion: string;
	evaluation: BenchmarkCaseEvaluation;
	output: BenchmarkToolResult;
}

export interface BenchmarkComparisonCaseReport {
	caseId: string;
	description: string;
	kind: BenchmarkKind;
	capabilities: BenchmarkCapabilities;
	source?: BenchmarkCaseSource | undefined;
	results: readonly BenchmarkComparisonCaseToolReport[];
}

export interface BenchmarkComparisonToolSummary {
	tool: string;
	toolVersion: string;
	summary: BenchmarkReportSummary;
}

export interface BenchmarkComparisonReport {
	version: "0.1.0";
	caseRoot: string;
	generatedAt: string;
	cases: readonly BenchmarkComparisonCaseReport[];
	tools: readonly BenchmarkComparisonToolSummary[];
}

export interface BenchmarkReviewGuideFileOutput {
	fileId: string;
	filename: string;
	operationCount: number;
	moveCount: number;
	renameCount: number;
	summaryEntry?: {
		priority: ReviewPriority;
		primaryCategory: ReviewCategory;
	};
	guide: FileReviewGuide;
}

export interface BenchmarkReviewGuideCaseOutput {
	summary: PrReviewSummary;
	files: readonly BenchmarkReviewGuideFileOutput[];
}

export interface BenchmarkReviewGuideQueueScore {
	expectedQueuedFiles: number;
	matchedQueuedFiles: number;
	queueRecall: number | null;
	expectedDeprioritizedFiles: number;
	matchedDeprioritizedFiles: number;
	deprioritizedRecall: number | null;
	selectedFiles: number;
	surfacedSelectedFiles: number;
	selectedRecall: number | null;
}

export interface BenchmarkReviewGuideSignalScore {
	expectedMoveSignals: number;
	matchedMoveSignals: number;
	moveSignalRecall: number | null;
	expectedRenameSignals: number;
	matchedRenameSignals: number;
	renameSignalRecall: number | null;
	expectedBehaviorQuestions: number;
	matchedBehaviorQuestions: number;
	behaviorQuestionRecall: number | null;
}

export interface BenchmarkReviewGuideExpectationScore {
	checks: number;
	matchedChecks: number;
	recall: number | null;
	failures: readonly string[];
}

export interface BenchmarkReviewGuideCheck {
	id: string;
	passed: boolean;
	message: string;
	expected?: unknown;
	actual?: unknown;
}

export interface BenchmarkReviewGuideCaseEvaluation {
	status: "scored";
	totalChecks: number;
	passedChecks: number;
	failedChecks: number;
	checks: readonly BenchmarkReviewGuideCheck[];
	queue: BenchmarkReviewGuideQueueScore;
	signals: BenchmarkReviewGuideSignalScore;
	expectations: BenchmarkReviewGuideExpectationScore;
	passed: boolean;
	diagnostics: readonly string[];
}

export interface BenchmarkReviewGuideCaseReport {
	caseId: string;
	description: string;
	kind: BenchmarkKind;
	capabilities: BenchmarkCapabilities;
	source?: BenchmarkCaseSource | undefined;
	queue: readonly {
		filename: string;
		priority: ReviewPriority;
		category: ReviewCategory;
	}[];
	deprioritized: readonly {
		filename: string;
		priority: ReviewPriority;
		category: ReviewCategory;
	}[];
	fileGuides: readonly FileReviewGuide[];
	evaluation: BenchmarkReviewGuideCaseEvaluation;
	output: BenchmarkReviewGuideCaseOutput;
}

export interface BenchmarkReviewGuideReportSummary {
	cases: number;
	totalChecks: number;
	passedChecks: number;
	failedChecks: number;
	passRate: number;
	passedCases: number;
	failedCases: number;
	averageQueueRecall: number | null;
	averageDeprioritizedRecall: number | null;
	averageSelectedRecall: number | null;
	averageMoveSignalRecall: number | null;
	averageRenameSignalRecall: number | null;
	averageBehaviorQuestionRecall: number | null;
	averageExpectationRecall: number | null;
}

export interface BenchmarkReviewGuideReport {
	version: "0.1.0";
	tool: "review-guide";
	caseRoot: string;
	generatedAt: string;
	cases: readonly BenchmarkReviewGuideCaseReport[];
	summary: BenchmarkReviewGuideReportSummary;
}

export interface BenchmarkReviewGuideExpectation {
	topQueueFileIds?: readonly string[] | undefined;
	selectedFilesShouldLeadQueue?: boolean | undefined;
	selectedFilesShouldLeadSurface?: boolean | undefined;
	expectedCategories?: Readonly<Record<string, ReviewCategory>> | undefined;
	expectedPriorities?: Readonly<Record<string, ReviewPriority>> | undefined;
	expectedQuestionIncludes?:
		| Readonly<Record<string, readonly string[]>>
		| undefined;
	expectedWarningsInclude?: readonly string[] | undefined;
}
