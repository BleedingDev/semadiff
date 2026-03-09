import type { DiffDocument } from "@semadiff/core";
import type {
  FileReviewGuide as ReviewGuideFileReviewGuide,
  PrReviewSummary as ReviewGuidePrReviewSummary,
  ReviewPriority,
} from "@semadiff/review-guide";
import {
  classifyReviewFile,
  composeFileReviewGuide,
  summarizePrReview,
} from "@semadiff/review-guide";

export type {
  FileReviewGuide,
  PrReviewSummary,
} from "@semadiff/review-guide";

const REVIEW_PRIORITY_RANK: Record<ReviewPriority, number> = {
  review_first: 5,
  review_next: 4,
  manual_review: 3,
  skim: 2,
  deprioritized: 1,
};

const maxPriority = (
  left: ReviewPriority,
  right: ReviewPriority
): ReviewPriority =>
  REVIEW_PRIORITY_RANK[left] >= REVIEW_PRIORITY_RANK[right] ? left : right;

const makeContext = (title: string) => ({
  title,
  labels: [],
  commitHeadlines: [],
});

export const summarizeExtensionReview = (
  paths: readonly string[],
  title: string
): ReviewGuidePrReviewSummary =>
  summarizePrReview({
    context: makeContext(title),
    files: paths.map((filename) => ({
      filename,
      status: "modified" as const,
    })),
  });

export const findExtensionReviewEntry = (
  summary: ReviewGuidePrReviewSummary | null,
  path: string
) =>
  [...(summary?.queue ?? []), ...(summary?.deprioritized ?? [])].find(
    (entry) => entry.filename === path
  );

export const composeExtensionFileGuide = (params: {
  path: string;
  diff: DiffDocument;
  language?: string;
  initialPriority?: ReviewPriority;
  title: string;
}): ReviewGuideFileReviewGuide => {
  const warnings =
    params.language === "text"
      ? ["Parsed as plain text; semantic confidence reduced."]
      : [];
  const file = {
    filename: params.path,
    status: "modified" as const,
    operations: params.diff.operations.length,
    moveCount: params.diff.moves.length,
    renameCount: params.diff.renames.length,
    ...(params.language ? { language: params.language } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
  const classification = classifyReviewFile(file);
  const guide = composeFileReviewGuide({
    context: makeContext(params.title),
    file,
    classification,
    diff: params.diff,
  });
  if (!params.initialPriority) {
    return guide;
  }
  return {
    ...guide,
    priority: maxPriority(guide.priority, params.initialPriority),
  };
};
