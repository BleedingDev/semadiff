import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const NUL = "\0";
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
const WHITESPACE_RE = /\s+/;

export type GitHybridFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChangeInput {
  oldPath?: string | null | undefined;
  newPath?: string | null | undefined;
  status?: GitHybridFileStatus | undefined;
  oldText?: string | undefined;
  newText?: string | undefined;
  language?: string | undefined;
}

export interface ResolvedFileChange {
  id: string;
  oldPath: string | null;
  newPath: string | null;
  status: GitHybridFileStatus;
  oldText: string;
  newText: string;
  language?: string | undefined;
}

export interface GitHybridModeOptions {
  workingTree: boolean;
  staged: boolean;
  commit?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  stdinFileChanges: boolean;
}

export type GitHybridMode =
  | { kind: "working-tree" }
  | { kind: "staged" }
  | { kind: "commit"; commit: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "stdin-file-changes" };

export interface GitHybridSource {
  kind: "working-tree" | "staged" | "commit" | "range" | "stdin-file-changes";
  repositoryRoot?: string | undefined;
  commit?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface CollectedGitHybridInput {
  source: GitHybridSource;
  changes: readonly ResolvedFileChange[];
}

interface ParsedGitNameStatusEntry {
  status: GitHybridFileStatus;
  oldPath: string | null;
  newPath: string | null;
}

type GitTextSource =
  | { kind: "empty" }
  | { kind: "working-tree" }
  | { kind: "index" }
  | { kind: "revision"; revision: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNullableString(value: unknown) {
  return value === null ? null : asOptionalString(value);
}

function parseStatusToken(token: string): GitHybridFileStatus {
  switch (token[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "M":
      return "modified";
    default:
      throw new Error(`Unsupported git status token: ${token}`);
  }
}

function splitNulDelimited(raw: string) {
  const entries = raw.split(NUL);
  if (entries.at(-1) === "") {
    entries.pop();
  }
  return entries;
}

function runGit(args: readonly string[], cwd: string) {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: COMMAND_MAX_BUFFER,
  });
}

function stderrText(error: unknown) {
  if (!(error instanceof Error)) {
    return "";
  }
  const exited = error as Error & {
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
  return exited.stderr?.toString() ?? exited.stdout?.toString() ?? "";
}

function exitStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const exited = error as Error & { status?: number };
  return exited.status;
}

function isMissingRevisionError(error: unknown) {
  const stderr = stderrText(error);
  return (
    exitStatus(error) === 128 &&
    (stderr.includes("unknown revision") ||
      stderr.includes("Needed a single revision") ||
      stderr.includes("ambiguous argument"))
  );
}

function isMissingBlobError(error: unknown) {
  const stderr = stderrText(error);
  return (
    exitStatus(error) === 128 &&
    (stderr.includes("does not exist in") ||
      stderr.includes("exists on disk, but not in") ||
      stderr.includes("path not in the working tree"))
  );
}

function resolveRepositoryRoot(cwd: string) {
  return runGit(["rev-parse", "--show-toplevel"], cwd).trim();
}

function hasHead(repositoryRoot: string) {
  try {
    runGit(["rev-parse", "--verify", "HEAD"], repositoryRoot);
    return true;
  } catch (error) {
    if (isMissingRevisionError(error)) {
      return false;
    }
    throw error;
  }
}

function parseGitNameStatus(raw: string): ParsedGitNameStatusEntry[] {
  const tokens = splitNulDelimited(raw);
  const entries: ParsedGitNameStatusEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    const status = parseStatusToken(token);
    if (status === "renamed") {
      const oldPath = tokens[index + 1];
      const newPath = tokens[index + 2];
      if (!(oldPath && newPath)) {
        throw new Error(
          `Incomplete rename entry for git status token ${token}.`
        );
      }
      entries.push({
        status,
        oldPath,
        newPath,
      });
      index += 2;
      continue;
    }
    const filePath = tokens[index + 1];
    if (!filePath) {
      throw new Error(`Missing file path for git status token ${token}.`);
    }
    entries.push({
      status,
      oldPath: status === "added" ? null : filePath,
      newPath: status === "deleted" ? null : filePath,
    });
    index += 1;
  }
  return entries;
}

function listGitPaths(raw: string) {
  return splitNulDelimited(raw).filter((entry) => entry.length > 0);
}

function readGitBlob(
  repositoryRoot: string,
  source: GitTextSource,
  filePath: string
) {
  switch (source.kind) {
    case "empty":
      return "";
    case "working-tree":
      return readFileSync(resolve(repositoryRoot, filePath), "utf8");
    case "index":
      return runGit(["show", `:${filePath}`], repositoryRoot);
    case "revision":
      try {
        return runGit(
          ["show", `${source.revision}:${filePath}`],
          repositoryRoot
        );
      } catch (error) {
        if (isMissingBlobError(error)) {
          return null;
        }
        throw error;
      }
    default:
      throw new Error("Unsupported git text source.");
  }
}

