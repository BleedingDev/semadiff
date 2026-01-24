import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { distPath } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test.beforeAll(() => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });
});

test("console exporter emits spans for a CLI run", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-otel-"));
  const oldFile = join(tempDir, "old.txt");
  const newFile = join(tempDir, "new.txt");
  writeFileSync(oldFile, "const x = 1;\n");
  writeFileSync(newFile, "const y = 2;\n");

  const output = execSync(`node ${cliPath} diff ${oldFile} ${newFile}`, {
    env: {
      ...process.env,
      SEMADIFF_TELEMETRY_ENABLED: "true",
      SEMADIFF_TELEMETRY_EXPORTER: "console",
    },
  }).toString();

  expect(output).toContain('"span":"run"');
  expect(output).toContain('"span":"diff"');
  expect(output).toContain('"span":"render"');
  expect(output).toContain('"log":"diff_complete"');
});

test("telemetry disabled by default emits no spans", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-otel-"));
  const oldFile = join(tempDir, "old.txt");
  const newFile = join(tempDir, "new.txt");
  writeFileSync(oldFile, "const x = 1;\n");
  writeFileSync(newFile, "const y = 2;\n");

  const output = execSync(
    `node ${cliPath} diff --format plain ${oldFile} ${newFile}`,
    {
      env: {
        ...process.env,
        SEMADIFF_TELEMETRY_EXPORTER: "console",
      },
    }
  ).toString();

  expect(output).not.toContain('"span":"run"');
  expect(output).not.toContain('"span":"diff"');
  expect(output).not.toContain('"span":"render"');
});
