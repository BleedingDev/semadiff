export type {
  AuthStatus,
  FileDiffPayload,
  PrFileStatus,
  PrFileSummary,
  PrMeta,
  PrRef,
  PrSummary,
} from "@semadiff/pr-backend";

export interface ServerError {
  code: string;
  message: string;
}

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServerError };
