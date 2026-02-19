import { strict as assert } from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { bunBinary, decodeJson, distPath, encodeJson } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test.beforeAll(() => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });
});

test("doctor emits structured runtime report", () => {
  const output = execSync(
    `${bunBinary} ${encodeJson(cliPath)} doctor`
  ).toString();
  const parsed = decodeJson<{
    bun: string;
    git: string;
    cwd: string;
    canWriteCwd: boolean;
    parsers: Record<
      string,
      {
        hasAstKinds: boolean;
        hasTokenRanges: boolean;
        supportsErrorRecovery: boolean;
        supportsIncrementalParse: boolean;
      }
    >;
  }>(output);

  assert.equal(typeof parsed.bun, "string");
  assert.equal(typeof parsed.git, "string");
  assert.equal(typeof parsed.cwd, "string");
  assert.equal(typeof parsed.canWriteCwd, "boolean");
  expect(parsed.parsers.swc).toBeDefined();
  expect(parsed.parsers.lightningcss).toBeDefined();
  expect(parsed.parsers["tree-sitter-wasm"]).toBeDefined();
});

test("explain returns semantic explanation JSON", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-explain-"));
  const oldFile = join(tempDir, "old.ts");
  const newFile = join(tempDir, "new.ts");
  writeFileSync(oldFile, "const alpha = 1;\n");
  writeFileSync(newFile, "const beta = 2;\n");

  const output = execSync(
    `${bunBinary} ${encodeJson(cliPath)} explain ${encodeJson(oldFile)} ${encodeJson(newFile)}`
  ).toString();
  const parsed = decodeJson<{
    version: string;
    operations: Array<{
      id: string;
      type: string;
      rationale: string;
    }>;
    moves: unknown[];
    renames: unknown[];
  }>(output);

  assert.equal(parsed.version, "0.1.0");
  expect(parsed.operations.length).toBeGreaterThan(0);
  expect(Array.isArray(parsed.moves)).toBe(true);
  expect(Array.isArray(parsed.renames)).toBe(true);
});

test("bench writes and reports baseline data", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-bench-"));
  const baselinePath = join(tempDir, "baseline.json");

  const output = execSync(
    `${bunBinary} ${encodeJson(cliPath)} bench --baseline ${encodeJson(baselinePath)} --write-baseline --threshold 0.5`
  ).toString();
  const parsed = decodeJson<{
    baselinePath: string;
    report: {
      threshold: number;
      cases: Array<{ id: string }>;
    };
    regressions: unknown[];
  }>(output);

  assert.equal(parsed.baselinePath, baselinePath);
  assert.equal(parsed.report.threshold, 0.5);
  expect(parsed.report.cases.length).toBeGreaterThan(0);
  expect(parsed.regressions).toEqual([]);

  const writtenBaseline = decodeJson<{ cases: unknown[] }>(
    readFileSync(baselinePath, "utf8")
  );
  expect(Array.isArray(writtenBaseline.cases)).toBe(true);
});

test("difftool runs with explicit local and remote files", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-difftool-"));
  const localPath = join(tempDir, "local.ts");
  const remotePath = join(tempDir, "remote.ts");
  writeFileSync(localPath, "const localValue = 1;\n");
  writeFileSync(remotePath, "const remoteValue = 2;\n");

  const output = execSync(
    `${bunBinary} ${encodeJson(cliPath)} difftool ${encodeJson(localPath)} ${encodeJson(remotePath)}`,
    {
      env: {
        ...process.env,
        SEMADIFF_RENDERER_FORMAT: "plain",
      },
    }
  ).toString();

  expect(output.length).toBeGreaterThan(0);
});
