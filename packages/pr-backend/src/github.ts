import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
} from "effect";
import type { PrRef } from "./types.js";

const catchRecoverable = Effect.catchAll;

export interface GitHubConfigService {
  readonly apiBase: string;
  readonly rawBase: string;
  readonly token: Option.Option<Redacted.Redacted>;
}

export class GitHubConfig extends Context.Tag("@semadiff/GitHubConfig")<
  GitHubConfig,
  GitHubConfigService
>() {
  static readonly layer = Layer.effect(
    GitHubConfig,
    Effect.gen(function* () {
      const apiBase = yield* Config.string("GITHUB_API_BASE").pipe(
        Config.orElse(() => Config.succeed("https://api.github.com"))
      );
      const rawBase = yield* Config.string("GITHUB_RAW_BASE").pipe(
        Config.orElse(() => Config.succeed("https://raw.githubusercontent.com"))
      );
      const token = yield* Config.option(Config.redacted("GITHUB_TOKEN"));
      return GitHubConfig.of({ apiBase, rawBase, token });
    })
  );
}

export class InvalidPrUrl extends Schema.TaggedError<InvalidPrUrl>()(
  "InvalidPrUrl",
  {
    input: Schema.String,
  }
) {}

export class GitHubRequestError extends Schema.TaggedError<GitHubRequestError>()(
  "GitHubRequestError",
  {
    url: Schema.String,
    status: Schema.Number,
    message: Schema.String,
  }
) {}

export class GitHubRateLimitError extends Schema.TaggedError<GitHubRateLimitError>()(
  "GitHubRateLimitError",
  {
    url: Schema.String,
    resetAt: Schema.optional(Schema.String),
  }
) {}

export class GitHubDecodeError extends Schema.TaggedError<GitHubDecodeError>()(
  "GitHubDecodeError",
  {
    url: Schema.String,
    message: Schema.String,
  }
) {}

export interface GitHubCacheService {
  readonly get: (key: string) => Effect.Effect<Option.Option<string>>;
  readonly set: (
    key: string,
    value: string,
    ttlMs: number
  ) => Effect.Effect<void>;
}

export class GitHubCache extends Context.Tag("@semadiff/GitHubCache")<
  GitHubCache,
  GitHubCacheService
>() {}

const CACHE_BASE_PATH =
  process.env.SEMADIFF_CACHE_DIR ??
  path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CACHE_DB_PATH = path.resolve(
  CACHE_BASE_PATH,
  ".cache",
  "semadiff-github.sqlite"
);
const CACHE_JSON_PATH = path.resolve(
  CACHE_BASE_PATH,
  ".cache",
  "semadiff-github.json"
);
const RATE_LIMIT_REGEX = /rate limit/i;

const CacheEntrySchema = Schema.Struct({
  value: Schema.String,
  expiresAt: Schema.Number,
});
const CacheFileSchema = Schema.Struct({
  entries: Schema.optional(
    Schema.Array(Schema.Tuple(Schema.String, CacheEntrySchema))
  ),
});
const CacheFileJson = Schema.parseJson(CacheFileSchema);
const JsonUnknown = Schema.parseJson(Schema.Unknown);
const ErrorMessageJson = Schema.parseJson(
  Schema.Struct({ message: Schema.optional(Schema.String) })
);

interface SqliteStatement {
  get: (key: string) => unknown;
  run: (...args: readonly unknown[]) => void;
}

interface SqliteDatabase {
  exec: (sql: string) => void;
  query: (sql: string) => SqliteStatement;
}

interface SqliteModule {
  Database: new (...args: readonly string[]) => SqliteDatabase;
}

