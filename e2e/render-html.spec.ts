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
  insertNewHasText: /sd-cell--new"><span class="sd-inline-add">added<\\/span><\\/div>/.test(insertRow),
  deleteOldHasText: /sd-cell--old"><span class="sd-inline-del">removed<\\/span><\\/div>/.test(deleteRow),
  deleteNewBlank: /sd-cell--new"><\\/div>/.test(deleteRow),
  wrapsCode: insertHtml.includes('.sd-code {\\n  white-space: pre-wrap;'),
  hasCellBackgroundTint: insertHtml.includes('.sd-line--insert .sd-cell--new {\\n  background: rgba('),
}));`
  );

  const parsed = decodeJson<{
    insertOldBlank: boolean;
    insertNewHasText: boolean;
    deleteOldHasText: boolean;
    deleteNewBlank: boolean;
    wrapsCode: boolean;
    hasCellBackgroundTint: boolean;
  }>(output);

  expect(parsed.insertOldBlank).toBe(true);
  expect(parsed.insertNewHasText).toBe(true);
  expect(parsed.deleteOldHasText).toBe(true);
  expect(parsed.deleteNewBlank).toBe(true);
  expect(parsed.wrapsCode).toBe(true);
  expect(parsed.hasCellBackgroundTint).toBe(false);
});

test("semantic line mode auto-picks lower-noise rows when raw is cleaner", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}';
const diff = {
  version: '0.1.0',
  operations: [
    {
      id: 'op-delete',
      type: 'delete',
      oldRange: { start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
      oldText: 'c',
    },
  ],
  moves: [],
  renames: [],
};
const oldText = 'const v = 2;\\nc\\n';
const newText = 'd\\n';
const rowKinds = (html) =>
  [...html.matchAll(/<div class="sd-line sd-line--(equal|insert|delete|replace|move)/g)].map((match) => match[1]);
const semanticHtml = renderHtml(diff, {
  oldText,
  newText,
  language: 'ts',
  view: 'lines',
  lineMode: 'semantic',
  lineLayout: 'split',
  contextLines: 6,
  virtualize: false,
});
const rawHtml = renderHtml(diff, {
  oldText,
  newText,
  language: 'ts',
  view: 'lines',
  lineMode: 'raw',
  lineLayout: 'split',
  contextLines: 6,
  virtualize: false,
});
console.log(JSON.stringify({
  semanticKinds: rowKinds(semanticHtml),
  rawKinds: rowKinds(rawHtml),
}));`
  );

  const parsed = decodeJson<{
    semanticKinds: string[];
    rawKinds: string[];
  }>(output);

  expect(parsed.rawKinds).toEqual(["replace", "delete"]);
  expect(parsed.semanticKinds).toEqual(parsed.rawKinds);
});

test("unified line view highlights only changed token for delete/insert pairs", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}';
const diff = {
  version: '0.1.0',
  operations: [
    {
      id: 'op-update',
      type: 'update',
      oldRange: { start: { line: 3, column: 1 }, end: { line: 3, column: 40 } },
      newRange: { start: { line: 3, column: 1 }, end: { line: 3, column: 44 } },
      oldText: 'import "./.next/types/routes.d.ts"',
      newText: 'import "./.next/dev/types/routes.d.ts";',
    },
  ],
  moves: [],
  renames: [],
};
const oldText = '/// <reference types="next" />\\n/// <reference types="next/image-types/global" />\\nimport "./.next/types/routes.d.ts"\\n';
const newText = '/// <reference types="next" />\\n/// <reference types="next/image-types/global" />\\nimport "./.next/dev/types/routes.d.ts";\\n';
const html = renderHtml(diff, {
  oldText,
  newText,
  language: 'ts',
  view: 'lines',
  lineMode: 'semantic',
  lineLayout: 'unified',
  contextLines: 6,
  virtualize: false,
});
const hasInlineAdd = html.includes('sd-inline-add');
const hasWholeLineTint = html.includes('<span class="sd-inline-add">import "./.next/dev/types/routes.d.ts";</span>');
const hasDevToken = html.includes('dev');
console.log(JSON.stringify({ hasInlineAdd, hasWholeLineTint, hasDevToken }));`
  );

  const parsed = decodeJson<{
    hasInlineAdd: boolean;
    hasWholeLineTint: boolean;
    hasDevToken: boolean;
  }>(output);

  expect(parsed.hasInlineAdd).toBe(true);
  expect(parsed.hasDevToken).toBe(true);
  expect(parsed.hasWholeLineTint).toBe(false);
});

test("semantic line mode suppresses AST-projected formatting rows", () => {
  execSync("pnpm --filter @semadiff/render-html build", { stdio: "inherit" });

  const output = runBunEval(
    `import { renderHtml } from '${renderHtmlUrl}';
