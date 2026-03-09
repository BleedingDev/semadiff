import type { Effect } from "effect";
import type {
  FileDiffDocument,
  FileDiffPayload,
  FileReviewGuide,
  PrReviewSummary,
  PrSummary,
} from "./types.js";

export type PrDiffLineLayout = "split" | "unified";
export type PrDiffLineMode = "semantic" | "raw";

export type PrDiffClientErrorCode =
  | "InvalidPrUrl"
  | "GitHubRateLimitError"
  | "GitHubRequestError"
  | "GitHubDecodeError"
  | "PrFileNotFound"
  | "Error"
  | "UnknownError";

export interface PrDiffClientError {
  code: PrDiffClientErrorCode | (string & {});
  message: string;
}

export type PrDiffResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PrDiffClientError };

export interface GetPrSummaryInput {
  prUrl: string;
}

export interface GetFileDiffInput {
  prUrl: string;
  filename: string;
  contextLines?: number | undefined;
  lineLayout?: PrDiffLineLayout | undefined;
  lineMode?: PrDiffLineMode | undefined;
  hideComments?: boolean | undefined;
  detectMoves?: boolean | undefined;
}

export interface GetFileDiffDocumentInput {
  prUrl: string;
  filename: string;
  contextLines?: number | undefined;
  lineLayout?: PrDiffLineLayout | undefined;
  detectMoves?: boolean | undefined;
}

export interface GetPrReviewSummaryInput {
  prUrl: string;
}

export interface GetFileReviewGuideInput {
  prUrl: string;
  filename: string;
  contextLines?: number | undefined;
  lineLayout?: PrDiffLineLayout | undefined;
  detectMoves?: boolean | undefined;
}

export interface PrDiffClientContract {
  readonly getPrSummary: (
    input: GetPrSummaryInput
  ) => Promise<PrDiffResult<PrSummary>>;
  readonly getFileDiff: (
    input: GetFileDiffInput
  ) => Promise<PrDiffResult<FileDiffPayload>>;
  readonly getFileDiffDocument: (
    input: GetFileDiffDocumentInput
  ) => Promise<PrDiffResult<FileDiffDocument>>;
  readonly getPrReviewSummary: (
    input: GetPrReviewSummaryInput
  ) => Promise<PrDiffResult<PrReviewSummary>>;
  readonly getFileReviewGuide: (
    input: GetFileReviewGuideInput
  ) => Promise<PrDiffResult<FileReviewGuide>>;
}

export interface PrDiffEffectClientContract {
  readonly getPrSummary: (
    input: GetPrSummaryInput
  ) => Effect.Effect<PrSummary, PrDiffClientError>;
  readonly getFileDiff: (
    input: GetFileDiffInput
  ) => Effect.Effect<FileDiffPayload, PrDiffClientError>;
  readonly getFileDiffDocument: (
    input: GetFileDiffDocumentInput
  ) => Effect.Effect<FileDiffDocument, PrDiffClientError>;
  readonly getPrReviewSummary: (
    input: GetPrReviewSummaryInput
  ) => Effect.Effect<PrReviewSummary, PrDiffClientError>;
  readonly getFileReviewGuide: (
    input: GetFileReviewGuideInput
  ) => Effect.Effect<FileReviewGuide, PrDiffClientError>;
}
