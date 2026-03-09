import type {
  FileDiffPayload,
  FileReviewGuide,
  GetFileDiffInput,
  GetFileReviewGuideInput,
  GetPrReviewSummaryInput,
  GetPrSummaryInput,
  PrDiffClientContract,
  PrDiffClientError,
  PrDiffLineLayout,
  PrDiffResult,
  PrFileSummary,
  PrReviewSummary,
  PrSummary,
} from "@semadiff/pr-client";
import { useEffect, useMemo, useState } from "react";

export interface PrefetchState {
  active: boolean;
  loaded: number;
  total: number;
  runId: number;
}

export interface SemaDiffSummaryClient {
  getPrSummary: (
    input: GetPrSummaryInput,
    request?: { signal?: AbortSignal }
  ) => ReturnType<PrDiffClientContract["getPrSummary"]>;
}

export interface SemaDiffFileDiffClient {
  getFileDiff: (
    input: GetFileDiffInput,
    request?: { signal?: AbortSignal }
  ) => ReturnType<PrDiffClientContract["getFileDiff"]>;
}

export interface SemaDiffReviewSummaryClient {
  getPrReviewSummary: (
    input: GetPrReviewSummaryInput,
    request?: { signal?: AbortSignal }
  ) => ReturnType<PrDiffClientContract["getPrReviewSummary"]>;
}

export interface SemaDiffFileReviewGuideClient {
  getFileReviewGuide: (
    input: GetFileReviewGuideInput,
    request?: { signal?: AbortSignal }
  ) => ReturnType<PrDiffClientContract["getFileReviewGuide"]>;
}

export interface UseSemaDiffExplorerOptions {
  client: SemaDiffSummaryClient &
    SemaDiffFileDiffClient &
    SemaDiffReviewSummaryClient &
    SemaDiffFileReviewGuideClient;
  prUrl?: string;
  contextLines?: number;
  initialLineLayout?: PrDiffLineLayout;
  initialHideComments?: boolean;
  initialCompareMoves?: boolean;
  debugLogger?:
    | ((event: string, details: Record<string, unknown>) => void)
    | undefined;
}

export interface UseSemaDiffExplorerResult {
  summary: PrSummary | null;
  summaryLoading: boolean;
  summaryError: PrDiffClientError | null;
  reviewSummary: PrReviewSummary | null;
  reviewSummaryLoading: boolean;
  reviewSummaryError: PrDiffClientError | null;
  selectedSummary: PrFileSummary | null;
  filteredFiles: PrFileSummary[];
  fileFilter: string;
  setFileFilter: (next: string) => void;
  selectedFile: string | null;
  setSelectedFile: (filename: string | null) => void;
  diffCache: Record<string, PrDiffResult<FileDiffPayload>>;
  diffResult: PrDiffResult<FileDiffPayload> | null;
  diffData: FileDiffPayload | null;
  diffError: PrDiffClientError | null;
  diffLoading: boolean;
  diffHtml: string | null;
  reviewGuideCache: Record<string, PrDiffResult<FileReviewGuide>>;
  reviewGuideResult: PrDiffResult<FileReviewGuide> | null;
  reviewGuideData: FileReviewGuide | null;
  reviewGuideError: PrDiffClientError | null;
  reviewGuideLoading: boolean;
  prefetchState: PrefetchState;
  lineLayout: PrDiffLineLayout;
  setLineLayout: (layout: PrDiffLineLayout) => void;
  hideComments: boolean;
  setHideComments: (value: boolean) => void;
  compareMoves: boolean;
  setCompareMoves: (value: boolean) => void;
  refresh: () => void;
}

export const toError = <T>(result: PrDiffResult<T> | null) =>
  result && !result.ok ? result.error : null;

export const toData = <T>(result: PrDiffResult<T> | null) =>
  result?.ok ? result.data : null;

const clampContextLines = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return -1;
  }
  return Math.min(Math.max(Math.trunc(value), -1), 20);
};

