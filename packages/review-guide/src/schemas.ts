import { DiffDocumentSchema } from "@semadiff/core";
import { Schema } from "effect";

export const REVIEW_GUIDE_SCHEMA_VERSION = "0.1.0";
export const REVIEW_GUIDE_RULE_VERSION = "0.1.0";

export const ReviewFileStatusSchema = Schema.Literals([
  "added",
  "modified",
  "removed",
  "renamed",
  "unknown",
] as const);

export const ReviewTrustBandSchema = Schema.Literals([
  "structural_fact",
  "deterministic_inference",
  "contextual_hint",
  "low_confidence",
] as const);

export const ReviewPrioritySchema = Schema.Literals([
  "review_first",
  "review_next",
  "skim",
  "deprioritized",
  "manual_review",
] as const);

export const ReviewCategorySchema = Schema.Literals([
  "source",
  "test",
  "docs",
  "config",
  "generated",
  "lockfile",
  "vendored",
  "binary",
  "oversized",
  "parser_fallback",
  "unknown",
] as const);

export const EvidenceKindSchema = Schema.Literals([
  "pr_meta",
  "pr_body",
  "commit",
  "file_summary",
  "warning",
  "operation",
  "move",
  "rename",
] as const);

export const ReviewSuggestedActionSchema = Schema.Literals([
  "open_file",
  "check_tests",
  "inspect_moves",
  "inspect_renames",
  "open_native_diff",
  "skip_by_default",
] as const);

export const ReviewScopeSchema = Schema.Literals(["pr", "file"] as const);

export const ReviewStageSchema = Schema.Literals([
  "classification",
  "prioritization",
  "guidance",
  "diagnostics",
] as const);

export const ReviewContextSchema = Schema.Struct({
  title: Schema.String,
  body: Schema.optional(Schema.String),
  labels: Schema.Array(Schema.String),
  author: Schema.optional(Schema.String),
  baseRef: Schema.optional(Schema.String),
  headRef: Schema.optional(Schema.String),
  commitHeadlines: Schema.Array(Schema.String),
});

export const ReviewFileSummaryInputSchema = Schema.Struct({
  filename: Schema.String,
  status: ReviewFileStatusSchema,
  sha: Schema.optional(Schema.String),
  previousFilename: Schema.optional(Schema.String),
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
  changes: Schema.optional(Schema.Number),
  reductionPercent: Schema.optional(Schema.Number),
  operations: Schema.optional(Schema.Number),
  moveCount: Schema.optional(Schema.Number),
  renameCount: Schema.optional(Schema.Number),
  language: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  binary: Schema.optional(Schema.Boolean),
  oversized: Schema.optional(Schema.Boolean),
});

export const FileClassificationSchema = Schema.Struct({
  primaryCategory: ReviewCategorySchema,
  categories: Schema.Array(ReviewCategorySchema),
  trustBand: ReviewTrustBandSchema,
  reasons: Schema.Array(Schema.String),
});

export const ReviewLineSpanSchema = Schema.Struct({
  startLine: Schema.Number,
  endLine: Schema.Number,
});

export const EvidenceRefSchema = Schema.Struct({
  kind: EvidenceKindSchema,
  id: Schema.String,
  file: Schema.optional(Schema.String),
  label: Schema.String,
  oldLineSpan: Schema.optional(ReviewLineSpanSchema),
  newLineSpan: Schema.optional(ReviewLineSpanSchema),
});

export const RuleHitSchema = Schema.Struct({
  ruleId: Schema.String,
  stage: ReviewStageSchema,
  summary: Schema.String,
  weight: Schema.optional(Schema.Number),
  evidence: Schema.Array(EvidenceRefSchema),
});

export const ReviewReasonSchema = Schema.Struct({
  id: Schema.String,
  scope: ReviewScopeSchema,
  message: Schema.String,
  trustBand: ReviewTrustBandSchema,
  ruleId: Schema.String,
  evidence: Schema.Array(EvidenceRefSchema),
});

export const ReviewQuestionSchema = Schema.Struct({
  id: Schema.String,
  question: Schema.String,
  rationale: Schema.String,
  trustBand: ReviewTrustBandSchema,
  suggestedAction: ReviewSuggestedActionSchema,
  ruleId: Schema.String,
  evidence: Schema.Array(EvidenceRefSchema),
});

export const ReviewQueueEntrySchema = Schema.Struct({
  filename: Schema.String,
  priority: ReviewPrioritySchema,
  classification: FileClassificationSchema,
  reasons: Schema.Array(ReviewReasonSchema),
  warnings: Schema.Array(Schema.String),
});

export const ReviewScoreBreakdownEntrySchema = Schema.Struct({
  id: Schema.String,
  file: Schema.optional(Schema.String),
  label: Schema.String,
  score: Schema.Number,
});