const makeFileCache = Effect.gen(function* () {
  const store = new Map<string, { value: string; expiresAt: number }>();

  yield* Effect.tryPromise(() =>
    fs.mkdir(path.dirname(CACHE_JSON_PATH), { recursive: true })
  ).pipe(catchRecoverable(() => Effect.void));

  const loaded = yield* Effect.tryPromise(async () => {
    const raw = await fs.readFile(CACHE_JSON_PATH, "utf8");
    const parsed = Schema.decodeUnknownSync(CacheFileJson)(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  }).pipe(catchRecoverable(() => Effect.succeed([])));

  for (const [key, entry] of loaded) {
    if (!entry || typeof entry.value !== "string") {
      continue;
    }
    store.set(key, {
      value: entry.value,
      expiresAt: Number(entry.expiresAt) || 0,
    });
  }

  const persist = (next: Map<string, { value: string; expiresAt: number }>) =>
    Effect.tryPromise(() => {
      const payload = Schema.encodeSync(CacheFileJson)({
        entries: [...next.entries()],
      });
      return fs.writeFile(CACHE_JSON_PATH, payload, "utf8");
    }).pipe(
      catchRecoverable(() => Effect.void),
      Effect.asVoid
    );

  yield* persist(store);

  return GitHubCache.of({
    get: (key) =>
      Effect.sync(() => {
        const entry = store.get(key);
        if (!entry) {
          return Option.none();
        }
        if (entry.expiresAt <= Date.now()) {
          store.delete(key);
          persist(store).pipe(Effect.runFork);
          return Option.none();
        }
        return Option.some(entry.value);
      }),
    set: (key, value, ttlMs) =>
      Effect.gen(function* () {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        yield* persist(store);
      }),
  });
});

export const GitHubCacheLive = Layer.effect(
  GitHubCache,
  Effect.gen(function* () {
    const fileCache = yield* makeFileCache;
    const bunAvailable =
      typeof (globalThis as { Bun?: unknown }).Bun !== "undefined" ||
      typeof (process.versions as { bun?: string | undefined }).bun ===
        "string";
    if (!bunAvailable) {
      return fileCache;
    }

    yield* Effect.tryPromise(() =>
      fs.mkdir(path.dirname(CACHE_DB_PATH), { recursive: true })
    ).pipe(catchRecoverable(() => Effect.void));

    const sqliteModule = yield* Effect.tryPromise(
      () =>
        // @ts-expect-error bun:sqlite exists only under Bun runtime
        import("bun:sqlite")
    ).pipe(catchRecoverable(() => Effect.succeed(null)));
    if (!sqliteModule) {
      return fileCache;
    }

    const Database = (sqliteModule as SqliteModule).Database;
    const db = new Database(CACHE_DB_PATH);
    db.exec(
      "CREATE TABLE IF NOT EXISTS github_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)"
    );
    const sqliteReady = yield* Effect.tryPromise(async () => {
      const stat = await fs.stat(CACHE_DB_PATH);
      return stat.isFile();
    }).pipe(catchRecoverable(() => Effect.succeed(false)));
    if (!sqliteReady) {
      return fileCache;
    }
    const getStmt = db.query(
      "SELECT value, expires_at FROM github_cache WHERE key = ?"
    );
    const setStmt = db.query(
      "INSERT OR REPLACE INTO github_cache (key, value, expires_at) VALUES (?, ?, ?)"
    );
    const deleteStmt = db.query("DELETE FROM github_cache WHERE key = ?");

    const sqliteCache = GitHubCache.of({
      get: (key) =>
        Effect.sync(() => {
          const row = getStmt.get(key) as
            | { value: string; expires_at: number }
            | undefined;
          if (!row) {
            return Option.none();
          }
          if (row.expires_at <= Date.now()) {
            deleteStmt.run(key);
            return Option.none();
          }
          return Option.some(row.value);
        }),
      set: (key, value, ttlMs) =>
        Effect.sync(() => {
          setStmt.run(key, value, Date.now() + ttlMs);
        }),
    });

    return GitHubCache.of({
      get: (key) =>
        sqliteCache
          .get(key)
          .pipe(
            Effect.flatMap((hit) =>
              Option.isSome(hit) ? Effect.succeed(hit) : fileCache.get(key)
            )
          ),
      set: (key, value, ttlMs) =>
        Effect.all(
          [
            sqliteCache.set(key, value, ttlMs),
            fileCache.set(key, value, ttlMs),
          ],
          { discard: true }
        ).pipe(Effect.asVoid),
    });
  })
);

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const RAW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const isRetryableError = (error: GitHubRequestError | GitHubRateLimitError) => {
  if (error._tag === "GitHubRateLimitError") {
    return true;
  }
  if (error._tag === "GitHubRequestError") {
    return error.status === 0 || error.status >= 500;
  }
  return false;
};

const retrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.intersect(Schedule.recurWhile(isRetryableError))
);

