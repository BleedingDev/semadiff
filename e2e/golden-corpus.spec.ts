import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl, encodeJsonPretty, runBunEval } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("golden diff output matches expected snapshot", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const diff = structuralDiff('a', 'b'); console.log(renderJson(diff));`
  );

  const expected = encodeJsonPretty({
    version: "0.1.0",
    operations: [
      {
        id: "op-1",
        type: "update",
        oldRange: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 2 },
        },
        newRange: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 2 },
        },
        oldText: "a",
        newText: "b",
      },
    ],
    moves: [],
    renames: [],
  });

  expect(output.trim()).toBe(expected);
});
