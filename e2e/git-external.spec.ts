import { execFileSync, execSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cliPath = join(process.cwd(), "packages", "cli", "dist", "index.js");

function runGit(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "semadiff-git-"));
  runGit(repo, ["init"]);
  runGit(repo, ["config", "user.email", "ci@localhost"]);
  runGit(repo, ["config", "user.name", "CI"]);
  return repo;
}

function setExternalDiff(repo: string): void {
  const diffExternal = `${JSON.stringify(process.execPath)} ${JSON.stringify(
    cliPath
  )} git-external`;
  runGit(repo, ["config", "diff.external", diffExternal]);
}

test.beforeAll(() => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });
});

test("git external diff works for diff, show, log", () => {
  const repo = initRepo();
  const filePath = join(repo, "file.txt");

  writeFileSync(filePath, "line one\n");
  runGit(repo, ["add", "file.txt"]);
  runGit(repo, ["commit", "-m", "init"]);

  writeFileSync(filePath, "line two\n");

  setExternalDiff(repo);

  const diffOutput = runGit(repo, ["diff", "--ext-diff"]);
  expect(diffOutput.length).toBeGreaterThan(0);

  const showOutput = runGit(repo, ["show", "--ext-diff", "HEAD"]);
  expect(showOutput.length).toBeGreaterThan(0);

  const logOutput = runGit(repo, ["log", "-p", "--ext-diff", "-1"]);
  expect(logOutput.length).toBeGreaterThan(0);
});

test("git external diff covers added and deleted files", () => {
  const repo = initRepo();

  const basePath = join(repo, "base.txt");
  writeFileSync(basePath, "base\n");
  runGit(repo, ["add", "base.txt"]);
  runGit(repo, ["commit", "-m", "base"]);

  setExternalDiff(repo);

  const addedPath = join(repo, "added.txt");
  writeFileSync(addedPath, "added\n");
  runGit(repo, ["add", "added.txt"]);
  const addOutput = runGit(repo, [
    "diff",
    "--ext-diff",
    "--cached",
    "--",
    "added.txt",
  ]);
  expect(addOutput.length).toBeGreaterThan(0);

  runGit(repo, ["rm", "base.txt"]);
  const deleteOutput = runGit(repo, [
    "diff",
    "--ext-diff",
    "--cached",
    "--",
    "base.txt",
  ]);
  expect(deleteOutput.length).toBeGreaterThan(0);
});

test("git external diff covers rename, copy, mode change", () => {
  const repo = initRepo();

  const originalPath = join(repo, "original.txt");
  const copySourcePath = join(repo, "copy-source.txt");
  writeFileSync(originalPath, "original\n");
  writeFileSync(copySourcePath, "copy source\n");
  runGit(repo, ["add", "original.txt", "copy-source.txt"]);
  runGit(repo, ["commit", "-m", "base"]);

  setExternalDiff(repo);

  runGit(repo, ["mv", "original.txt", "renamed.txt"]);

  const copyTargetPath = join(repo, "copy.txt");
  copyFileSync(copySourcePath, copyTargetPath);
  runGit(repo, ["add", "copy.txt"]);

  chmodSync(copySourcePath, 0o755);
  runGit(repo, ["add", "copy-source.txt"]);

  const output = runGit(repo, ["diff", "--ext-diff", "--cached", "-M", "-C"]);
  expect(output.length).toBeGreaterThan(0);
});

test("git external diff covers binary files and path edge cases", () => {
  const repo = initRepo();
  const unicodeName = "unicode-\u00e9.txt";
  const longName = `long-${"x".repeat(120)}.txt`;
  const spaceName = "space name.txt";
  const binaryName = "binary.bin";

  writeFileSync(join(repo, unicodeName), "alpha\n");
  writeFileSync(join(repo, longName), "bravo\n");
  writeFileSync(join(repo, spaceName), "charlie\n");
  writeFileSync(join(repo, binaryName), Buffer.from([0, 1, 2, 3, 4]));

  runGit(repo, ["add", unicodeName, longName, spaceName, binaryName]);
  runGit(repo, ["commit", "-m", "init"]);

  setExternalDiff(repo);

  writeFileSync(join(repo, unicodeName), "alpha two\n");
  writeFileSync(join(repo, longName), "bravo two\n");
  writeFileSync(join(repo, spaceName), "charlie two\n");
  writeFileSync(join(repo, binaryName), Buffer.from([0, 1, 2, 9, 4]));

  const unicodeOutput = runGit(repo, ["diff", "--ext-diff", "--", unicodeName]);
  expect(unicodeOutput.length).toBeGreaterThan(0);

  const longOutput = runGit(repo, ["diff", "--ext-diff", "--", longName]);
  expect(longOutput.length).toBeGreaterThan(0);

  const spaceOutput = runGit(repo, ["diff", "--ext-diff", "--", spaceName]);
  expect(spaceOutput.length).toBeGreaterThan(0);

  const binaryOutput = runGit(repo, ["diff", "--ext-diff", "--", binaryName]);
  expect(binaryOutput.length).toBeGreaterThan(0);
});