const withGitHubRetry = <A, R>(
  effect: Effect.Effect<A, GitHubRequestError | GitHubRateLimitError, R>
) => effect.pipe(Effect.retry(retrySchedule));

export const PullRequestSchema = Schema.Struct({
  title: Schema.String,
  html_url: Schema.String,
  base: Schema.Struct({ sha: Schema.String }),
  head: Schema.Struct({ sha: Schema.String }),
  additions: Schema.Number,
  deletions: Schema.Number,
  changed_files: Schema.Number,
});
export type PullRequest = Schema.Schema.Type<typeof PullRequestSchema>;

export const PullRequestFileSchema = Schema.Struct({
  filename: Schema.String,
  status: Schema.String,
  additions: Schema.Number,
  deletions: Schema.Number,
  changes: Schema.Number,
  sha: Schema.String,
  previous_filename: Schema.optional(Schema.String),
  patch: Schema.optional(Schema.String),
  blob_url: Schema.optional(Schema.String),
  raw_url: Schema.optional(Schema.String),
  contents_url: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
});
export type PullRequestFile = Schema.Schema.Type<typeof PullRequestFileSchema>;

export interface GitHubClientService {
  readonly getPullRequest: (
    ref: PrRef
  ) => Effect.Effect<
    PullRequest,
    GitHubRequestError | GitHubRateLimitError | GitHubDecodeError
  >;
  readonly listPullRequestFiles: (
    ref: PrRef
  ) => Effect.Effect<
    PullRequestFile[],
    GitHubRequestError | GitHubRateLimitError | GitHubDecodeError
  >;
  readonly getFileText: (params: {
    owner: string;
    repo: string;
    sha: string;
    path: string;
  }) => Effect.Effect<string, GitHubRequestError | GitHubRateLimitError>;
}

export class GitHubClient extends Context.Tag("@semadiff/GitHubClient")<
  GitHubClient,
  GitHubClientService
>() {}

const PullRequestJson = Schema.decodeUnknown(PullRequestSchema);

