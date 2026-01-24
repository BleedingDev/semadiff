import { Effect, Layer, Option, Schema } from "effect";
import {
  defaultConfig,
  structuralDiff,
  type DiffDocument,
} from "@semadiff/core";
import { lightningCssParsers } from "@semadiff/parser-lightningcss";
import { swcParsers } from "@semadiff/parser-swc";
import { treeSitterNodeParsers } from "@semadiff/parser-tree-sitter-node";
import {
  makeRegistry,
  ParserRegistry,
  type ParserRegistryService,
} from "@semadiff/parsers";
import { renderHtml } from "@semadiff/render-html";
import type { PrFileStatus, PrFileSummary, PrRef } from "../shared/types";
import { parsePrUrl } from "../shared/pr-url";
import {
  GitHubCache,
  GitHubCacheLive,
  GitHubClient,
  GitHubClientLive,
  GitHubConfig,
  InvalidPrUrl,
  GitHubRequestError,
  GitHubRateLimitError,
  GitHubDecodeError,
  type GitHubClientService,
  type PullRequest,
  type PullRequestFile,
} from "./github";

const parserRegistry = makeRegistry([
  ...swcParsers,
  ...treeSitterNodeParsers,
  ...lightningCssParsers,
]);
export const ParserRegistryLive = Layer.succeed(ParserRegistry, parserRegistry);
const GitHubClientLiveWithConfig = GitHubClientLive.pipe(
  Layer.provide(GitHubConfig.layer),
  Layer.provide(GitHubCacheLive)
);

export class PrFileNotFound extends Schema.TaggedError<PrFileNotFound>()(
  "PrFileNotFound",
  {
    filename: Schema.String,
  }
) {}

export type PrDiffError =
  | InvalidPrUrl
  | GitHubRequestError
  | GitHubRateLimitError
  | GitHubDecodeError
  | PrFileNotFound;

const MAX_FILE_SIZE = 1_000_000;
const LINE_SPLIT_RE = /\r?\n/;
const PR_CACHE_TTL_MS = 5 * 60 * 1000;
const FILE_CACHE_TTL_MS = 5 * 60 * 1000;
const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000;
const DIFF_CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_VERSION = "v4";
const SEMANTIC_CONTEXT_LINES = 0;

type CachedPrData = {
  ref: PrRef;
  pr: PullRequest;
  files: PullRequestFile[];
  fileMap: Map<string, PullRequestFile>;
  fetchedAt: number;
};

const countLines = (text?: string) =>
  text ? text.split(LINE_SPLIT_RE).length : 0;

const estimateReduction = (diff: DiffDocument) => {
  const operations = diff.operations.length;
  const changeLines = diff.operations.reduce(
    (total, op) => total + countLines(op.oldText) + countLines(op.newText),
    0
  );
  if (operations === 0 || changeLines === 0) {
    return { percent: 0, operations, changeLines };
  }
  const ratio = 1 - operations / changeLines;
  const clamped = Math.max(0, Math.min(1, ratio));
  return { percent: Math.round(clamped * 100), operations, changeLines };
};

const isBinary = (text: string) => text.includes("\u0000");

const normalizeStatus = (status: string): PrFileStatus => {
  switch (status) {
    case "added":
    case "removed":
    case "renamed":
    case "modified":
      return status;
    default:
      return "modified";
  }
};

const parsePrUrlEffect = Effect.fn("PrDiff.parsePrUrl")(function* (
  input: string
) {
  const parsed = parsePrUrl(input);
  if (!parsed) {
    return yield* InvalidPrUrl.make({ input });
  }
  return parsed;
});

const buildFileSummary = (
  file: PullRequestFile,
  overrides?: Partial<PrFileSummary>
): PrFileSummary => ({
  filename: file.filename,
  status: normalizeStatus(file.status),
  additions: file.additions,
  deletions: file.deletions,
  changes: file.changes,
  sha: file.sha,
  previousFilename: file.previous_filename ?? undefined,
  ...overrides,
});

const parseCachedJson = <T>(value: string): Option.Option<T> => {
  try {
    return Option.some(JSON.parse(value) as T);
  } catch {
    return Option.none();
  }
};

const summaryCacheKey = (
  ref: { owner: string; repo: string },
  pr: PullRequest,
  file: PullRequestFile
) =>
  `${CACHE_VERSION}:summary:${ref.owner}/${ref.repo}@${pr.base.sha}..${pr.head.sha}:${file.filename}`;

const diffCacheKey = (
  ref: { owner: string; repo: string },
  pr: PullRequest,
  file: PullRequestFile,
  contextLines: number,
  lineLayout: "split" | "unified",
  detectMoves: boolean
) =>
  `${CACHE_VERSION}:diff:${ref.owner}/${ref.repo}@${pr.base.sha}..${pr.head.sha}:${file.filename}:ctx=${contextLines}:layout=${lineLayout}:moves=${detectMoves ? "on" : "off"}`;