export const ReviewQueueGroupSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  entries: Schema.Array(ReviewQueueEntrySchema),
});

export const ReviewDiagnosticsSchema = Schema.Struct({
  version: Schema.Literal(REVIEW_GUIDE_SCHEMA_VERSION),
  ruleVersion: Schema.String,
  ruleHits: Schema.Array(RuleHitSchema),
  scoreBreakdown: Schema.Array(ReviewScoreBreakdownEntrySchema),
  evidenceIndex: Schema.Array(EvidenceRefSchema),
  traceSummary: Schema.Struct({
    ruleHitCount: Schema.Number,
    scoreEntryCount: Schema.Number,
    evidenceCount: Schema.Number,
  }),
  consistency: Schema.Struct({
    missingRuleIds: Schema.Array(Schema.String),
    emptyEvidenceOwners: Schema.Array(Schema.String),
    warnings: Schema.Array(Schema.String),
  }),
  trustBandCounts: Schema.Struct({
    structuralFact: Schema.Number,
    deterministicInference: Schema.Number,
    contextualHint: Schema.Number,
    lowConfidence: Schema.Number,
  }),
});

export const ReviewPrioritizationInputSchema = Schema.Struct({
  context: Schema.optional(ReviewContextSchema),
  files: Schema.Array(ReviewFileSummaryInputSchema),
});

export const FileReviewGuideInputSchema = Schema.Struct({
  context: Schema.optional(ReviewContextSchema),
  file: ReviewFileSummaryInputSchema,
  classification: FileClassificationSchema,
  diff: DiffDocumentSchema,
});

export const PrReviewSummarySchema = Schema.Struct({
  version: Schema.Literal(REVIEW_GUIDE_SCHEMA_VERSION),
  ruleVersion: Schema.String,
  themes: Schema.Array(Schema.String),
  queue: Schema.Array(ReviewQueueEntrySchema),
  deprioritized: Schema.Array(ReviewQueueEntrySchema),
  deprioritizedGroups: Schema.Array(ReviewQueueGroupSchema),
  warnings: Schema.Array(Schema.String),
  diagnostics: Schema.optional(ReviewDiagnosticsSchema),
});

export const FileReviewGuideSchema = Schema.Struct({
  version: Schema.Literal(REVIEW_GUIDE_SCHEMA_VERSION),
  ruleVersion: Schema.String,
  filename: Schema.String,
  priority: ReviewPrioritySchema,
  classification: FileClassificationSchema,
  summary: Schema.String,
  reasons: Schema.Array(ReviewReasonSchema),
  questions: Schema.Array(ReviewQuestionSchema),
  warnings: Schema.Array(Schema.String),
  diagnostics: Schema.optional(ReviewDiagnosticsSchema),
});

export type ReviewContext = Schema.Schema.Type<typeof ReviewContextSchema>;
export type ReviewFileSummaryInput = Schema.Schema.Type<
  typeof ReviewFileSummaryInputSchema
>;
export type ReviewCategory = Schema.Schema.Type<typeof ReviewCategorySchema>;
export type ReviewTrustBand = Schema.Schema.Type<typeof ReviewTrustBandSchema>;
export type ReviewPriority = Schema.Schema.Type<typeof ReviewPrioritySchema>;
export type FileClassification = Schema.Schema.Type<
  typeof FileClassificationSchema
>;
export type EvidenceRef = Schema.Schema.Type<typeof EvidenceRefSchema>;
export type RuleHit = Schema.Schema.Type<typeof RuleHitSchema>;
export type ReviewReason = Schema.Schema.Type<typeof ReviewReasonSchema>;
export type ReviewQuestion = Schema.Schema.Type<typeof ReviewQuestionSchema>;
export type ReviewQueueEntry = Schema.Schema.Type<
  typeof ReviewQueueEntrySchema
>;
export type ReviewQueueGroup = Schema.Schema.Type<
  typeof ReviewQueueGroupSchema
>;
export type ReviewScoreBreakdownEntry = Schema.Schema.Type<
  typeof ReviewScoreBreakdownEntrySchema
>;
export type ReviewDiagnostics = Schema.Schema.Type<
  typeof ReviewDiagnosticsSchema
>;
export type ReviewPrioritizationInput = Schema.Schema.Type<
  typeof ReviewPrioritizationInputSchema
>;
export type FileReviewGuideInput = Schema.Schema.Type<
  typeof FileReviewGuideInputSchema
>;
export type PrReviewSummary = Schema.Schema.Type<typeof PrReviewSummarySchema>;
export type FileReviewGuide = Schema.Schema.Type<typeof FileReviewGuideSchema>;
