import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { bunBinary, distPath } from "./helpers.js";

const cliPath = distPath("packages", "cli", "dist", "index.js");

test("CLI supports stdin for one input", () => {
  execSync("pnpm --filter @semadiff/cli build", { stdio: "inherit" });

  const tempDir = mkdtempSync(join(tmpdir(), "semadiff-stdin-"));
  const newFile = join(tempDir, "new.txt");
  writeFileSync(newFile, "const value = 2;\n");

  const output = execSync(
    `${bunBinary} ${cliPath} diff --format plain - ${newFile}`,
    {
      input: "const value = 1;\n",
    }
  ).toString();

  expect(output.length).toBeGreaterThan(0);
});