function changeId(
  oldPath: string | null,
  newPath: string | null,
  index: number
) {
  return newPath ?? oldPath ?? `change-${index + 1}`;
}

function materializeGitChanges(params: {
  repositoryRoot: string;
  entries: readonly ParsedGitNameStatusEntry[];
  oldSource: GitTextSource;
  newSource: GitTextSource;
}): ResolvedFileChange[] {
  return params.entries.map((entry, index) => {
    const oldText =
      entry.oldPath === null
        ? ""
        : readGitBlob(params.repositoryRoot, params.oldSource, entry.oldPath);
    const newText =
      entry.newPath === null
        ? ""
        : readGitBlob(params.repositoryRoot, params.newSource, entry.newPath);
    if (oldText === null) {
      throw new Error(
        `Could not read ${entry.oldPath} from the requested git source.`
      );
    }
    if (newText === null) {
      throw new Error(
        `Could not read ${entry.newPath} from the requested git source.`
      );
    }
    return {
      id: changeId(entry.oldPath, entry.newPath, index),
      oldPath: entry.oldPath,
      newPath: entry.newPath,
      status: entry.status,
      oldText,
      newText,
    } satisfies ResolvedFileChange;
  });
}

function mergeUniqueEntries(
  entries: readonly ParsedGitNameStatusEntry[],
  additional: readonly ParsedGitNameStatusEntry[]
) {
  const merged = new Map<string, ParsedGitNameStatusEntry>();
  for (const entry of [...entries, ...additional]) {
    const key = `${entry.status}:${entry.oldPath ?? ""}->${entry.newPath ?? ""}`;
    merged.set(key, entry);
  }
  return [...merged.values()];
}

function firstParentRevision(repositoryRoot: string, commit: string) {
  const tokens = runGit(
    ["rev-list", "--parents", "-n", "1", commit],
    repositoryRoot
  )
    .trim()
    .split(WHITESPACE_RE)
    .filter((entry) => entry.length > 0);
  return tokens[1] ?? null;
}

function collectWorkingTreeChanges(cwd: string): CollectedGitHybridInput {
  const repositoryRoot = resolveRepositoryRoot(cwd);
  const headExists = hasHead(repositoryRoot);
  const trackedEntries = headExists
    ? parseGitNameStatus(
        runGit(
          [
            "diff",
            "--name-status",
            "-z",
            "-M",
            "--diff-filter=ACDMR",
            "HEAD",
            "--",
          ],
          repositoryRoot
        )
      )
    : listGitPaths(runGit(["ls-files", "-z"], repositoryRoot)).map(
        (filePath) => ({
          status: "added" as const,
          oldPath: null,
          newPath: filePath,
        })
      );
  const untrackedEntries = listGitPaths(
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], repositoryRoot)
  ).map((filePath) => ({
    status: "added" as const,
    oldPath: null,
    newPath: filePath,
  }));
  const entries = mergeUniqueEntries(trackedEntries, untrackedEntries);
  return {
    source: {
      kind: "working-tree",
      repositoryRoot,
    },
    changes: materializeGitChanges({
      repositoryRoot,
      entries,
      oldSource: headExists
        ? { kind: "revision", revision: "HEAD" }
        : { kind: "empty" },
      newSource: { kind: "working-tree" },
    }),
  };
}

function collectStagedChanges(cwd: string): CollectedGitHybridInput {
  const repositoryRoot = resolveRepositoryRoot(cwd);
  const headExists = hasHead(repositoryRoot);
  const baseRevision = headExists ? "HEAD" : EMPTY_TREE_SHA;
  const entries = parseGitNameStatus(
    runGit(
      [
        "diff",
        "--cached",
        "--name-status",
        "-z",
        "-M",
        "--diff-filter=ACDMR",
        baseRevision,
        "--",
      ],
      repositoryRoot
    )
  );
  return {
    source: {
      kind: "staged",
      repositoryRoot,
    },
    changes: materializeGitChanges({
      repositoryRoot,
      entries,
      oldSource: headExists
        ? { kind: "revision", revision: "HEAD" }
        : { kind: "empty" },
      newSource: { kind: "index" },
    }),
  };
}

function collectCommitChanges(
  cwd: string,
  commit: string
): CollectedGitHybridInput {
  const repositoryRoot = resolveRepositoryRoot(cwd);
  const parent = firstParentRevision(repositoryRoot, commit);
  const entries = parseGitNameStatus(
    runGit(
      [
        "diff-tree",
        "--name-status",
        "-z",
        "-M",
        "--diff-filter=ACDMR",
        "--no-commit-id",
        "--root",
        "-r",
        commit,
      ],
      repositoryRoot
    )
  );
  return {
    source: {
      kind: "commit",
      repositoryRoot,
      commit,
    },
    changes: materializeGitChanges({
      repositoryRoot,
      entries,
      oldSource: parent
        ? { kind: "revision", revision: parent }
        : { kind: "empty" },
      newSource: { kind: "revision", revision: commit },
    }),
  };
}

