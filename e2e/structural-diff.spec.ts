import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, runBunEval } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("reformat-only fixture yields no semantic edits", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const result = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const oldText = 'const   x = 1;'; const newText = 'const x = 1;'; const diff = structuralDiff(oldText, newText); console.log(renderJson(diff));`
  );

  const diff = decodeJson<{ operations: unknown[] }>(result);
  expect(diff.operations.length).toBe(0);
});

test("json key replacement stays as delete+insert operations", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const result = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const oldText = '{\\n  "name": 1,\\n}\\n'; const newText = '{\\n  "title": 1,\\n}\\n'; const diff = structuralDiff(oldText, newText, { language: 'json' }); console.log(renderJson(diff));`
  );

  const diff = decodeJson<{
    operations: { type: "delete" | "insert" | "update" | "move" }[];
  }>(result);
  expect(diff.operations.map((op) => op.type)).toEqual(["delete", "insert"]);
});