const encodePath = (path: string) =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const requestJson = Effect.fn("GitHub.requestJson")(function* (
  config: GitHubConfigService,
  cache: GitHubCacheService,
  url: string,
  ttlMs: number
) {
  const cacheKey = `json:${url}`;
  const cached = yield* cache.get(cacheKey);
  if (Option.isSome(cached)) {
    const decoded = yield* Schema.decodeUnknown(JsonUnknown)(cached.value).pipe(
      catchRecoverable(() => Effect.succeed(null))
    );
    if (decoded !== null) {
      return decoded;
    }
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (Option.isSome(config.token)) {
    headers.Authorization = `Bearer ${Redacted.value(config.token.value)}`;
  }

  const response = yield* Effect.tryPromise({
    try: () => fetch(url, { headers }),
    catch: (error) =>
      GitHubRequestError.make({
        url,
        status: 0,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

  if (!response.ok) {
    const bodyText = yield* Effect.tryPromise(() => response.text()).pipe(
      catchRecoverable(() => Effect.succeed(""))
    );
    let message = response.statusText;
    const parsed = yield* Schema.decodeUnknown(ErrorMessageJson)(bodyText).pipe(
      catchRecoverable(() => Effect.succeed(null))
    );
    if (parsed?.message) {
      message = parsed.message;
    } else if (bodyText) {
      message = bodyText;
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    const looksRateLimited =
      response.status === 429 ||
      remaining === "0" ||
      !!retryAfter ||
      RATE_LIMIT_REGEX.test(message);
    if (looksRateLimited) {
      return yield* GitHubRateLimitError.make({
        url,
        resetAt: response.headers.get("x-ratelimit-reset") ?? undefined,
      });
    }
    return yield* GitHubRequestError.make({
      url,
      status: response.status,
      message,
    });
  }

  const json = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (error) =>
      GitHubRequestError.make({
        url,
        status: response.status,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

  const encoded = yield* Schema.encode(JsonUnknown)(json).pipe(
    catchRecoverable(() => Effect.succeed(null))
  );
  if (encoded !== null) {
    yield* cache.set(cacheKey, encoded, ttlMs);
  }
  return json;
});

const requestText = Effect.fn("GitHub.requestText")(function* (
  config: GitHubConfigService,
  cache: GitHubCacheService,
  url: string,
  ttlMs: number
) {
  const cacheKey = `text:${url}`;
  const cached = yield* cache.get(cacheKey);
  if (Option.isSome(cached)) {
    return cached.value;
  }
  const headers: Record<string, string> = {};
  if (Option.isSome(config.token)) {
    headers.Authorization = `Bearer ${Redacted.value(config.token.value)}`;
  }

  const response = yield* Effect.tryPromise({
    try: () => fetch(url, { headers }),
    catch: (error) =>
      GitHubRequestError.make({
        url,
        status: 0,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

  if (!response.ok) {
    const bodyText = yield* Effect.tryPromise(() => response.text()).pipe(
      catchRecoverable(() => Effect.succeed(""))
    );
    let message = response.statusText;
    if (bodyText) {
      message = bodyText;
    }
    const remaining = response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    const looksRateLimited =
      response.status === 429 ||
      remaining === "0" ||
      !!retryAfter ||
      RATE_LIMIT_REGEX.test(message);
    if (looksRateLimited) {
      return yield* GitHubRateLimitError.make({
        url,
        resetAt: response.headers.get("x-ratelimit-reset") ?? undefined,
      });
    }
    return yield* GitHubRequestError.make({
      url,
      status: response.status,
      message,
    });
  }

  const text = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (error) =>
      GitHubRequestError.make({
        url,
        status: response.status,
        message: error instanceof Error ? error.message : String(error),
      }),
  });
  yield* cache.set(cacheKey, text, ttlMs);
  return text;
});

const getPullRequest = Effect.fn("GitHub.getPullRequest")(function* (
  config: GitHubConfigService,
  cache: GitHubCacheService,
  ref: PrRef
) {
  const url = `${config.apiBase}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  const json = yield* withGitHubRetry(
    requestJson(config, cache, url, API_CACHE_TTL_MS)
  );
  return yield* PullRequestJson(json).pipe(
    Effect.mapError((error) =>
      GitHubDecodeError.make({
        url,
        message: error instanceof Error ? error.message : String(error),
      })
    )
  );
});

const listPullRequestFiles = Effect.fn("GitHub.listPullRequestFiles")(
  function* (
    config: GitHubConfigService,
    cache: GitHubCacheService,
    ref: PrRef
  ) {
    const results: PullRequestFile[] = [];
    let page = 1;
    while (true) {
      const url = `${config.apiBase}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`;
      const json = yield* withGitHubRetry(
        requestJson(config, cache, url, API_CACHE_TTL_MS)
      );
      const decoded = yield* Schema.decodeUnknown(
        Schema.Array(PullRequestFileSchema)
      )(json).pipe(
        Effect.mapError((error) =>
          GitHubDecodeError.make({
            url,
            message: error instanceof Error ? error.message : String(error),
          })
        )
      );
      results.push(...decoded);
      if (decoded.length < 100) {
        break;
      }
      page += 1;
    }
    return results;
  }
);

const getFileText = Effect.fn("GitHub.getFileText")(function* (
  config: GitHubConfigService,
  cache: GitHubCacheService,
  params: {
    owner: string;
    repo: string;
    sha: string;
    path: string;
  }
) {
  const url = `${config.rawBase}/${params.owner}/${params.repo}/${params.sha}/${encodePath(
    params.path
  )}`;
  return yield* withGitHubRetry(
    requestText(config, cache, url, RAW_CACHE_TTL_MS)
  );
});

export const GitHubClientLive = Layer.effect(
  GitHubClient,
  Effect.gen(function* () {
    const config = yield* GitHubConfig;
    const cache = yield* GitHubCache;
    return GitHubClient.of({
      getPullRequest: (ref) => getPullRequest(config, cache, ref),
      listPullRequestFiles: (ref) => listPullRequestFiles(config, cache, ref),
      getFileText: (params) => getFileText(config, cache, params),
    });
  })
);
