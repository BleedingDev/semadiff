import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, runBunEval } from "./helpers.js";

const renderHtmlUrl = distFileUrl(
  "packages",
  "render-html",
  "dist",
  "index.js"
);

test("large diff renders without crash", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 500 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const length = renderHtml(diff, { maxOperations: 100 }).length; console.log(JSON.stringify({ length }));`
  );

  const lastLine = output.trim().split("\n").at(-1) ?? "";
  const parsed = decodeJson<{ length: number }>(lastLine);
  expect(parsed.length).toBeGreaterThan(0);
});

test("virtualized output embeds data payload", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}'; const ops = Array.from({ length: 50 }, (_, idx) => ({ id: 'op-' + idx, type: 'update', oldText: 'old', newText: 'new' })); const diff = { version: '0.1.0', operations: ops, moves: [], renames: [] }; const html = renderHtml(diff, { virtualize: true, maxOperations: 10 }); console.log(JSON.stringify({ length: html.length, hasData: html.includes('__SEMADIFF_DATA__'), hasStatus: html.includes('sd-status') }));`
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

test("split line rows keep insert/delete on the correct side", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}';
const makeDiff = (ops) => ({ version: '0.1.0', operations: ops, moves: [], renames: [] });
const range = (line) => ({ start: { line, column: 1 }, end: { line, column: 2 } });
const insertHtml = renderHtml(makeDiff([{ id: 'op-insert', type: 'insert', newRange: range(2), newText: 'added' }]), {
  oldText: 'keep\\n',
  newText: 'keep\\nadded\\n',
  view: 'lines',
  lineLayout: 'split',
  lineMode: 'semantic',
  virtualize: false,
  contextLines: 6,
});
const deleteHtml = renderHtml(makeDiff([{ id: 'op-delete', type: 'delete', oldRange: range(2), oldText: 'removed' }]), {
  oldText: 'keep\\nremoved\\n',
  newText: 'keep\\n',
  view: 'lines',
  lineLayout: 'split',
  lineMode: 'semantic',
  virtualize: false,
  contextLines: 6,
});
const insertRow = insertHtml.match(/<div class="sd-line sd-line--insert">[\\s\\S]*?<\\/div>\\s*<\\/div>/)?.[0] ?? '';
const deleteRow = deleteHtml.match(/<div class="sd-line sd-line--delete">[\\s\\S]*?<\\/div>\\s*<\\/div>/)?.[0] ?? '';
console.log(JSON.stringify({
  insertOldBlank: /sd-cell--old"><\\/div>/.test(insertRow),
  insertNewHasText: /sd-cell--new">added<\\/div>/.test(insertRow),
  deleteOldHasText: /sd-cell--old">removed<\\/div>/.test(deleteRow),
  deleteNewBlank: /sd-cell--new"><\\/div>/.test(deleteRow),
  wrapsCode: insertHtml.includes('.sd-code {\\n  white-space: pre-wrap;'),
}));`
  );

  const parsed = decodeJson<{
    insertOldBlank: boolean;
    insertNewHasText: boolean;
    deleteOldHasText: boolean;
    deleteNewBlank: boolean;
    wrapsCode: boolean;
  }>(output);

  expect(parsed.insertOldBlank).toBe(true);
  expect(parsed.insertNewHasText).toBe(true);
  expect(parsed.deleteOldHasText).toBe(true);
  expect(parsed.deleteNewBlank).toBe(true);
  expect(parsed.wrapsCode).toBe(true);
});
