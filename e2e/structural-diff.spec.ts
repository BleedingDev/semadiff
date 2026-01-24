import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("reformat-only fixture yields no semantic edits", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const result = execSync(
    `node --input-type=module -e "import { structuralDiff } from '${coreUrl}'; const oldText = 'const   x = 1;'; const newText = 'const x = 1;'; const diff = structuralDiff(oldText, newText); console.log(JSON.stringify(diff));"`
  ).toString();

  const diff = JSON.parse(result);
  expect(diff.operations.length).toBe(0);
});
