import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { BenchmarkAdapter } from "../src/index.js";
import {
  loadBenchmarkCases,
  runBenchmarkComparisonSuite,
} from "../src/index.js";
import type { BenchmarkCaseEvaluation } from "../src/types.js";

const caseRoot = join(import.meta.dirname, "../../../bench/cases/gold/micro");
const MISSING_TOOL_RESULT_RE = /Missing benchmark result for tool missing/;

function zeroSummaryPerformance(summary: {
  performance: {
    totalRuntimeMs: number;
    medianRuntimeMs: number | null;
    p95RuntimeMs: number | null;
  };
}) {
  return {
    ...summary,
    performance: {
      ...summary.performance,
      totalRuntimeMs: 0,
      medianRuntimeMs: 0,
      p95RuntimeMs: 0,
    },
  };
}

function stripDuration(value: {
  tool: string;
  evaluation: BenchmarkCaseEvaluation;
  output: {
    tool: string;
    caseId: string;
    capabilities: unknown;
    result: { durationMs: number };
  };
}) {
  return {
    tool: value.tool,
    evaluation: {
      ...value.evaluation,
      performance: {
        ...value.evaluation.performance,
        runtimeMs: 0,
      },
    },
    output: {
      ...value.output,
      result: {
        ...value.output.result,
        durationMs: 0,
      },
    },
  };
}

