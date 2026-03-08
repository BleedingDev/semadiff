import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { NormalizerLanguage } from "../../core/src/index.ts";
import { renderJson, structuralDiff } from "../../core/src/index.ts";
import { renderFileDiffHtml } from "../../pr-backend/src/pr-diff.ts";
import { renderHtml } from "../../render-html/src/index.ts";
import { renderTerminal } from "../../render-terminal/src/index.ts";
import { loadBenchmarkCases } from "../src/cases.js";
import { extractLinePayloadFromHtml } from "../src/run.js";

const caseRoot = join(import.meta.dirname, "../../../bench/cases/gold/micro");

function extractSemanticOpTypes(html: string) {
  return [
    ...html.matchAll(
      /<article class="sd-op sd-op--(insert|delete|update|move)"/g
    ),
  ].map((match) => match[1]);
}

function extractSummaryCards(html: string) {
  return [
    ...html.matchAll(
      /sd-summary-label">([^<]+)<\/div>\s*<div class="sd-summary-value">([^<]+)<\/div>/g
    ),
  ].map((match) => ({
    label: match[1],
    value: match[2],
  }));
}

function extractPills(html: string) {
  return [...html.matchAll(/<span class="sd-pill">([^<]+)<\/span>/g)].map(
    (match) => match[1]
  );
}

function extractLineRowTypes(html: string) {
  return [
    ...html.matchAll(/sd-line sd-line--(equal|insert|delete|replace|move)/g),
  ].map((match) => match[1]);
}

function projectJson(
  oldText: string,
  newText: string,
  language: NormalizerLanguage
) {
  const diff = structuralDiff(oldText, newText, { language });
  return JSON.parse(renderJson(diff)) as unknown;
}

function characterizeCase(caseId: string) {
  const benchmarkCase = loadBenchmarkCases(caseRoot).find(
    (entry) => entry.id === caseId
  );
  if (!benchmarkCase) {
    throw new Error(`Unknown benchmark case: ${caseId}`);
  }
  const file = benchmarkCase.files[0];
  if (!file) {
    throw new Error(`Case ${caseId} does not have a primary file.`);
  }

  const diff = structuralDiff(file.before, file.after, {
    language: benchmarkCase.language,
    detectMoves: true,
  });
  const semanticHtml = renderHtml(diff, {
    oldText: file.before,
    newText: file.after,
    language: benchmarkCase.language,
    filePath: file.newPath ?? file.oldPath ?? file.id,
    view: "semantic",
  });
  const lineHtml = renderHtml(diff, {
    oldText: file.before,
    newText: file.after,
    language: benchmarkCase.language,
    filePath: file.newPath ?? file.oldPath ?? file.id,
    view: "lines",
    lineMode: "semantic",
    lineLayout: "split",
    contextLines: 0,
    virtualize: true,
  });
  const prHtml = renderFileDiffHtml({
    filename: file.newPath ?? file.oldPath ?? file.id,
    diff,
    language: benchmarkCase.language,
    oldText: file.before,
    newText: file.after,
    oldTokens: undefined,
    newTokens: undefined,
    contextLines: 0,
    lineLayout: "split",
    lineMode: "semantic",
    hideComments: false,
  });

  return {
    id: benchmarkCase.id,
    json: projectJson(file.before, file.after, benchmarkCase.language),
    terminal: {
      semantic: renderTerminal(diff, {
        format: "plain",
        view: "semantic",
      }),
      lines: renderTerminal(diff, {
        format: "plain",
        view: "lines",
        layout: "unified",
        lineMode: "semantic",
        oldText: file.before,
        newText: file.after,
        language: benchmarkCase.language,
        contextLines: 0,
      }),
    },
    html: {
      summaryCards: extractSummaryCards(semanticHtml),
      pills: extractPills(semanticHtml),
      semanticOpTypes: extractSemanticOpTypes(semanticHtml),
      lineRows: extractLinePayloadFromHtml(lineHtml).rows.map((row) => ({
        type: row.type,
        oldLine: row.oldLine ?? null,
        newLine: row.newLine ?? null,
        text: row.text ?? null,
        oldText: row.oldText ?? null,
        newText: row.newText ?? null,
      })),
    },
    pr: {
      semanticOpTypes: extractSemanticOpTypes(prHtml.semanticHtml),
      lineRowTypes: extractLineRowTypes(prHtml.linesHtml),
    },
  };
}

