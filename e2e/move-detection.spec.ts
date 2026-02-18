import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, runBunEval } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("moved block yields move op with confidence", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const oldText = 'export function a() {\\n  const value = 1;\\n  return value;\\n}\\n\\nexport function b() {\\n  return 2;\\n}\\n'; const newText = 'export function b() {\\n  return 2;\\n}\\n\\nexport function a() {\\n  const value = 1;\\n  return value;\\n}\\n'; const diff = structuralDiff(oldText, newText, { language: 'ts' }); console.log(renderJson(diff));`
  );

  const diff = decodeJson<{
    operations: { type: string; id: string; meta?: { moveId?: string } }[];
    moves: { confidence: number }[];
  }>(output);
  const moveOps = diff.operations.filter(
    (op: { type: string }) => op.type === "move"
  );
  expect(moveOps.length).toBeGreaterThan(0);
  expect(diff.moves[0].confidence).toBeGreaterThan(0);
});

test("moved block with edit yields nested update", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const oldText = 'export function a() {\\n  const value = 1;\\n  return value;\\n}\\n\\nexport function b() {\\n  return 2;\\n}\\n'; const newText = 'export function b() {\\n  return 2;\\n}\\n\\nexport function a() {\\n  const value = 1;\\n  return value + 0;\\n}\\n'; const diff = structuralDiff(oldText, newText, { language: 'ts' }); console.log(renderJson(diff));`
  );

  const diff = decodeJson<{
    operations: { type: string; id: string; meta?: { moveId?: string } }[];
  }>(output);
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