function collectRangeChanges(
  cwd: string,
  from: string,
  to: string
): CollectedGitHybridInput {
  const repositoryRoot = resolveRepositoryRoot(cwd);
  const entries = parseGitNameStatus(
    runGit(
      [
        "diff",
        "--name-status",
        "-z",
        "-M",
        "--diff-filter=ACDMR",
        from,
        to,
        "--",
      ],
      repositoryRoot
    )
  );
  return {
    source: {
      kind: "range",
      repositoryRoot,
      from,
      to,
    },
    changes: materializeGitChanges({
      repositoryRoot,
      entries,
      oldSource: { kind: "revision", revision: from },
      newSource: { kind: "revision", revision: to },
    }),
  };
}

function inferStatus(input: {
  oldPath: string | null;
  newPath: string | null;
  explicitStatus?: GitHybridFileStatus | undefined;
}) {
  if (input.explicitStatus) {
    return input.explicitStatus;
  }
  if (input.oldPath === null && input.newPath !== null) {
    return "added" satisfies GitHybridFileStatus;
  }
  if (input.oldPath !== null && input.newPath === null) {
    return "deleted" satisfies GitHybridFileStatus;
  }
  if (
    input.oldPath !== null &&
    input.newPath !== null &&
    input.oldPath !== input.newPath
  ) {
    return "renamed" satisfies GitHybridFileStatus;
  }
  return "modified" satisfies GitHybridFileStatus;
}

function requireStringField(
  value: string | undefined,
  field: string,
  index: number
): string {
  if (typeof value === "string") {
    return value;
  }
  throw new Error(
    `Expected file change ${index} to include a string ${field}.`
  );
}

export function parseStdinFileChanges(
  raw: string
): readonly ResolvedFileChange[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Expected stdin to be a JSON array of file changes.");
  }
  return parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected file change ${index} to be an object.`);
    }
    const oldPath = asOptionalNullableString(entry.oldPath) ?? null;
    const newPath = asOptionalNullableString(entry.newPath) ?? null;
    const explicitStatus = asOptionalString(entry.status);
    if (
      explicitStatus !== undefined &&
      !["added", "modified", "deleted", "renamed"].includes(explicitStatus)
    ) {
      throw new Error(
        `Unsupported file change status at index ${index}: ${explicitStatus}`
      );
    }
    const status = inferStatus({
      oldPath,
      newPath,
      explicitStatus: explicitStatus as GitHybridFileStatus | undefined,
    });
    const oldText =
      status === "added"
        ? (asOptionalString(entry.oldText) ?? "")
        : requireStringField(asOptionalString(entry.oldText), "oldText", index);
    const newText =
      status === "deleted"
        ? (asOptionalString(entry.newText) ?? "")
        : requireStringField(asOptionalString(entry.newText), "newText", index);
    const language = asOptionalString(entry.language);
    return {
      id: changeId(oldPath, newPath, index),
      oldPath,
      newPath,
      status,
      oldText,
      newText,
      ...(language ? { language } : {}),
    } satisfies ResolvedFileChange;
  });
}

export function resolveGitHybridMode(
  options: GitHybridModeOptions
): GitHybridMode {
  const commit = options.commit?.trim();
  const from = options.from?.trim();
  const to = options.to?.trim();
  const rangeSelected = Boolean(from || to);
  if (rangeSelected && !(from && to)) {
    throw new Error("Provide both --from and --to when selecting a git range.");
  }
  const selected = [
    options.workingTree,
    options.staged,
    Boolean(commit),
    Boolean(from && to),
    options.stdinFileChanges,
  ].filter(Boolean).length;
  if (selected > 1) {
    throw new Error(
      "Choose only one input source: working tree, staged, commit, range, or stdin file changes."
    );
  }
  if (options.stdinFileChanges) {
    return { kind: "stdin-file-changes" };
  }
  if (options.staged) {
    return { kind: "staged" };
  }
  if (commit) {
    return { kind: "commit", commit };
  }
  if (from && to) {
    return { kind: "range", from, to };
  }
  return { kind: "working-tree" };
}

export function collectGitFileChanges(params: {
  cwd: string;
  mode: Exclude<GitHybridMode, { kind: "stdin-file-changes" }>;
}): CollectedGitHybridInput {
  switch (params.mode.kind) {
    case "working-tree":
      return collectWorkingTreeChanges(params.cwd);
    case "staged":
      return collectStagedChanges(params.cwd);
    case "commit":
      return collectCommitChanges(params.cwd, params.mode.commit);
    case "range":
      return collectRangeChanges(params.cwd, params.mode.from, params.mode.to);
    default:
      throw new Error("Unsupported git hybrid mode.");
  }
}
