import { GitHubConfig, PrDiffLive, PrDiffService } from "@semadiff/pr-backend";
import { createServerFn } from "@tanstack/react-start";
import { Cause, Effect, Option } from "effect";
import type { AuthStatus, ServerResult } from "../shared/types";

interface SummaryInput {
  prUrl: string;
}

interface FileDiffInput {
  prUrl: string;
  filename: string;
  contextLines?: number;
  lineLayout?: "split" | "unified";
  lineMode?: "semantic" | "raw";
  hideComments?: boolean;
  detectMoves?: boolean;
}

const summaryInputValidator = (data: SummaryInput) => data;
const fileDiffInputValidator = (data: FileDiffInput) => data;

const describeError = (error: unknown) => {
  if (Array.isArray(error)) {
    return { kind: "array", length: error.length, first: error[0] };
  }
  if (error && typeof error === "object" && "_tag" in error) {
    return { kind: "tagged", tag: (error as { _tag?: string })._tag, error };
  }
  if (error instanceof Error) {
    return { kind: "error", message: error.message, stack: error.stack };
  }
  return { kind: typeof error, error };
};

interface TaggedError {
  _tag?: string;
  message?: string;
  status?: number;
  resetAt?: string;
}

const isTaggedError = (error: unknown): error is TaggedError =>
  Boolean(error && typeof error === "object" && "_tag" in error);

const formatArrayError = (errors: unknown[]) => {
  if (errors.length === 0) {
    return { code: "UnknownError", message: "Unexpected error" };
  }
  const first = formatError(errors[0]);
  const suffix =
    errors.length > 1 ? ` (+${errors.length - 1} more errors)` : "";
  return { code: first.code, message: `${first.message}${suffix}` };
};

const formatTaggedError = (tag: string, error: TaggedError) => {
  const handlers: Record<string, () => { code: string; message: string }> = {
    InvalidPrUrl: () => ({
      code: tag,
      message:
        "Invalid PR URL. Use https://github.com/{owner}/{repo}/pull/{number}.",
    }),
    GitHubRateLimitError: () => {
      const reset =
        error.resetAt && Number.isFinite(Number(error.resetAt))
          ? new Date(Number(error.resetAt) * 1000).toLocaleString()
          : "later";
      return {
        code: tag,
        message: `GitHub rate limit exceeded. Resets at ${reset}. Set GITHUB_TOKEN to raise limits.`,
      };
    },
    GitHubRequestError: () => ({
      code: tag,
      message: `GitHub request failed${error.status ? ` (HTTP ${error.status})` : ""}${error.message ? `: ${error.message}` : "."}`,
    }),
    GitHubDecodeError: () => ({
      code: tag,
      message: "GitHub response could not be decoded.",
    }),
    PrFileNotFound: () => ({
      code: tag,
      message: "Requested file not found in this PR.",
    }),
  };
  const handler = handlers[tag];
  return handler
    ? handler()
    : {
        code: tag,
        message: error.message ?? "Unexpected error",
      };
};

const formatError = (error: unknown) => {
  if (Array.isArray(error)) {
    return formatArrayError(error);
  }
  if (isTaggedError(error)) {
    return formatTaggedError(error._tag ?? "UnknownError", error);
  }
  if (error instanceof Error) {
    return {
      code: "Error",
      message: error.message || "Unexpected error",
    };
  }
  return { code: "UnknownError", message: "Unexpected error" };
};

const runServerEffect = <A>(effect: Effect.Effect<A, unknown, PrDiffService>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(PrDiffLive),
      Effect.tapError((error) =>
        Effect.logError("Server effect failed", describeError(error))
      ),
      Effect.tapErrorCause((cause) =>
        Effect.logError("Server effect cause", Cause.pretty(cause))
      ),
      Effect.match({
        onSuccess: (data) => ({ ok: true, data }) satisfies ServerResult<A>,
        onFailure: (error) =>
          ({
            ok: false,
            error: formatError(error as { _tag?: string; message?: string }),
          }) satisfies ServerResult<A>,
      })
    )
  );

const runConfigEffect = <A>(effect: Effect.Effect<A, unknown, GitHubConfig>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(GitHubConfig.layer),
      Effect.match({
        onSuccess: (data) => ({ ok: true, data }) satisfies ServerResult<A>,
        onFailure: (error) =>
          ({
            ok: false,
            error: formatError(error as { _tag?: string; message?: string }),
          }) satisfies ServerResult<A>,
      })
    )
  );

export const getPrSummary = createServerFn({ method: "GET" })
  .inputValidator(summaryInputValidator)
  .handler(({ data }) => {
    const prUrl = data?.prUrl ?? "";
    return runServerEffect(
      Effect.gen(function* () {
        const service = yield* PrDiffService;
        return yield* service.getSummary(prUrl);
      })
    );
  });

export const getAuthStatus = createServerFn({ method: "GET" }).handler(() =>
  runConfigEffect(
    Effect.gen(function* () {
      const config = yield* GitHubConfig;
      return { hasToken: Option.isSome(config.token) } satisfies AuthStatus;
    })
  )
);

export const getFileDiff = createServerFn({ method: "GET" })
  .inputValidator(fileDiffInputValidator)
  .handler(({ data }) => {
    const prUrl = data?.prUrl ?? "";
    const filename = data?.filename ?? "";
    const contextLines =
      typeof data.contextLines === "number" &&
      Number.isFinite(data.contextLines)
        ? Math.min(Math.max(Math.trunc(data.contextLines), 0), 20)
        : 3;
    const lineLayout = data.lineLayout === "unified" ? "unified" : "split";
    const lineMode = data.lineMode === "raw" ? "raw" : "semantic";
    const hideComments = data.hideComments === true;
    const detectMoves =
      typeof data.detectMoves === "boolean" ? data.detectMoves : true;
    return runServerEffect(
      Effect.gen(function* () {
        const service = yield* PrDiffService;
        return yield* service.getFileDiff(
          prUrl,
          filename,
          contextLines,
          lineLayout,
          lineMode,
          hideComments,
          detectMoves
        );
      })
    );
  });
