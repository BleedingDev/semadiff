import { createServerFn } from "@tanstack/react-start";
import { Effect, Option } from "effect";
import type { AuthStatus, ServerResult } from "../shared/types";
import { PrDiffLive, PrDiffService } from "./pr-diff";
import { GitHubConfig } from "./github";

type SummaryInput = { prUrl: string };
type FileDiffInput = {
  prUrl: string;
  filename: string;
  contextLines?: number;
  lineLayout?: "split" | "unified";
  detectMoves?: boolean;
};

const summaryInputValidator = (data: SummaryInput) => data;
const fileDiffInputValidator = (data: FileDiffInput) => data;

const formatError = (error: unknown) => {
  if (error && typeof error === "object" && "_tag" in error) {
    const tag = (error as { _tag?: string })._tag ?? "UnknownError";
    switch (tag) {
      case "InvalidPrUrl":
        return {
          code: tag,
          message: "Invalid PR URL. Use https://github.com/{owner}/{repo}/pull/{number}.",
        };
      case "GitHubRateLimitError": {
        const resetAt = (error as { resetAt?: string }).resetAt;
        const reset =
          resetAt && Number.isFinite(Number(resetAt))
            ? new Date(Number(resetAt) * 1000).toLocaleString()
            : "later";
        return {
          code: tag,
          message: `GitHub rate limit exceeded. Resets at ${reset}. Set GITHUB_TOKEN to raise limits.`,
        };
      }
      case "GitHubRequestError": {
        const status = (error as { status?: number }).status;
        const message = (error as { message?: string }).message;
        return {
          code: tag,
          message: `GitHub request failed${status ? ` (HTTP ${status})` : ""}${message ? `: ${message}` : "."}`,
        };
      }
      case "GitHubDecodeError":
        return {
          code: tag,
          message: "GitHub response could not be decoded.",
        };
      case "PrFileNotFound":
        return {
          code: tag,
          message: "Requested file not found in this PR.",
        };
      default:
        return {
          code: tag,
          message: (error as { message?: string }).message ?? "Unexpected error",
        };
    }
  }
  return { code: "UnknownError", message: "Unexpected error" };
};

const runServerEffect = <A>(effect: Effect.Effect<A, unknown, PrDiffService>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(PrDiffLive),
      Effect.match({
        onSuccess: (data) => ({ ok: true, data } satisfies ServerResult<A>),
        onFailure: (error) =>
          ({
            ok: false,
            error: formatError(error as { _tag?: string; message?: string }),
          } satisfies ServerResult<A>),
      })
    )
  );

const runConfigEffect = <A>(effect: Effect.Effect<A, unknown, GitHubConfig>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(GitHubConfig.layer),
      Effect.match({
        onSuccess: (data) => ({ ok: true, data } satisfies ServerResult<A>),
        onFailure: (error) =>
          ({
            ok: false,
            error: formatError(error as { _tag?: string; message?: string }),
          } satisfies ServerResult<A>),
      })
    )
  );

export const getPrSummary = createServerFn({ method: "GET" })
  .inputValidator(summaryInputValidator)
  .handler(async ({ data }) => {
    const prUrl = data?.prUrl ?? "";
    return runServerEffect(
      Effect.gen(function* () {
        const service = yield* PrDiffService;
        return yield* service.getSummary(prUrl);
      })
    );
  });

export const getAuthStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    return runConfigEffect(
      Effect.gen(function* () {
        const config = yield* GitHubConfig;
        return { hasToken: Option.isSome(config.token) } satisfies AuthStatus;
      })
    );
  }
);

export const getFileDiff = createServerFn({ method: "GET" })
  .inputValidator(fileDiffInputValidator)
  .handler(async ({ data }) => {
    const prUrl = data?.prUrl ?? "";
    const filename = data?.filename ?? "";
    const contextLines =
      typeof data.contextLines === "number" && Number.isFinite(data.contextLines)
        ? Math.min(Math.max(Math.trunc(data.contextLines), 0), 20)
        : 3;
    const lineLayout = data.lineLayout === "unified" ? "unified" : "split";
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
          detectMoves
        );
      })
    );
  });
