import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, effectUrl, runBunEval } from "./helpers.js";

const renderHtmlUrl = distFileUrl(
  "packages",
  "render-html",
  "dist",
  "index.js"
);

test("large diff renders without crash", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { Schema } from '${effectUrl}'; import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 500 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const length = renderHtml(diff, { maxOperations: 100 }).length; const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ length }));`
  );

  const lastLine = output.trim().split("\n").at(-1) ?? "";
  const parsed = decodeJson<{ length: number }>(lastLine);
  expect(parsed.length).toBeGreaterThan(0);
});

test("virtualized output embeds data payload", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { Schema } from '${effectUrl}'; import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 50 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const html = renderHtml(diff, { virtualize: true, maxOperations: 10 }); const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ length: html.length, hasData: html.includes('__SEMADIFF_DATA__'), hasStatus: html.includes('sd-status') }));`
  );

  const parsed = decodeJson<{
    length: number;
    hasData: boolean;
    hasStatus: boolean;
  }>(output);
  expect(parsed.length).toBeGreaterThan(0);
  expect(parsed.hasData).toBe(true);
  expect(parsed.hasStatus).toBe(true);
});
