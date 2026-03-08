import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  collectGitFileChanges,
  parseStdinFileChanges,
  resolveGitHybridMode,
} from "../src/git-hybrid.js";

const FROM_TO_ERROR_RE = /--from and --to/;
const SINGLE_SOURCE_ERROR_RE = /Choose only one input source/;
const tempDirectories: string[] = [];

function git(cwd: string, args: readonly string[]) {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeRepoFile(repoRoot: string, relativePath: string, text: string) {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, text);
}

function initRepository() {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "semadiff-git-hybrid-"));
  tempDirectories.push(repositoryRoot);
  git(repositoryRoot, ["init"]);
  git(repositoryRoot, ["config", "user.name", "Copilot"]);
  git(repositoryRoot, ["config", "user.email", "copilot@example.com"]);
  return repositoryRoot;
}

function commitAll(repositoryRoot: string, message: string) {
  git(repositoryRoot, ["add", "-A"]);
  git(repositoryRoot, ["commit", "-m", message]);
  return git(repositoryRoot, ["rev-parse", "HEAD"]);
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("git hybrid helpers", () => {
  test("resolves a single git input mode", () => {
    expect(
      resolveGitHybridMode({
        workingTree: false,
        staged: false,
        stdinFileChanges: false,
      })
    ).toEqual({ kind: "working-tree" });
    expect(
      resolveGitHybridMode({
        workingTree: false,
        staged: true,
        stdinFileChanges: false,
      })
    ).toEqual({ kind: "staged" });
    expect(() =>
      resolveGitHybridMode({
        workingTree: false,
        staged: false,
        from: "HEAD~1",
        stdinFileChanges: false,
      })
    ).toThrow(FROM_TO_ERROR_RE);
    expect(() =>
      resolveGitHybridMode({
        workingTree: false,
        staged: true,
        commit: "HEAD",
        stdinFileChanges: false,
      })
    ).toThrow(SINGLE_SOURCE_ERROR_RE);
  });

  test("parses stdin file changes and infers status", () => {
    const changes = parseStdinFileChanges(
      JSON.stringify([
        {
          newPath: "src/new.ts",
          newText: "export const created = true;\n",
        },
        {
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          oldText: "export const value = 1;\n",
          newText: "export const value = 2;\n",
          language: "ts",
        },
      ])
    );

    expect(changes).toEqual([
      {
        id: "src/new.ts",
        oldPath: null,
        newPath: "src/new.ts",
        status: "added",
        oldText: "",
        newText: "export const created = true;\n",
      },
      {
        id: "src/value.ts",
        oldPath: "src/value.ts",
        newPath: "src/value.ts",
        status: "modified",
        oldText: "export const value = 1;\n",
        newText: "export const value = 2;\n",
        language: "ts",
      },
    ]);
  });

  test("collects working tree changes including untracked files", () => {
    const repositoryRoot = initRepository();
    writeRepoFile(repositoryRoot, "src/value.ts", "export const value = 1;\n");
    commitAll(repositoryRoot, "initial");

    writeRepoFile(repositoryRoot, "src/value.ts", "export const value = 2;\n");
    writeRepoFile(repositoryRoot, "src/new.ts", "export const added = true;\n");

    const result = collectGitFileChanges({
      cwd: repositoryRoot,
      mode: { kind: "working-tree" },
    });
    const modified = result.changes.find(
      (change) => change.newPath === "src/value.ts"
    );
    const added = result.changes.find(
      (change) => change.newPath === "src/new.ts"
    );

    expect(result.source.kind).toBe("working-tree");
    expect(result.source.repositoryRoot?.endsWith(repositoryRoot)).toBe(true);
    expect(modified).toMatchObject({
      oldPath: "src/value.ts",
      newPath: "src/value.ts",
      status: "modified",
      oldText: "export const value = 1;\n",
      newText: "export const value = 2;\n",
    });
    expect(added).toMatchObject({
      oldPath: null,
      newPath: "src/new.ts",
      status: "added",
      oldText: "",
      newText: "export const added = true;\n",
    });
  });

  test("reads staged content from the index instead of the working tree", () => {
    const repositoryRoot = initRepository();
    writeRepoFile(repositoryRoot, "src/value.ts", "export const value = 1;\n");
    commitAll(repositoryRoot, "initial");

    writeRepoFile(repositoryRoot, "src/value.ts", "export const value = 2;\n");
    git(repositoryRoot, ["add", "src/value.ts"]);
    writeRepoFile(repositoryRoot, "src/value.ts", "export const value = 3;\n");

    const result = collectGitFileChanges({
      cwd: repositoryRoot,
      mode: { kind: "staged" },
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      oldPath: "src/value.ts",
      newPath: "src/value.ts",
      status: "modified",
      oldText: "export const value = 1;\n",
      newText: "export const value = 2;\n",
    });
  });

  test("collects renamed commit and range changes", () => {
    const repositoryRoot = initRepository();
    writeRepoFile(
      repositoryRoot,
      "src/value.ts",
      "export const value = 1;\nexport const label = 'before';\n"
    );
    const from = commitAll(repositoryRoot, "initial");

    git(repositoryRoot, ["mv", "src/value.ts", "src/renamed.ts"]);
    writeRepoFile(
      repositoryRoot,
      "src/renamed.ts",
      "export const value = 2;\nexport const label = 'before';\n"
    );
    const to = commitAll(repositoryRoot, "rename");

    const commitResult = collectGitFileChanges({
      cwd: repositoryRoot,
      mode: { kind: "commit", commit: to },
    });
    const rangeResult = collectGitFileChanges({
      cwd: repositoryRoot,
      mode: { kind: "range", from, to },
    });

    expect(commitResult.changes).toHaveLength(1);
    expect(commitResult.changes[0]).toMatchObject({
      oldPath: "src/value.ts",
      newPath: "src/renamed.ts",
      status: "renamed",
      oldText: "export const value = 1;\nexport const label = 'before';\n",
      newText: "export const value = 2;\nexport const label = 'before';\n",
    });
    expect(rangeResult.changes).toEqual(commitResult.changes);
  });
});