const logHookDebug = (
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

const reviewGuideCacheKey = (params: {
  filename: string;
  contextLines: number;
  compareMoves: boolean;
}) =>
  [
    params.filename,
    `context=${params.contextLines}`,
    `moves=${params.compareMoves ? "on" : "off"}`,
  ].join("|");

export const useSemaDiffExplorer = (
  options: UseSemaDiffExplorerOptions
): UseSemaDiffExplorerResult => {
  const prUrl = options.prUrl;
  const contextLines = clampContextLines(options.contextLines);
  const debugLogger = options.debugLogger;
  const [summaryResult, setSummaryResult] =
    useState<PrDiffResult<PrSummary> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [reviewSummaryResult, setReviewSummaryResult] =
    useState<PrDiffResult<PrReviewSummary> | null>(null);
  const [reviewSummaryLoading, setReviewSummaryLoading] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<
    Record<string, PrDiffResult<FileDiffPayload>>
  >({});
  const [reviewGuideCache, setReviewGuideCache] = useState<
    Record<string, PrDiffResult<FileReviewGuide>>
  >({});
  const [prefetchState, setPrefetchState] = useState<PrefetchState>({
    active: false,
    loaded: 0,
    total: 0,
    runId: 0,
  });
  const [lineLayout, setLineLayout] = useState<PrDiffLineLayout>(
    options.initialLineLayout ?? "unified"
  );
  const [hideComments, setHideComments] = useState(
    options.initialHideComments ?? false
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const [compareMoves, setCompareMoves] = useState(
    options.initialCompareMoves ?? true
  );
  const summary = toData(summaryResult);
  const reviewSummary = toData(reviewSummaryResult);

  useEffect(() => {
    if (!prUrl) {
      setSummaryResult(null);
      setSummaryLoading(false);
      logHookDebug(debugLogger, "summary:clear", {});
      return;
    }
    let active = true;
    setSummaryLoading(true);
    const controller = new AbortController();
    logHookDebug(debugLogger, "summary:fetch:start", {
      prUrl,
      refreshToken,
    });
    options.client
      .getPrSummary({ prUrl }, { signal: controller.signal })
      .then((result) => {
        if (active) {
          setSummaryResult(result);
          logHookDebug(debugLogger, "summary:fetch:complete", {
            prUrl,
            ok: result.ok,
          });
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [debugLogger, options.client, prUrl, refreshToken]);

  useEffect(() => {
    if (!prUrl) {
      setReviewSummaryResult(null);
      setReviewSummaryLoading(false);
      logHookDebug(debugLogger, "review-summary:clear", {});
      return;
    }
    let active = true;
    setReviewSummaryLoading(true);
    const controller = new AbortController();
    logHookDebug(debugLogger, "review-summary:fetch:start", {
      prUrl,
      refreshToken,
    });
    options.client
      .getPrReviewSummary({ prUrl }, { signal: controller.signal })
      .then((result) => {
        if (active) {
          setReviewSummaryResult(result);
          logHookDebug(debugLogger, "review-summary:fetch:complete", {
            prUrl,
            ok: result.ok,
          });
        }
      })
      .finally(() => {
        if (active) {
          setReviewSummaryLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [debugLogger, options.client, prUrl, refreshToken]);

  useEffect(() => {
    if (!summary?.files.length) {
      setSelectedFile(null);
      return;
    }
    setSelectedFile((current) => {
      if (current && summary.files.find((file) => file.filename === current)) {
        return current;
      }
      return summary.files[0]?.filename ?? null;
    });
  }, [summary?.files]);

  const filteredFiles = useMemo(() => {
    if (!summary) {
      return [];
    }
    const query = fileFilter.trim().toLowerCase();
    if (!query) {
      return summary.files;
    }
    return summary.files.filter((file) => {
      const filenameMatch = file.filename.toLowerCase().includes(query);
      const previousMatch = file.previousFilename
        ? file.previousFilename.toLowerCase().includes(query)
        : false;
      return filenameMatch || previousMatch;
    });
  }, [summary, fileFilter]);

  useEffect(() => {
    if (!summary) {
      return;
    }
    if (!fileFilter.trim()) {
      return;
    }
    if (!filteredFiles.length) {
      setSelectedFile(null);
      return;
    }
    if (
      selectedFile &&
      filteredFiles.some((file) => file.filename === selectedFile)
    ) {
      return;
    }
    setSelectedFile(filteredFiles[0]?.filename ?? null);
  }, [fileFilter, filteredFiles, selectedFile, summary]);

  useEffect(() => {
    if (!(summary && prUrl)) {
      setDiffCache({});
      setReviewGuideCache({});
      setPrefetchState({
        active: false,
        loaded: 0,
        total: 0,
        runId: refreshToken,
      });
      logHookDebug(debugLogger, "cache:clear", {
        prUrl,
        refreshToken,
      });
      return;
    }

    let active = true;
    const controllers = new Map<string, AbortController>();
    const files = summary.files.map((file) => file.filename);
    const total = files.length;
    const concurrency = Math.max(1, files.length);
    let index = 0;
    let inFlight = 0;
    let loaded = 0;
    const runId = refreshToken;

    setDiffCache({});
    setReviewGuideCache({});
    setPrefetchState({ active: true, loaded: 0, total, runId });
    logHookDebug(debugLogger, "diff-prefetch:start", {
      prUrl,
      total,
      contextLines,
      lineLayout,
      hideComments,
      compareMoves,
      runId,
    });

    const runNext = () => {
      if (!active) {
        return;
      }
      while (inFlight < concurrency && index < files.length) {
        const filename = files[index];
        index += 1;
        if (!filename) {
          continue;
        }
        inFlight += 1;

        const controller = new AbortController();
        controllers.set(filename, controller);
        options.client
          .getFileDiff(
            {
              prUrl,
              filename,
              contextLines,
              lineLayout,
              lineMode: "semantic",
              hideComments,
              detectMoves: compareMoves,
            },
            { signal: controller.signal }
          )
          .then((result) => {
            if (!active) {
              return;
            }
            setDiffCache((previous) => ({ ...previous, [filename]: result }));
            logHookDebug(debugLogger, "diff-prefetch:file-complete", {
              filename,
              ok: result.ok,
              runId,
            });
          })
          .finally(() => {
            if (!active) {
              return;
            }
            loaded += 1;
            inFlight -= 1;
            setPrefetchState((previous) => ({
              ...previous,
              loaded,
              active: loaded < total,
              runId,
            }));
            if (index >= files.length && inFlight === 0) {
              setPrefetchState((previous) => ({
                ...previous,
                active: false,
                runId,
              }));
              logHookDebug(debugLogger, "diff-prefetch:complete", {
                runId,
                total,
              });
              return;
            }
            runNext();
          });
      }
    };

    runNext();

    return () => {
      active = false;
      for (const controller of controllers.values()) {
        controller.abort();
      }
      setPrefetchState((previous) => ({
        ...previous,
        active: false,
        runId,
      }));
      logHookDebug(debugLogger, "diff-prefetch:abort", {
        runId,
      });
    };
  }, [
    debugLogger,
    summary,
    prUrl,
    contextLines,
    lineLayout,
    hideComments,
    refreshToken,
    compareMoves,
    options.client,
  ]);

  const selectedReviewGuideKey = useMemo(
    () =>
      selectedFile
        ? reviewGuideCacheKey({
            filename: selectedFile,
            contextLines,
            compareMoves,
          })
        : null,
    [compareMoves, contextLines, selectedFile]
  );

  useEffect(() => {
    if (!(prUrl && selectedFile && selectedReviewGuideKey)) {
      return;
    }
    if (reviewGuideCache[selectedReviewGuideKey]) {
      logHookDebug(debugLogger, "review-guide:cache-hit", {
        key: selectedReviewGuideKey,
        filename: selectedFile,
      });
      return;
    }

    let active = true;
    const controller = new AbortController();
    logHookDebug(debugLogger, "review-guide:fetch:start", {
      key: selectedReviewGuideKey,
      filename: selectedFile,
      contextLines,
      lineLayout,
      compareMoves,
    });
    options.client
      .getFileReviewGuide(
        {
          prUrl,
          filename: selectedFile,
          contextLines,
          lineLayout,
          detectMoves: compareMoves,
        },
        { signal: controller.signal }
      )
      .then((result) => {
        if (!active) {
          return;
        }
        setReviewGuideCache((previous) => ({
          ...previous,
          [selectedReviewGuideKey]: result,
        }));
        logHookDebug(debugLogger, "review-guide:fetch:complete", {
          key: selectedReviewGuideKey,
          filename: selectedFile,
          ok: result.ok,
        });
      });

    return () => {
      active = false;
      controller.abort();
      logHookDebug(debugLogger, "review-guide:fetch:abort", {
        key: selectedReviewGuideKey,
        filename: selectedFile,
      });
    };
  }, [
    compareMoves,
    contextLines,
    debugLogger,
    lineLayout,
    options.client,
    prUrl,
    reviewGuideCache,
    selectedFile,
    selectedReviewGuideKey,
  ]);

  const diffResult = selectedFile ? (diffCache[selectedFile] ?? null) : null;
  const diffData = toData(diffResult);
  const diffError = toError(diffResult);
  const diffLoading =
    !!selectedFile &&
    (!diffResult || (prefetchState.active && !diffCache[selectedFile]));
  const diffHtml = diffData?.linesHtml ?? null;
  const selectedSummary =
    summary?.files.find((file) => file.filename === selectedFile) ?? null;
  const reviewGuideResult = selectedReviewGuideKey
    ? (reviewGuideCache[selectedReviewGuideKey] ?? null)
    : null;
  const reviewGuideData = toData(reviewGuideResult);
  const reviewGuideError = toError(reviewGuideResult);
  const reviewGuideLoading =
    !!selectedFile &&
    !!selectedReviewGuideKey &&
    !reviewGuideCache[selectedReviewGuideKey];

  return {
    summary,
    summaryLoading,
    summaryError: toError(summaryResult),
    reviewSummary,
    reviewSummaryLoading,
    reviewSummaryError: toError(reviewSummaryResult),
    selectedSummary,
    filteredFiles,
    fileFilter,
    setFileFilter,
    selectedFile,
    setSelectedFile,
    diffCache,
    diffResult,
    diffData,
    diffError,
    diffLoading,
    diffHtml,
    reviewGuideCache,
    reviewGuideResult,
    reviewGuideData,
    reviewGuideError,
    reviewGuideLoading,
    prefetchState,
    lineLayout,
    setLineLayout,
    hideComments,
    setHideComments,
    compareMoves,
    setCompareMoves,
    refresh: () => setRefreshToken((value) => value + 1),
  };
};
