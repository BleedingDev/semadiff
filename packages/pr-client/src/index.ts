import type {
  FileDiffDocument,
  FileDiffPayload,
  FileReviewGuide,
  GetFileDiffDocumentInput,
  GetFileDiffInput,
  GetFileReviewGuideInput,
  GetPrReviewSummaryInput,
  GetPrSummaryInput,
  PrDiffClientContract,
  PrDiffClientError,
  PrDiffEffectClientContract,
  PrDiffResult,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-backend";
import { Effect, Layer, ServiceMap } from "effect";

export type {
  FileDiffDocument,
  FileDiffPayload,
  FileReviewGuide,
  GetFileDiffDocumentInput,
  GetFileDiffInput,
  GetFileReviewGuideInput,
  GetPrReviewSummaryInput,
  GetPrSummaryInput,
  PrDiffClientContract,
  PrDiffClientError,
  PrDiffClientErrorCode,
  PrDiffEffectClientContract,
  PrDiffLineLayout,
  PrDiffLineMode,
  PrDiffResult,
  PrFileSummary,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-backend";

interface PrDiffHttpEndpoints {
  summaryPath: string;
  fileDiffPath: string;
  fileDiffDocumentPath: string;
  reviewSummaryPath: string;
  fileReviewGuidePath: string;
}

export interface CreateHttpPrDiffClientOptions {
  baseUrl: string | URL;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | undefined;
  credentials?: RequestCredentials | undefined;
  endpoints?: Partial<PrDiffHttpEndpoints> | undefined;
  debugLogger?:
    | ((event: string, details: Record<string, unknown>) => void)
    | undefined;
}

const defaultEndpoints: PrDiffHttpEndpoints = {
  summaryPath: "/api/semadiff/pr/summary",
  fileDiffPath: "/api/semadiff/pr/file-diff",
  fileDiffDocumentPath: "/api/semadiff/pr/file-diff-document",
  reviewSummaryPath: "/api/semadiff/pr/review-summary",
  fileReviewGuidePath: "/api/semadiff/pr/file-review-guide",
};

const toClientError = (error: unknown): PrDiffClientError => ({
  code: "Error",
  message: (() => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unexpected transport error.";
  })(),
});

const invalidPayloadError = (path: string): PrDiffClientError => ({
  code: "UnknownError",
  message: `Invalid response payload from '${path}'.`,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isClientError = (value: unknown): value is PrDiffClientError =>
  isObject(value) &&
  typeof value.code === "string" &&
  typeof value.message === "string";

const isPrDiffResult = <T>(value: unknown): value is PrDiffResult<T> => {
  if (!isObject(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return "data" in value;
  }
  return isClientError(value.error);
};

const appendSearchParam = (
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined
) => {
  if (value === undefined) {
    return;
  }
  params.set(key, String(value));
};

const toUrl = (baseUrl: string | URL, path: string, query: URLSearchParams) => {
  const url = new URL(path, baseUrl);
  const encoded = query.toString();
  if (encoded.length > 0) {
    url.search = encoded;
  }
  return url;
};

const decodeJson = async (response: Response) => {
  const body = await response.text();
  if (!body.trim()) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
};

const logClientDebug = (
  logger:
    | ((event: string, details: Record<string, unknown>) => void)
    | undefined,
  event: string,
  details: Record<string, unknown>
) => {
  if (!logger) {
    return;
  }
  logger(event, details);
};

export const createHttpPrDiffClient = (
  options: CreateHttpPrDiffClientOptions
): PrDiffClientContract => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const credentials = options.credentials;
  const headers = options.headers;
  const endpoints: PrDiffHttpEndpoints = {
    ...defaultEndpoints,
    ...(options.endpoints ?? {}),
  };
  const debugLogger = options.debugLogger;

  const request = async <T>(
    path: string,
    params: URLSearchParams
  ): Promise<PrDiffResult<T>> => {
    try {
      const url = toUrl(options.baseUrl, path, params);
      logClientDebug(debugLogger, "request:start", {
        path,
        url: url.toString(),
      });
      const init: RequestInit = {
        method: "GET",
        ...(headers !== undefined ? { headers } : {}),
        ...(credentials !== undefined ? { credentials } : {}),
      };
      const response = await fetchImpl(url, {
        ...init,
      });
      const parsed = await decodeJson(response);
      if (isPrDiffResult<T>(parsed)) {
        logClientDebug(debugLogger, "request:result-envelope", {
          path,
          ok: parsed.ok,
          status: response.status,
        });
        return parsed;
      }
      if (!response.ok) {
        logClientDebug(debugLogger, "request:http-error", {
          path,
          status: response.status,
        });
        return {
          ok: false,
          error: {
            code: "GitHubRequestError",
            message: `Request failed with HTTP ${response.status}.`,
          },
        };
      }
      logClientDebug(debugLogger, "request:invalid-payload", {
        path,
        status: response.status,
      });
      return { ok: false, error: invalidPayloadError(path) };
    } catch (error) {
      logClientDebug(debugLogger, "request:transport-error", {
        path,
        message: toClientError(error).message,
      });
      return { ok: false, error: toClientError(error) };
    }
  };

  return {
    getPrSummary: (input: GetPrSummaryInput) => {
      const params = new URLSearchParams();
      appendSearchParam(params, "prUrl", input.prUrl);
      return request<PrSummary>(endpoints.summaryPath, params);
    },
    getFileDiff: (input: GetFileDiffInput) => {
      const params = new URLSearchParams();
      appendSearchParam(params, "prUrl", input.prUrl);
      appendSearchParam(params, "filename", input.filename);
      appendSearchParam(params, "contextLines", input.contextLines);
      appendSearchParam(params, "lineLayout", input.lineLayout);
      appendSearchParam(params, "lineMode", input.lineMode);
      appendSearchParam(params, "hideComments", input.hideComments);
      appendSearchParam(params, "detectMoves", input.detectMoves);
      return request<FileDiffPayload>(endpoints.fileDiffPath, params);
    },
    getFileDiffDocument: (input: GetFileDiffDocumentInput) => {
      const params = new URLSearchParams();
      appendSearchParam(params, "prUrl", input.prUrl);
      appendSearchParam(params, "filename", input.filename);
      appendSearchParam(params, "contextLines", input.contextLines);
      appendSearchParam(params, "lineLayout", input.lineLayout);
      appendSearchParam(params, "detectMoves", input.detectMoves);
      return request<FileDiffDocument>(endpoints.fileDiffDocumentPath, params);
    },
    getPrReviewSummary: (input: GetPrReviewSummaryInput) => {
      const params = new URLSearchParams();
      appendSearchParam(params, "prUrl", input.prUrl);
      return request<PrReviewSummary>(endpoints.reviewSummaryPath, params);
    },
    getFileReviewGuide: (input: GetFileReviewGuideInput) => {
      const params = new URLSearchParams();
      appendSearchParam(params, "prUrl", input.prUrl);
      appendSearchParam(params, "filename", input.filename);
      appendSearchParam(params, "contextLines", input.contextLines);
      appendSearchParam(params, "lineLayout", input.lineLayout);
      appendSearchParam(params, "detectMoves", input.detectMoves);
      return request<FileReviewGuide>(endpoints.fileReviewGuidePath, params);
    },
  };
};

const toEffectMethod =
  <Input, Output>(
    method: (input: Input) => Promise<PrDiffResult<Output>>
  ): ((input: Input) => Effect.Effect<Output, PrDiffClientError>) =>
  (input: Input) =>
    Effect.tryPromise({
      try: () => method(input),
      catch: toClientError,
    }).pipe(
      Effect.flatMap((result) =>
        result.ok ? Effect.succeed(result.data) : Effect.fail(result.error)
      )
    );

export const makePrDiffEffectClient = (
  client: PrDiffClientContract
): PrDiffEffectClientContract => ({
  getPrSummary: toEffectMethod(client.getPrSummary),
  getFileDiff: toEffectMethod(client.getFileDiff),
  getFileDiffDocument: toEffectMethod(client.getFileDiffDocument),
  getPrReviewSummary: toEffectMethod(client.getPrReviewSummary),
  getFileReviewGuide: toEffectMethod(client.getFileReviewGuide),
});

export class PrDiffClient extends ServiceMap.Service<
  PrDiffClient,
  PrDiffEffectClientContract
>()("@semadiff/pr-client/PrDiffClient") {}

export const PrDiffClientLive = (client: PrDiffClientContract) =>
  Layer.succeed(PrDiffClient, PrDiffClient.of(makePrDiffEffectClient(client)));

export const makeHttpPrDiffClientLive = (
  options: CreateHttpPrDiffClientOptions
) => PrDiffClientLive(createHttpPrDiffClient(options));
