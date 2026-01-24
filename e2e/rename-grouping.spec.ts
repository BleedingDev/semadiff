import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("rename fixture yields a single rename group", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { structuralDiff } from '${coreUrl}'; const oldText = 'const foo = 1;\\nfoo + foo'; const newText = 'const bar = 1;\\nbar + bar'; const diff = structuralDiff(oldText, newText); console.log(JSON.stringify(diff));"`
  ).toString();

  const diff = JSON.parse(output);
  expect(diff.renames.length).toBe(1);
  expect(diff.renames[0].from).toBe("foo");
  expect(diff.renames[0].to).toBe("bar");
});
