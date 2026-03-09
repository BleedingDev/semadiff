import { strict as assert } from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { bunBinary, decodeJson, distPath, encodeJson } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");
const TRAILING_SEMICOLON_RE = /;$/;

interface InspectPayload {
  diagnostics: {
    redacted: boolean;
    diff?: {
      operations: Array<{
        oldText?: string;
        newText?: string;
      }>;
    };
  };
  views: Record<string, string>;
}

function extractInspectPayload(html: string) {
  const prefix = "globalThis.__SEMADIFF_INSPECT__ = ";
  const start = html.indexOf(prefix);
  if (start === -1) {
    throw new Error("expected embedded inspect payload");
  }
  const scriptEnd = html.indexOf("</script>", start);
  if (scriptEnd === -1) {
    throw new Error("expected embedded inspect payload terminator");
  }

  const rawPayload = html
    .slice(start + prefix.length, scriptEnd)
    .trim()
    .replace(TRAILING_SEMICOLON_RE, "");

  return decodeJson<InspectPayload>(rawPayload);
}

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

test("inspect writes an HTML workbench with embedded markers", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-inspect-"));
  const oldFile = join(tempDir, "old.ts");
  const newFile = join(tempDir, "new.ts");
  const outputPath = join(tempDir, "inspect.html");
  writeFileSync(oldFile, "export const value = 1;\n");
  writeFileSync(newFile, "export const value = 2;\n");

  const output = execSync(
    `${bunBinary} ${encodeJson(cliPath)} inspect ${encodeJson(oldFile)} ${encodeJson(newFile)} --output ${encodeJson(outputPath)}`
  ).toString();

  expect(output).toContain(`Inspect workbench written to ${outputPath}`);

  const html = readFileSync(outputPath, "utf8");
  expect(html).toContain("<!doctype html>");
  expect(html).toContain("SemaDiff Inspect · old.ts ↔ new.ts");
  expect(html).toContain("Explanation panel");
  expect(html).toContain("Diagnostics summary");
  expect(html).toContain('title="SemaDiff inspect preview"');
  expect(html).toContain("Bundle redacted");
  expect(html).toContain("globalThis.__SEMADIFF_INSPECT__");

  const payload = extractInspectPayload(html);
  expect(payload.diagnostics.redacted).toBe(true);
  expect(Object.keys(payload.views).sort()).toEqual([
    "rawSplit",
    "rawUnified",
    "semanticSplit",
    "semanticStructure",
    "semanticUnified",
  ]);
  expect(
    payload.diagnostics.diff?.operations.every(
      (operation) =>
        operation.oldText === undefined && operation.newText === undefined
    )
  ).toBe(true);
});

test("inspect --include-code keeps source text in diagnostics bundle", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-inspect-code-"));
  const oldFile = join(tempDir, "old.ts");
  const newFile = join(tempDir, "new.ts");
  const outputPath = join(tempDir, "inspect-with-code.html");
  writeFileSync(oldFile, "export const value = 1;\n");
  writeFileSync(newFile, "export const value = 2;\n");

  execSync(
    `${bunBinary} ${encodeJson(cliPath)} inspect ${encodeJson(oldFile)} ${encodeJson(newFile)} --output ${encodeJson(outputPath)} --include-code`
  );

  const html = readFileSync(outputPath, "utf8");
  expect(html).toContain("Bundle includes code");

  const payload = extractInspectPayload(html);
  expect(payload.diagnostics.redacted).toBe(false);
  expect(payload.diagnostics.diff?.operations).toContainEqual(
    expect.objectContaining({
      oldText: "1",
      newText: "2",
    })
  );
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