const fetchFilePair = Effect.fn("PrDiff.fetchFilePair")(function* (
  getFileText: GitHubClientService["getFileText"],
  ref: { owner: string; repo: string; baseSha: string; headSha: string },
  file: PullRequestFile
) {
  const oldPath = file.previous_filename ?? file.filename;
  const newPath = file.filename;

  const oldText =
    normalizeStatus(file.status) === "added"
      ? ""
      : yield* getFileText({
          owner: ref.owner,
          repo: ref.repo,
          sha: ref.baseSha,
          path: oldPath,
        });
  const newText =
    normalizeStatus(file.status) === "removed"
      ? ""
      : yield* getFileText({
          owner: ref.owner,
          repo: ref.repo,
          sha: ref.headSha,
          path: newPath,
        });

  return { oldText, newText, oldPath, newPath };
});

const computeDiff = Effect.fn("PrDiff.computeDiff")(function* (
  registry: ParserRegistryService,
  params: {
    oldText: string;
    newText: string;
    oldPath: string;
    newPath: string;
    detectMoves?: boolean;
  }
) {
  const oldParse = yield* registry.parse({
    content: params.oldText,
    path: params.oldPath,
  });
  const newParse = yield* registry.parse({
    content: params.newText,
    path: params.newPath,
  });
  const language =
    newParse.language !== "text" ? newParse.language : oldParse.language;

  const diff = structuralDiff(params.oldText, params.newText, {
    normalizers: defaultConfig.normalizers,
    language,
    oldRoot: oldParse.root,
    newRoot: newParse.root,
    oldTokens: oldParse.tokens,
    newTokens: newParse.tokens,
    detectMoves: params.detectMoves,
  });

  return { diff, language };
});

const summarizeFile = Effect.fn("PrDiff.summarizeFile")(function* (
  getFileText: GitHubClientService["getFileText"],
  registry: ParserRegistryService,
  ref: { owner: string; repo: string; baseSha: string; headSha: string },
  file: PullRequestFile
) {
  const { oldText, newText, oldPath, newPath } = yield* fetchFilePair(
    getFileText,
    ref,
    file
  );

  const oversized =
    oldText.length > MAX_FILE_SIZE || newText.length > MAX_FILE_SIZE;
  const binary = isBinary(oldText) || isBinary(newText);

  if (oversized || binary) {
    return buildFileSummary(file, { oversized, binary });
  }

  const { diff, language } = yield* computeDiff(registry, {
    oldText,
    newText,
    oldPath,
    newPath,
    detectMoves: true,
  });
  const reduction = estimateReduction(diff);

  return buildFileSummary(file, {
    reductionPercent: reduction.percent,
    operations: reduction.operations,
    moveCount: diff.moves.length,
    renameCount: diff.renames.length,
    language,
  });
});

const buildFileDiff = Effect.fn("PrDiff.buildFileDiff")(function* (
  getFileText: GitHubClientService["getFileText"],
  registry: ParserRegistryService,
  ref: { owner: string; repo: string; baseSha: string; headSha: string },
  file: PullRequestFile,
  contextLines: number,
  lineLayout: "split" | "unified",
  detectMoves: boolean
) {
  const { oldText, newText, oldPath, newPath } = yield* fetchFilePair(
    getFileText,
    ref,
    file
  );

  const oversized =
    oldText.length > MAX_FILE_SIZE || newText.length > MAX_FILE_SIZE;
  const binary = isBinary(oldText) || isBinary(newText);

  if (oversized || binary) {
    return {
      file: buildFileSummary(file, { oversized, binary }),
      semanticHtml: "",
      linesHtml: "",
    };
  }

  const { diff, language } = yield* computeDiff(registry, {
    oldText,
    newText,
    oldPath,
    newPath,
    detectMoves,
  });
  const reduction = estimateReduction(diff);
  const summary = buildFileSummary(file, {
    reductionPercent: reduction.percent,
    operations: reduction.operations,
    moveCount: diff.moves.length,
    renameCount: diff.renames.length,
    language,
  });

  const semanticHtml = renderHtml(diff, {
    title: `SemaDiff · ${summary.filename}`,
    filePath: summary.filename,
    view: "semantic",
    oldText,
    newText,
    contextLines: SEMANTIC_CONTEXT_LINES,
    lineLayout,
    language,
    showBanner: false,
    showSummary: false,
    showFilePath: false,
    layout: "embed",
  });
  const linesHtml = renderHtml(diff, {
    title: `SemaDiff · ${summary.filename}`,
    filePath: summary.filename,
    view: "lines",
    oldText,
    newText,
    contextLines,
    lineLayout,
    showBanner: false,
    showSummary: false,
    showFilePath: false,
    layout: "embed",
  });

  return { file: summary, semanticHtml, linesHtml };
});