describe("benchmark comparison harness", () => {
  test("compares semadiff and git diff across lanes", () => {
    const report = runBenchmarkComparisonSuite(loadBenchmarkCases(caseRoot), {
      caseRoot,
      tools: ["semadiff", "git-diff"],
    });

    expect({
      tools: report.tools.map((entry) => ({
        tool: entry.tool,
        summary: zeroSummaryPerformance(entry.summary),
      })),
      cases: report.cases
        .filter((entry) =>
          ["move-with-edit-ts-001", "update-ts-001"].includes(entry.caseId)
        )
        .map((entry) => ({
          caseId: entry.caseId,
          results: entry.results.map((result) => stripDuration(result)),
        })),
    }).toMatchInlineSnapshot(`
      {
        "cases": [
          {
            "caseId": "move-with-edit-ts-001",
            "results": [
              {
                "evaluation": {
                  "entity": {
                    "actualChanges": 1,
                    "actualEntities": 4,
                    "changeF1": 1,
                    "changePrecision": 1,
                    "changeRecall": 1,
                    "entityF1": 1,
                    "entityPrecision": 1,
                    "entityRecall": 1,
                    "expectedChanges": 1,
                    "expectedEntities": 4,
                    "matchedChanges": 1,
                    "matchedEntities": 4,
                    "status": "scored",
                  },
                  "graph": {
                    "reason": "Case does not require graph capability.",
                    "status": "unsupported",
                  },
                  "performance": {
                    "moveCount": 1,
                    "operationCount": 2,
                    "renameCount": 0,
                    "runtimeMs": 0,
                    "status": "scored",
                  },
                  "review": {
                    "actualChangedLines": 8,
                    "actualMoves": 1,
                    "actualRenames": 0,
                    "changedLinePrecision": 1,
                    "changedLineRecall": 1,
                    "expectedChangedLines": 8,
                    "expectedMoves": 1,
                    "expectedRenames": 0,
                    "matchedChangedLines": 8,
                    "matchedMoves": 1,
                    "matchedRenames": 0,
                    "moveRecall": 1,
                    "renameRecall": null,
                    "status": "scored",
                  },
                },
                "output": {
                  "capabilities": {
                    "entity": true,
                    "graph": false,
                    "review": true,
                  },
                  "caseId": "move-with-edit-ts-001",
                  "result": {
                    "durationMs": 0,
                    "entities": {
                      "new": [
                        {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::b::1:8",
                          "kind": "function",
                          "name": "b",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 3,
                            "startLine": 1,
                          },
                        },
                        {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::a::5:8",
                          "kind": "function",
                          "name": "a",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 8,
                            "startLine": 5,
                          },
                        },
                      ],
                      "old": [
                        {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::a::1:8",
                          "kind": "function",
                          "name": "a",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 4,
                            "startLine": 1,
                          },
                        },
                        {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::b::6:8",
                          "kind": "function",
                          "name": "b",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 8,
                            "startLine": 6,
                          },
                        },
                      ],
                    },
                    "entityChanges": [
                      {
                        "after": {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::a::5:8",
                          "kind": "function",
                          "name": "a",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 8,
                            "startLine": 5,
                          },
                        },
                        "before": {
                          "exported": true,
                          "fileId": "src/example.ts",
                          "id": "src/example.ts::function::a::1:8",
                          "kind": "function",
                          "name": "a",
                          "path": "src/example.ts",
                          "range": {
                            "endLine": 4,
                            "startLine": 1,
                          },
                        },
                        "changeKinds": [
                          "moved",
                          "modified",
                        ],
                        "confidence": 1,
                        "id": "entity-change-1",
                        "kind": "function",
                        "linkedOperationIds": [
                          "move-1",
                          "move-1-update-1",
                        ],
                      },
                    ],
                    "moves": [
                      {
                        "confidence": 0.75,
                        "fileId": "src/example.ts",
                        "newRange": {
                          "endLine": 8,
                          "startLine": 5,
                        },
                        "oldRange": {
                          "endLine": 4,
                          "startLine": 1,
                        },
                        "operationIds": [
                          "move-1",
                          "move-1-update-1",
                        ],
                      },
                    ],
                    "operations": [
                      {
                        "fileId": "src/example.ts",
                        "moveId": "move-1",
                        "newRange": {
                          "endLine": 8,
                          "startLine": 5,
                        },
                        "oldRange": {
                          "endLine": 4,
                          "startLine": 1,
                        },
                        "type": "move",
                      },
                      {
                        "fileId": "src/example.ts",
                        "moveId": "move-1",
                        "newRange": {
                          "endLine": 8,
                          "startLine": 5,
                        },
                        "oldRange": {
                          "endLine": 4,
                          "startLine": 1,
                        },
                        "type": "update",
                      },
                    ],
                    "renames": [],
                    "reviewRows": [
                      {
                        "fileId": "src/example.ts",
                        "header": "@@ -1,4 +5,4 @@",
                        "hidden": undefined,
                        "newLine": null,
                        "newText": undefined,
                        "oldLine": null,
                        "oldText": undefined,
                        "text": undefined,
                        "type": "hunk",
                      },
                      {
                        "fileId": "src/example.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": 5,
                        "newText": "export function a() {",
                        "oldLine": 1,
                        "oldText": "export function a() {",
                        "text": undefined,
                        "type": "move",
                      },
                      {
                        "fileId": "src/example.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": 6,
                        "newText": "  const value = 1;",
                        "oldLine": 2,
                        "oldText": "  const value = 1;",
                        "text": undefined,
                        "type": "move",
                      },
                      {
                        "fileId": "src/example.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": null,
                        "newText": undefined,
                        "oldLine": 3,
                        "oldText": undefined,
                        "text": "  return value;",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": 7,
                        "newText": undefined,
                        "oldLine": null,
                        "oldText": undefined,
                        "text": "  return value + 0;",
                        "type": "insert",
                      },
                      {
                        "fileId": "src/example.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": 8,
                        "newText": "}",
                        "oldLine": 4,
                        "oldText": "}",
                        "text": undefined,
                        "type": "move",
                      },
                    ],
                  },
                  "tool": "semadiff",
                  "toolVersion": "0.1.0",
                },
                "tool": "semadiff",
              },
              {
                "evaluation": {
                  "entity": {
                    "reason": "Tool does not support the entity lane.",
                    "status": "unsupported",
                  },
                  "graph": {
                    "reason": "Case does not require graph capability.",
                    "status": "unsupported",
                  },
                  "performance": {
                    "moveCount": 0,
                    "operationCount": 0,
                    "renameCount": 0,
                    "runtimeMs": 0,
                    "status": "scored",
                  },
                  "review": {
                    "actualChangedLines": 10,
                    "actualMoves": 0,
                    "actualRenames": 0,
                    "changedLinePrecision": 0.8,
                    "changedLineRecall": 1,
                    "expectedChangedLines": 8,
                    "expectedMoves": 1,
                    "expectedRenames": 0,
                    "matchedChangedLines": 8,
                    "matchedMoves": 0,
                    "matchedRenames": 0,
                    "moveRecall": 0,
                    "renameRecall": null,
                    "status": "scored",
                  },
                },
                "output": {
                  "capabilities": {
                    "entity": false,
                    "graph": false,
                    "review": true,
                  },
                  "caseId": "move-with-edit-ts-001",
                  "result": {
                    "durationMs": 0,
                    "entities": {
                      "new": [],
                      "old": [],
                    },
                    "entityChanges": [],
                    "moves": [],
                    "operations": [],
                    "renames": [],
                    "reviewRows": [
                      {
                        "fileId": "src/example.ts",
                        "oldLine": 1,
                        "oldText": "export function a() {",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "oldLine": 2,
                        "oldText": "  const value = 1;",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "oldLine": 3,
                        "oldText": "  return value;",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "oldLine": 4,
                        "oldText": "}",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "oldLine": 5,
                        "oldText": "",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/example.ts",
                        "newLine": 4,
                        "newText": "",
                        "type": "insert",
                      },
                      {
                        "fileId": "src/example.ts",
                        "newLine": 5,
                        "newText": "export function a() {",
                        "type": "insert",
                      },
                      {
                        "fileId": "src/example.ts",
                        "newLine": 6,
                        "newText": "  const value = 1;",
                        "type": "insert",
                      },
                      {
                        "fileId": "src/example.ts",
                        "newLine": 7,
                        "newText": "  return value + 0;",
                        "type": "insert",
                      },
                      {
                        "fileId": "src/example.ts",
                        "newLine": 8,
                        "newText": "}",
                        "type": "insert",
                      },
                    ],
                  },
                  "tool": "git-diff",
                  "toolVersion": "git version 2.53.0",
                },
                "tool": "git-diff",
              },
            ],
          },
          {
            "caseId": "update-ts-001",
            "results": [
              {
                "evaluation": {
                  "entity": {
                    "actualChanges": 1,
                    "actualEntities": 2,
                    "changeF1": 1,
                    "changePrecision": 1,
                    "changeRecall": 1,
                    "entityF1": 1,
                    "entityPrecision": 1,
                    "entityRecall": 1,
                    "expectedChanges": 1,
                    "expectedEntities": 2,
                    "matchedChanges": 1,
                    "matchedEntities": 2,
                    "status": "scored",
                  },
                  "graph": {
                    "reason": "Case does not require graph capability.",
                    "status": "unsupported",
                  },
                  "performance": {
                    "moveCount": 0,
                    "operationCount": 1,
                    "renameCount": 0,
                    "runtimeMs": 0,
                    "status": "scored",
                  },
                  "review": {
                    "actualChangedLines": 2,
                    "actualMoves": 0,
                    "actualRenames": 0,
                    "changedLinePrecision": 1,
                    "changedLineRecall": 1,
                    "expectedChangedLines": 2,
                    "expectedMoves": 0,
                    "expectedRenames": 0,
                    "matchedChangedLines": 2,
                    "matchedMoves": 0,
                    "matchedRenames": 0,
                    "moveRecall": null,
                    "renameRecall": null,
                    "status": "scored",
                  },
                },
                "output": {
                  "capabilities": {
                    "entity": true,
                    "graph": false,
                    "review": true,
                  },
                  "caseId": "update-ts-001",
                  "result": {
                    "durationMs": 0,
                    "entities": {
                      "new": [
                        {
                          "exported": true,
                          "fileId": "src/value.ts",
                          "id": "src/value.ts::variable::value::1:14",
                          "kind": "variable",
                          "name": "value",
                          "path": "src/value.ts",
                          "range": {
                            "endLine": 1,
                            "startLine": 1,
                          },
                        },
                      ],
                      "old": [
                        {
                          "exported": true,
                          "fileId": "src/value.ts",
                          "id": "src/value.ts::variable::value::1:14",
                          "kind": "variable",
                          "name": "value",
                          "path": "src/value.ts",
                          "range": {
                            "endLine": 1,
                            "startLine": 1,
                          },
                        },
                      ],
                    },
                    "entityChanges": [
                      {
                        "after": {
                          "exported": true,
                          "fileId": "src/value.ts",
                          "id": "src/value.ts::variable::value::1:14",
                          "kind": "variable",
                          "name": "value",
                          "path": "src/value.ts",
                          "range": {
                            "endLine": 1,
                            "startLine": 1,
                          },
                        },
                        "before": {
                          "exported": true,
                          "fileId": "src/value.ts",
                          "id": "src/value.ts::variable::value::1:14",
                          "kind": "variable",
                          "name": "value",
                          "path": "src/value.ts",
                          "range": {
                            "endLine": 1,
                            "startLine": 1,
                          },
                        },
                        "changeKinds": [
                          "modified",
                        ],
                        "confidence": 1,
                        "id": "entity-change-1",
                        "kind": "variable",
                        "linkedOperationIds": [
                          "op-1",
                        ],
                      },
                    ],
                    "moves": [],
                    "operations": [
                      {
                        "fileId": "src/value.ts",
                        "newRange": {
                          "endLine": 1,
                          "startLine": 1,
                        },
                        "oldRange": {
                          "endLine": 1,
                          "startLine": 1,
                        },
                        "type": "update",
                      },
                    ],
                    "renames": [],
                    "reviewRows": [
                      {
                        "fileId": "src/value.ts",
                        "header": "@@ -1,1 +1,1 @@",
                        "hidden": undefined,
                        "newLine": null,
                        "newText": undefined,
                        "oldLine": null,
                        "oldText": undefined,
                        "text": undefined,
                        "type": "hunk",
                      },
                      {
                        "fileId": "src/value.ts",
                        "header": undefined,
                        "hidden": undefined,
                        "newLine": 1,
                        "newText": "export const value = 2;",
                        "oldLine": 1,
                        "oldText": "export const value = 1;",
                        "text": undefined,
                        "type": "replace",
                      },
                    ],
                  },
                  "tool": "semadiff",
                  "toolVersion": "0.1.0",
                },
                "tool": "semadiff",
              },
              {
                "evaluation": {
                  "entity": {
                    "reason": "Tool does not support the entity lane.",
                    "status": "unsupported",
                  },
                  "graph": {
                    "reason": "Case does not require graph capability.",
                    "status": "unsupported",
                  },
                  "performance": {
                    "moveCount": 0,
                    "operationCount": 0,
                    "renameCount": 0,
                    "runtimeMs": 0,
                    "status": "scored",
                  },
                  "review": {
                    "actualChangedLines": 2,
                    "actualMoves": 0,
                    "actualRenames": 0,
                    "changedLinePrecision": 1,
                    "changedLineRecall": 1,
                    "expectedChangedLines": 2,
                    "expectedMoves": 0,
                    "expectedRenames": 0,
                    "matchedChangedLines": 2,
                    "matchedMoves": 0,
                    "matchedRenames": 0,
                    "moveRecall": null,
                    "renameRecall": null,
                    "status": "scored",
                  },
                },
                "output": {
                  "capabilities": {
                    "entity": false,
                    "graph": false,
                    "review": true,
                  },
                  "caseId": "update-ts-001",
                  "result": {
                    "durationMs": 0,
                    "entities": {
                      "new": [],
                      "old": [],
                    },
                    "entityChanges": [],
                    "moves": [],
                    "operations": [],
                    "renames": [],
                    "reviewRows": [
                      {
                        "fileId": "src/value.ts",
                        "oldLine": 1,
                        "oldText": "export const value = 1;",
                        "type": "delete",
                      },
                      {
                        "fileId": "src/value.ts",
                        "newLine": 1,
                        "newText": "export const value = 2;",
                        "type": "insert",
                      },
                    ],
                  },
                  "tool": "git-diff",
                  "toolVersion": "git version 2.53.0",
                },
                "tool": "git-diff",
              },
            ],
          },
        ],
        "tools": [
          {
            "summary": {
              "entity": {
                "averageChangeF1": 1,
                "averageChangePrecision": 1,
                "averageChangeRecall": 1,
                "averageF1": 1,
                "averagePrecision": 1,
                "averageRecall": 1,
                "supportedCases": 6,
                "unsupportedCases": 0,
              },
              "graph": {
                "supportedCases": 0,
                "unsupportedCases": 6,
              },
              "performance": {
                "cases": 6,
                "medianRuntimeMs": 0,
                "p95RuntimeMs": 0,
                "totalRuntimeMs": 0,
              },
              "review": {
                "averageMoveRecall": 1,
                "averagePrecision": 1,
                "averageRecall": 0.8,
                "averageRenameRecall": 1,
                "cases": 5,
              },
            },
            "tool": "semadiff",
          },
          {
            "summary": {
              "entity": {
                "averageChangeF1": null,
                "averageChangePrecision": null,
                "averageChangeRecall": null,
                "averageF1": null,
                "averagePrecision": null,
                "averageRecall": null,
                "supportedCases": 0,
                "unsupportedCases": 6,
              },
              "graph": {
                "supportedCases": 0,
                "unsupportedCases": 6,
              },
              "performance": {
                "cases": 6,
                "medianRuntimeMs": 0,
                "p95RuntimeMs": 0,
                "totalRuntimeMs": 0,
              },
              "review": {
                "averageMoveRecall": 0,
                "averagePrecision": 0.76,
                "averageRecall": 0.6,
                "averageRenameRecall": 0,
                "cases": 5,
              },
            },
            "tool": "git-diff",
          },
        ],
      }
    `);
  });

  test("detects moved lines from git diff --color-moved", () => {
    const report = runBenchmarkComparisonSuite(loadBenchmarkCases(caseRoot), {
      caseRoot,
      tools: ["git-diff-color-moved"],
    });

    const moveWithEdit = report.cases.find(
      (entry) => entry.caseId === "move-with-edit-ts-001"
    );
    const result = moveWithEdit?.results[0];
    const review =
      result?.evaluation.review.status === "scored"
        ? result.evaluation.review
        : null;

    expect(review).not.toBeNull();
    expect(review?.actualMoves).toBeGreaterThan(0);
    expect(review?.moveRecall).toBeGreaterThan(0);
  });

  test("fails fast when an adapter result is missing from a case report", () => {
    const benchmarkCase = loadBenchmarkCases(caseRoot)[0];
    expect(benchmarkCase).toBeDefined();
    if (!benchmarkCase) {
      throw new Error("Expected a benchmark case to exist.");
    }

    const workingAdapter: BenchmarkAdapter = {
      tool: "working",
      toolVersion: "1.0.0",
      supportedCapabilities: benchmarkCase.capabilities,
      runCase(caseInput) {
        return {
          tool: "working",
          toolVersion: "1.0.0",
          caseId: caseInput.id,
          capabilities: caseInput.capabilities,
          result: {
            durationMs: 1,
            operations: [],
            moves: [],
            renames: [],
            entities: { old: [], new: [] },
            entityChanges: [],
            reviewRows: [],
          },
        };
      },
    };
    const mismatchedAdapter: BenchmarkAdapter = {
      tool: "missing",
      toolVersion: "1.0.0",
      supportedCapabilities: benchmarkCase.capabilities,
      runCase(caseInput) {
        return {
          tool: "unexpected",
          toolVersion: "1.0.0",
          caseId: caseInput.id,
          capabilities: caseInput.capabilities,
          result: {
            durationMs: 1,
            operations: [],
            moves: [],
            renames: [],
            entities: { old: [], new: [] },
            entityChanges: [],
            reviewRows: [],
          },
        };
      },
    };

    expect(() =>
      runBenchmarkComparisonSuite([benchmarkCase], {
        adapters: [workingAdapter, mismatchedAdapter],
      })
    ).toThrow(MISSING_TOOL_RESULT_RE);
  });
});