describe("render surface characterization", () => {
  test("gold micro fixtures stay stable across JSON, terminal, HTML, and PR surfaces", () => {
    expect([
      characterizeCase("update-ts-001"),
      characterizeCase("rename-local-ts-001"),
      characterizeCase("move-with-edit-ts-001"),
      characterizeCase("tailwind-reorder-tsx-001"),
    ]).toMatchInlineSnapshot(`
      [
        {
          "html": {
            "lineRows": [
              {
                "newLine": null,
                "newText": null,
                "oldLine": null,
                "oldText": null,
                "text": null,
                "type": "hunk",
              },
              {
                "newLine": 1,
                "newText": "export const value = 2;",
                "oldLine": 1,
                "oldText": "export const value = 1;",
                "text": null,
                "type": "replace",
              },
            ],
            "pills": [],
            "semanticOpTypes": [
              "update",
            ],
            "summaryCards": [
              {
                "label": "Operations",
                "value": "1",
              },
              {
                "label": "Touched Lines",
                "value": "4",
              },
              {
                "label": "Updates",
                "value": "1",
              },
              {
                "label": "Insertions",
                "value": "0",
              },
              {
                "label": "Deletions",
                "value": "0",
              },
              {
                "label": "Moves",
                "value": "0",
              },
            ],
          },
          "id": "update-ts-001",
          "json": {
            "moves": [],
            "operations": [
              {
                "id": "op-1",
                "newRange": {
                  "end": {
                    "column": 1,
                    "line": 2,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "newText": "export const value = 2;
      ",
                "oldRange": {
                  "end": {
                    "column": 1,
                    "line": 2,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "oldText": "export const value = 1;
      ",
                "type": "update",
              },
            ],
            "renames": [],
            "version": "0.1.0",
          },
          "pr": {
            "lineRowTypes": [
              "replace",
            ],
            "semanticOpTypes": [
              "update",
            ],
          },
          "terminal": {
            "lines": "@@ -1,1 +1,1 @@
      1   - export const value = 1;
        1 + export const value = 2;",
            "semantic": "~ update 1",
          },
        },
        {
          "html": {
            "lineRows": [
              {
                "newLine": null,
                "newText": null,
                "oldLine": null,
                "oldText": null,
                "text": null,
                "type": "hunk",
              },
              {
                "newLine": 1,
                "newText": "export function compute(bar: number) {",
                "oldLine": 1,
                "oldText": "export function compute(foo: number) {",
                "text": null,
                "type": "replace",
              },
              {
                "newLine": 2,
                "newText": "  return bar + bar;",
                "oldLine": 2,
                "oldText": "  return foo + foo;",
                "text": null,
                "type": "replace",
              },
            ],
            "pills": [
              "Renames: foo → bar (3)",
            ],
            "semanticOpTypes": [
              "update",
            ],
            "summaryCards": [
              {
                "label": "Operations",
                "value": "1",
              },
              {
                "label": "Touched Lines",
                "value": "6",
              },
              {
                "label": "Updates",
                "value": "1",
              },
              {
                "label": "Insertions",
                "value": "0",
              },
              {
                "label": "Deletions",
                "value": "0",
              },
              {
                "label": "Moves",
                "value": "0",
              },
            ],
          },
          "id": "rename-local-ts-001",
          "json": {
            "moves": [],
            "operations": [
              {
                "id": "op-1",
                "meta": {
                  "renameGroupId": "rename-1",
                },
                "newRange": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "newText": "export function compute(bar: number) {
        return bar + bar;
      ",
                "oldRange": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "oldText": "export function compute(foo: number) {
        return foo + foo;
      ",
                "type": "update",
              },
            ],
            "renames": [
              {
                "confidence": 0.375,
                "from": "foo",
                "id": "rename-1",
                "occurrences": 3,
                "to": "bar",
              },
            ],
            "version": "0.1.0",
          },
          "pr": {
            "lineRowTypes": [
              "replace",
              "replace",
            ],
            "semanticOpTypes": [
              "update",
            ],
          },
          "terminal": {
            "lines": "@@ -1,2 +1,2 @@
      1   - export function compute(foo: number) {
        1 + export function compute(bar: number) {
      2   -   return foo + foo;
        2 +   return bar + bar;",
            "semantic": "~ update 1

      Renames:
      foo -> bar (3 occurrences)",
          },
        },
        {
          "html": {
            "lineRows": [
              {
                "newLine": null,
                "newText": null,
                "oldLine": null,
                "oldText": null,
                "text": null,
                "type": "hunk",
              },
              {
                "newLine": 5,
                "newText": "export function a() {",
                "oldLine": 1,
                "oldText": "export function a() {",
                "text": null,
                "type": "move",
              },
              {
                "newLine": 6,
                "newText": "  const value = 1;",
                "oldLine": 2,
                "oldText": "  const value = 1;",
                "text": null,
                "type": "move",
              },
              {
                "newLine": null,
                "newText": null,
                "oldLine": 3,
                "oldText": null,
                "text": "  return value;",
                "type": "delete",
              },
              {
                "newLine": 7,
                "newText": null,
                "oldLine": null,
                "oldText": null,
                "text": "  return value + 0;",
                "type": "insert",
              },
              {
                "newLine": 8,
                "newText": "}",
                "oldLine": 4,
                "oldText": "}",
                "text": null,
                "type": "move",
              },
            ],
            "pills": [
              "Moves: 1",
            ],
            "semanticOpTypes": [
              "move",
              "update",
            ],
            "summaryCards": [
              {
                "label": "Operations",
                "value": "2",
              },
              {
                "label": "Touched Lines",
                "value": "20",
              },
              {
                "label": "Updates",
                "value": "1",
              },
              {
                "label": "Insertions",
                "value": "0",
              },
              {
                "label": "Deletions",
                "value": "0",
              },
              {
                "label": "Moves",
                "value": "1",
              },
            ],
          },
          "id": "move-with-edit-ts-001",
          "json": {
            "moves": [
              {
                "confidence": 0.75,
                "id": "move-1",
                "newRange": {
                  "end": {
                    "column": 1,
                    "line": 9,
                  },
                  "start": {
                    "column": 1,
                    "line": 5,
                  },
                },
                "oldRange": {
                  "end": {
                    "column": 1,
                    "line": 5,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "operations": [
                  "move-1",
                  "move-1-update-1",
                ],
              },
            ],
            "operations": [
              {
                "id": "move-1",
                "meta": {
                  "confidence": 0.75,
                  "moveId": "move-1",
                },
                "newRange": {
                  "end": {
                    "column": 1,
                    "line": 9,
                  },
                  "start": {
                    "column": 1,
                    "line": 5,
                  },
                },
                "newText": "export function a() {
        const value = 1;
        return value + 0;
      }
      ",
                "oldRange": {
                  "end": {
                    "column": 1,
                    "line": 5,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "oldText": "export function a() {
        const value = 1;
        return value;
      }
      ",
                "type": "move",
              },
              {
                "id": "move-1-update-1",
                "meta": {
                  "confidence": 0.75,
                  "moveId": "move-1",
                },
                "newRange": {
                  "end": {
                    "column": 1,
                    "line": 9,
                  },
                  "start": {
                    "column": 1,
                    "line": 5,
                  },
                },
                "newText": "export function a() {
        const value = 1;
        return value + 0;
      }
      ",
                "oldRange": {
                  "end": {
                    "column": 1,
                    "line": 5,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "oldText": "export function a() {
        const value = 1;
        return value;
      }
      ",
                "type": "update",
              },
            ],
            "renames": [],
            "version": "0.1.0",
          },
          "pr": {
            "lineRowTypes": [
              "move",
              "move",
              "delete",
              "insert",
              "move",
            ],
            "semanticOpTypes": [
              "move",
              "update",
            ],
          },
          "terminal": {
            "lines": "@@ -1,4 +5,4 @@
      1 5 > export function a() {
      2 6 >   const value = 1;
      3   -   return value;
        7 +   return value + 0;
      4 8 > }",
            "semantic": "> move 1 -> 5
        ~ update 1",
          },
        },
        {
          "html": {
            "lineRows": [],
            "pills": [],
            "semanticOpTypes": [],
            "summaryCards": [
              {
                "label": "Operations",
                "value": "0",
              },
              {
                "label": "Touched Lines",
                "value": "0",
              },
              {
                "label": "Updates",
                "value": "0",
              },
              {
                "label": "Insertions",
                "value": "0",
              },
              {
                "label": "Deletions",
                "value": "0",
              },
              {
                "label": "Moves",
                "value": "0",
              },
            ],
          },
          "id": "tailwind-reorder-tsx-001",
          "json": {
            "moves": [],
            "operations": [],
            "renames": [],
            "version": "0.1.0",
          },
          "pr": {
            "lineRowTypes": [],
            "semanticOpTypes": [],
          },
          "terminal": {
            "lines": "Unable to render line diff.",
            "semantic": "No semantic changes detected.",
          },
        },
      ]
    `);
  });
});