export class PrDiffService extends Effect.Service<PrDiffService>()(
  "@semadiff/PrDiffService",
  {
    effect: Effect.gen(function* () {
      const github = yield* GitHubClient;
      const config = yield* GitHubConfig;
      const registry = yield* ParserRegistry;
      const cache = yield* GitHubCache;
      const prCache = new Map<string, CachedPrData>();
      const fileCache = new Map<string, { text: string; fetchedAt: number }>();
      const hasToken = Option.isSome(config.token);

      const getPrData = Effect.fn("PrDiff.getPrData")(function* (
        prUrl: string
      ) {
        const ref = yield* parsePrUrlEffect(prUrl);
        const key = `${ref.owner}/${ref.repo}#${ref.number}`;
        const now = Date.now();
        const cached = prCache.get(key);
        if (cached && now - cached.fetchedAt < PR_CACHE_TTL_MS) {
          return cached;
        }
        const pr = yield* github.getPullRequest(ref);
        const files = yield* github.listPullRequestFiles(ref);
        const entry: CachedPrData = {
          ref,
          pr,
          files,
          fileMap: new Map(files.map((file) => [file.filename, file])),
          fetchedAt: now,
        };
        prCache.set(key, entry);
        return entry;
      });

      const getFileTextCached = Effect.fn("PrDiff.getFileTextCached")(function* (
        params: Parameters<GitHubClientService["getFileText"]>[0]
      ) {
        const key = `${params.owner}/${params.repo}@${params.sha}:${params.path}`;
        const now = Date.now();
        const cached = fileCache.get(key);
        if (cached && now - cached.fetchedAt < FILE_CACHE_TTL_MS) {
          return cached.text;
        }
        const text = yield* github.getFileText(params);
        fileCache.set(key, { text, fetchedAt: now });
        return text;
      });

      const getSummary = Effect.fn("PrDiff.getSummary")(function* (
        prUrl: string
      ) {
        const { ref, pr, files } = yield* getPrData(prUrl);
        const summaries = hasToken
          ? yield* Effect.forEach(
              files,
              (file) =>
                Effect.gen(function* () {
                  const key = summaryCacheKey(ref, pr, file);
                  const cached = yield* cache.get(key);
                  if (Option.isSome(cached)) {
                    const parsed = parseCachedJson<PrFileSummary>(cached.value);
                    if (Option.isSome(parsed)) {
                      return parsed.value;
                    }
                  }
                  const summary = yield* summarizeFile(
                    getFileTextCached,
                    registry,
                    { ...ref, baseSha: pr.base.sha, headSha: pr.head.sha },
                    file
                  );
                  yield* cache.set(key, JSON.stringify(summary), SUMMARY_CACHE_TTL_MS);
                  return summary;
                }),
              { concurrency: 4 }
            )
          : files.map((file) => buildFileSummary(file));
        return {
          pr: {
            title: pr.title,
            url: pr.html_url,
            baseSha: pr.base.sha,
            headSha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
          },
          files: summaries,
        };
      });

      const getFileDiff = Effect.fn("PrDiff.getFileDiff")(function* (
        prUrl: string,
        filename: string,
        contextLines: number,
        lineLayout: "split" | "unified",
        detectMoves: boolean
      ) {
        const { ref, pr, files, fileMap } = yield* getPrData(prUrl);
        const file = fileMap.get(filename) ?? files.find((item) => item.filename === filename);
        if (!file) {
          return yield* PrFileNotFound.make({ filename });
        }
        const key = diffCacheKey(
          ref,
          pr,
          file,
          contextLines,
          lineLayout,
          detectMoves
        );
        const cached = yield* cache.get(key);
        if (Option.isSome(cached)) {
          const parsed = parseCachedJson<{
            file: PrFileSummary;
            semanticHtml: string;
            linesHtml: string;
          }>(cached.value);
          if (Option.isSome(parsed)) {
            return parsed.value;
          }
        }
        const result = yield* buildFileDiff(
          getFileTextCached,
          registry,
          { ...ref, baseSha: pr.base.sha, headSha: pr.head.sha },
          file,
          contextLines,
          lineLayout,
          detectMoves
        );
        yield* cache.set(key, JSON.stringify(result), DIFF_CACHE_TTL_MS);
        return result;
      });

      return { getSummary, getFileDiff };
    }),
    dependencies: [
      GitHubConfig.layer,
      GitHubCacheLive,
      GitHubClientLiveWithConfig,
      ParserRegistryLive,
    ],
  }
) {}

export const PrDiffLive = PrDiffService.Default;
