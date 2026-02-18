import { DiffDocumentSchema } from "@semadiff/core";
import { Schema } from "effect";

export type PrFileStatus = "added" | "modified" | "removed" | "renamed";

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PrMeta {
  title: string;
  url: string;
  baseSha: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface PrFileSummary {
  filename: string;
  status: PrFileStatus;
  additions: number;
  deletions: number;
  changes: number;
  sha: string;
  previousFilename?: string | undefined;
  reductionPercent?: number | undefined;
  operations?: number | undefined;
  moveCount?: number | undefined;
  renameCount?: number | undefined;
  binary?: boolean | undefined;
  oversized?: boolean | undefined;
  language?: string | undefined;
  warnings?: readonly string[] | undefined;
}

export interface PrSummary {
  pr: PrMeta;
  files: PrFileSummary[];
}

export interface FileDiffPayload {
  file: PrFileSummary;
  semanticHtml: string;
  linesHtml: string;
}

export interface FileDiffDocument {
  file: PrFileSummary;
  diff: import("@semadiff/core").DiffDocument;
}

export interface AuthStatus {
  hasToken: boolean;
}

export const PrFileStatusSchema = Schema.Literals([
  "added",
  "modified",
  "removed",
  "renamed",
] as const);

export const PrRefSchema = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  number: Schema.Number,
});

export const PrMetaSchema = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  baseSha: Schema.String,
  headSha: Schema.String,
  additions: Schema.Number,
  deletions: Schema.Number,
  changedFiles: Schema.Number,
});

export const PrFileSummarySchema = Schema.Struct({
  filename: Schema.String,
  status: PrFileStatusSchema,
  additions: Schema.Number,
  deletions: Schema.Number,
  changes: Schema.Number,
  sha: Schema.String,
  previousFilename: Schema.optional(Schema.String),
  reductionPercent: Schema.optional(Schema.Number),
  operations: Schema.optional(Schema.Number),
  moveCount: Schema.optional(Schema.Number),
  renameCount: Schema.optional(Schema.Number),
  binary: Schema.optional(Schema.Boolean),
  oversized: Schema.optional(Schema.Boolean),
  language: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
});

export const PrSummarySchema = Schema.Struct({
  pr: PrMetaSchema,
  files: Schema.Array(PrFileSummarySchema),
});

export const FileDiffPayloadSchema = Schema.Struct({
  file: PrFileSummarySchema,
  semanticHtml: Schema.String,
  linesHtml: Schema.String,
});

export const FileDiffDocumentSchema = Schema.Struct({
  file: PrFileSummarySchema,
  diff: DiffDocumentSchema,
});

export const AuthStatusSchema = Schema.Struct({
  hasToken: Schema.Boolean,
});