const oldText = 'const config =\\n  transpilePackages: ["@new-engine/ui", "@techsio/analytics"],\\n};';
const newText = 'const config =\\n  transpilePackages: [\\n    "@new-engine/ui",\\n    "@techsio/analytics",\\n    "@techsio/storefront-data",\\n  ],\\n};';
const diff = {
  version: '0.1.0',
  operations: [
    {
      id: 'op-insert',
      type: 'insert',
      newRange: { start: { line: 2, column: 23 }, end: { line: 6, column: 3 } },
      newText: '\\n    "@new-engine/ui",\\n    "@techsio/analytics",\\n    "@techsio/storefront-data",\\n  ',
    },
  ],
  moves: [],
  renames: [],
};
const rangeFor = (text, fragment, from = 0) => {
  const index = text.indexOf(fragment, from);
  if (index === -1) {
    throw new Error('Missing fragment: ' + fragment);
  }
  return { startIndex: index, endIndex: index + fragment.length };
};
const oldTokens = [
  rangeFor(oldText, 'transpilePackages'),
  rangeFor(oldText, '"@new-engine/ui"'),
  rangeFor(oldText, '"@techsio/analytics"'),
];
const newTokens = [
  rangeFor(newText, 'transpilePackages'),
  rangeFor(newText, '"@new-engine/ui"'),
  rangeFor(newText, '"@techsio/analytics"'),
  rangeFor(newText, '"@techsio/storefront-data"'),
];
const rowKinds = (html) =>
  [...html.matchAll(/<div class="sd-line sd-line--(equal|insert|delete|replace|move)/g)].map((match) => match[1]);
const withTokens = renderHtml(diff, {
  oldText,
  newText,
  language: 'ts',
  view: 'lines',
  lineMode: 'semantic',
  lineLayout: 'unified',
  contextLines: 6,
  virtualize: false,
  semanticTokens: { old: oldTokens, new: newTokens },
});
const withoutTokens = renderHtml(diff, {
  oldText,
  newText,
  language: 'ts',
  view: 'lines',
  lineMode: 'semantic',
  lineLayout: 'unified',
  contextLines: 6,
  virtualize: false,
});
const withTokenRows = rowKinds(withTokens);
const withoutTokenRows = rowKinds(withoutTokens);
const hasStorefrontInsert = withTokens.includes("sd-line--insert") && withTokens.includes("@techsio/storefront-data");
const hasAnchorInsert = withTokens.includes("transpilePackages: [");
const hasUiContextLine = withTokens.includes("@new-engine/ui");
const hasAnalyticsContextLine = withTokens.includes("@techsio/analytics");
const hasClosingBracket = withTokens.includes("],");
console.log(JSON.stringify({
  withTokenRows,
  withoutTokenRows,
  hasStorefrontInsert,
  hasAnchorInsert,
  hasUiContextLine,
  hasAnalyticsContextLine,
  hasClosingBracket,
  hasFallbackWarning: withTokens.includes('Raw line diff is shown'),
  hasGapRows: withTokens.includes('<div class="sd-line sd-line--gap">'),
}));`
  );

  const parsed = decodeJson<{
    withTokenRows: string[];
    withoutTokenRows: string[];
    hasStorefrontInsert: boolean;
    hasAnchorInsert: boolean;
    hasUiContextLine: boolean;
    hasAnalyticsContextLine: boolean;
    hasClosingBracket: boolean;
    hasFallbackWarning: boolean;
    hasGapRows: boolean;
  }>(output);

  expect(parsed.withTokenRows.length).toBeGreaterThan(4);
  expect(parsed.withoutTokenRows.length).toBeGreaterThan(
    parsed.withTokenRows.length
  );
  expect(parsed.hasStorefrontInsert).toBe(true);
  expect(parsed.hasAnchorInsert).toBe(true);
  expect(parsed.hasUiContextLine).toBe(true);
  expect(parsed.hasAnalyticsContextLine).toBe(true);
  expect(parsed.hasClosingBracket).toBe(true);
  expect(parsed.hasFallbackWarning).toBe(false);
  expect(parsed.hasGapRows).toBe(false);
});
