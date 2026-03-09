import { Effect, Layer, ServiceMap } from "effect";
import { classifyReviewFile } from "./classifier.js";
import { formatReviewDiagnosticsText } from "./diagnostics.js";
import { composeFileReviewGuide } from "./file-guide.js";
import { summarizePrReview } from "./prioritizer.js";
import type {
  FileClassification,
  FileReviewGuide,
  FileReviewGuideInput,
  PrReviewSummary,
  ReviewDiagnostics,
  ReviewFileSummaryInput,
  ReviewPrioritizationInput,
} from "./schemas.js";
import {
  REVIEW_GUIDE_RULE_VERSION,
  REVIEW_GUIDE_SCHEMA_VERSION,
} from "./schemas.js";

export interface ReviewClassifierService {
  readonly classifyFile: (
    input: ReviewFileSummaryInput
  ) => Effect.Effect<FileClassification>;
}

export class ReviewClassifier extends ServiceMap.Service<
  ReviewClassifier,
  ReviewClassifierService
>()("@semadiff/review-guide/ReviewClassifier") {}

export const ReviewClassifierLive = Layer.effect(
  ReviewClassifier,
  Effect.gen(function* () {
    yield* Effect.log("ReviewClassifier initialized", {
      component: "ReviewClassifier",
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      schemaVersion: REVIEW_GUIDE_SCHEMA_VERSION,
    });

    const classifyFileEffect = Effect.fn("ReviewClassifier.classifyFile")(
      function* (input: ReviewFileSummaryInput) {
        const classification = classifyReviewFile(input);
        yield* Effect.logDebug("ReviewClassifier.classifyFile", {
          filename: input.filename,
          primaryCategory: classification.primaryCategory,
          categories: classification.categories,
          trustBand: classification.trustBand,
          reasonCount: classification.reasons.length,
        });
        return classification;
      }
    );

    const classifyFile: ReviewClassifierService["classifyFile"] = (input) =>
      classifyFileEffect(input);

    return ReviewClassifier.of({ classifyFile });
  })
);

export interface ReviewPrioritizerService {
  readonly summarizePr: (
    input: ReviewPrioritizationInput
  ) => Effect.Effect<PrReviewSummary>;
}

export class ReviewPrioritizer extends ServiceMap.Service<
  ReviewPrioritizer,
  ReviewPrioritizerService
>()("@semadiff/review-guide/ReviewPrioritizer") {}

export const ReviewPrioritizerLive = Layer.effect(
  ReviewPrioritizer,
  Effect.gen(function* () {
    yield* Effect.log("ReviewPrioritizer initialized", {
      component: "ReviewPrioritizer",
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      schemaVersion: REVIEW_GUIDE_SCHEMA_VERSION,
    });

    const summarizePrEffect = Effect.fn("ReviewPrioritizer.summarizePr")(
      function* (input: ReviewPrioritizationInput) {
        const summary = summarizePrReview(input);
        yield* Effect.logDebug("ReviewPrioritizer.summarizePr", {
          fileCount: input.files.length,
          queueCount: summary.queue.length,
          deprioritizedCount: summary.deprioritized.length,
          deprioritizedGroupCount: summary.deprioritizedGroups.length,
          warningCount: summary.warnings.length,
          themeCount: summary.themes.length,
          trustBandCounts: summary.diagnostics?.trustBandCounts,
        });
        return summary;
      }
    );

    const summarizePr: ReviewPrioritizerService["summarizePr"] = (input) =>
      summarizePrEffect(input);

    return ReviewPrioritizer.of({ summarizePr });
  })
);

export interface FileReviewGuideComposerService {
  readonly composeFileGuide: (
    input: FileReviewGuideInput
  ) => Effect.Effect<FileReviewGuide>;
}

export class FileReviewGuideComposer extends ServiceMap.Service<
  FileReviewGuideComposer,
  FileReviewGuideComposerService
>()("@semadiff/review-guide/FileReviewGuideComposer") {}

export const FileReviewGuideComposerLive = Layer.effect(
  FileReviewGuideComposer,
  Effect.gen(function* () {
    yield* Effect.log("FileReviewGuideComposer initialized", {
      component: "FileReviewGuideComposer",
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      schemaVersion: REVIEW_GUIDE_SCHEMA_VERSION,
    });

    const composeFileGuideEffect = Effect.fn(
      "FileReviewGuideComposer.composeFileGuide"
    )(function* (input: FileReviewGuideInput) {
      const guide = composeFileReviewGuide(input);
      yield* Effect.logDebug("FileReviewGuideComposer.composeFileGuide", {
        filename: input.file.filename,
        operationCount: input.diff.operations.length,
        moveCount: input.diff.moves.length,
        renameCount: input.diff.renames.length,
        reasonCount: guide.reasons.length,
        questionCount: guide.questions.length,
        priority: guide.priority,
        trustBandCounts: guide.diagnostics?.trustBandCounts,
      });
      return guide;
    });

    const composeFileGuide: FileReviewGuideComposerService["composeFileGuide"] =
      (input) => composeFileGuideEffect(input);

    return FileReviewGuideComposer.of({ composeFileGuide });
  })
);

export interface ReviewDiagnosticsFormatterService {
  readonly formatDiagnostics: (
    diagnostics: ReviewDiagnostics
  ) => Effect.Effect<string>;
}

export class ReviewDiagnosticsFormatter extends ServiceMap.Service<
  ReviewDiagnosticsFormatter,
  ReviewDiagnosticsFormatterService
>()("@semadiff/review-guide/ReviewDiagnosticsFormatter") {}

export const ReviewDiagnosticsFormatterLive = Layer.effect(
  ReviewDiagnosticsFormatter,
  Effect.gen(function* () {
    yield* Effect.log("ReviewDiagnosticsFormatter initialized", {
      component: "ReviewDiagnosticsFormatter",
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      schemaVersion: REVIEW_GUIDE_SCHEMA_VERSION,
    });

    const formatDiagnosticsEffect = Effect.fn(
      "ReviewDiagnosticsFormatter.formatDiagnostics"
    )(function* (diagnostics: ReviewDiagnostics) {
      const formatted = formatReviewDiagnosticsText(diagnostics);
      yield* Effect.logDebug("ReviewDiagnosticsFormatter.formatDiagnostics", {
        ruleHitCount: diagnostics.traceSummary.ruleHitCount,
        scoreEntryCount: diagnostics.traceSummary.scoreEntryCount,
        evidenceCount: diagnostics.traceSummary.evidenceCount,
        consistencyWarningCount: diagnostics.consistency.warnings.length,
      });
      return formatted;
    });

    const formatDiagnostics: ReviewDiagnosticsFormatterService["formatDiagnostics"] =
      (diagnostics) => formatDiagnosticsEffect(diagnostics);

    return ReviewDiagnosticsFormatter.of({ formatDiagnostics });
  })
);

export const ReviewGuideLive = Layer.mergeAll(
  ReviewClassifierLive,
  ReviewPrioritizerLive,
  FileReviewGuideComposerLive,
  ReviewDiagnosticsFormatterLive
);
