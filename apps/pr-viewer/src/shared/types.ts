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
  previousFilename?: string;
  reductionPercent?: number;
  operations?: number;
  moveCount?: number;
  renameCount?: number;
  binary?: boolean;
  oversized?: boolean;
  language?: string;
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

export type AuthStatus = {
  hasToken: boolean;
};

export type ServerError = {
  code: string;
  message: string;
};

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServerError };
