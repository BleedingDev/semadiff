import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("moved block yields move op with confidence", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { structuralDiff } from '${coreUrl}'; const oldText = 'alpha\\nbeta\\ngamma\\ndelta'; const newText = 'alpha\\ndelta\\nbeta\\ngamma'; const diff = structuralDiff(oldText, newText); console.log(JSON.stringify(diff));"`
  ).toString();

  const diff = JSON.parse(output);
  const moveOps = diff.operations.filter(
    (op: { type: string }) => op.type === "move"
  );
  expect(moveOps.length).toBeGreaterThan(0);
  expect(diff.moves[0].confidence).toBeGreaterThan(0);
});

test("moved block with edit yields nested update", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { structuralDiff } from '${coreUrl}'; const oldText = 'alpha\\none\\ntwo\\nthree\\nomega'; const newText = 'alpha\\nomega\\none\\ntwo\\nthree updated'; const diff = structuralDiff(oldText, newText); console.log(JSON.stringify(diff));"`
  ).toString();

  const diff = JSON.parse(output);
  const moveOps = diff.operations.filter(
    (op: { type: string }) => op.type === "move"
  );
  const updateOps = diff.operations.filter(
    (op: { type: string; meta?: { moveId?: string } }) =>
      op.type === "update" && op.meta?.moveId
  );
  expect(moveOps.length).toBeGreaterThan(0);
  expect(updateOps.length).toBeGreaterThan(0);
  expect(updateOps[0].meta.moveId).toBe(moveOps[0].id);
});
