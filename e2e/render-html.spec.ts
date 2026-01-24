import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const renderHtmlUrl = distFileUrl(
  "packages",
  "render-html",
  "dist",
  "index.js"
);

test("large diff renders without crash", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 500 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const length = renderHtml(diff, { maxOperations: 100 }).length; console.log(JSON.stringify({ length }));"`
  ).toString();

  const lastLine = output.trim().split("\n").at(-1) ?? "";
  const parsed = JSON.parse(lastLine) as { length: number };
  expect(parsed.length).toBeGreaterThan(0);
});

test("virtualized output embeds data payload", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 50 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const html = renderHtml(diff, { virtualize: true, maxOperations: 10 }); console.log(JSON.stringify({ length: html.length, hasData: html.includes('semadiff-data'), hasStatus: html.includes('sd-status') }));"`
  ).toString();

  const parsed = JSON.parse(output) as {
    length: number;
    hasData: boolean;
    hasStatus: boolean;
  };
  expect(parsed.length).toBeGreaterThan(0);
  expect(parsed.hasData).toBe(true);
  expect(parsed.hasStatus).toBe(true);
});
