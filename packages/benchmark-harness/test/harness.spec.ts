import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	loadBenchmarkCases,
	runBenchmarkSuite,
	runSemadiffCase,
} from "../src/index.js";

const caseRoot = join(import.meta.dirname, "../../../bench/cases/gold/micro");

function stripRuntime<T extends { result: { durationMs: number } }>(value: T) {
	return {
		...value,
		result: {
			...value.result,
			durationMs: 0,
		},
	};
}

describe("benchmark harness", () => {
	test("loads the seeded gold micro cases", () => {
		const cases = loadBenchmarkCases(caseRoot);
		expect(
			cases.map((benchmarkCase) => ({
				id: benchmarkCase.id,
				language: benchmarkCase.language,
				kind: benchmarkCase.kind,
				fileIds: benchmarkCase.files.map((file) => file.id),
				capabilities: benchmarkCase.capabilities,
			})),
		).toMatchInlineSnapshot(`
      [
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": false,
          },
          "fileIds": [
            "src/a.ts",
            "src/b.ts",
          ],
          "id": "cross-file-move-ts-001",
          "kind": "micro",
          "language": "ts",
        },
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": true,
          },
          "fileIds": [
            "src/rename.ts",
          ],
          "id": "function-rename-ts-001",
          "kind": "micro",
          "language": "ts",
        },
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": true,
          },
          "fileIds": [
            "src/example.ts",
          ],
          "id": "move-with-edit-ts-001",
          "kind": "micro",
          "language": "ts",
        },
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": true,
          },
          "fileIds": [
            "src/compute.ts",
          ],
          "id": "rename-local-ts-001",
          "kind": "micro",
          "language": "ts",
        },
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": true,
          },
          "fileIds": [
            "src/button.tsx",
          ],
          "id": "tailwind-reorder-tsx-001",
          "kind": "micro",
          "language": "tsx",
        },
        {
          "capabilities": {
            "entity": true,
            "graph": false,
            "review": true,
          },
          "fileIds": [
            "src/value.ts",
          ],
          "id": "update-ts-001",
          "kind": "micro",
          "language": "ts",
        },
      ]
    `);
	});

	test("projects the rename case through the semadiff adapter", () => {
		const benchmarkCase = loadBenchmarkCases(caseRoot).find(
			(entry) => entry.id === "rename-local-ts-001",
		);
		expect(benchmarkCase).toBeDefined();
		if (!benchmarkCase) {
			throw new Error("Expected rename-local-ts-001 to exist.");
		}
		expect(stripRuntime(runSemadiffCase(benchmarkCase))).toMatchInlineSnapshot(`
      {
        "capabilities": {
          "entity": true,
          "graph": false,
          "review": true,
        },
        "caseId": "rename-local-ts-001",
        "result": {
          "durationMs": 0,
          "entities": {
            "new": [
              {
                "exported": true,
                "fileId": "src/compute.ts",
                "id": "src/compute.ts::function::compute::1:8",
                "kind": "function",
                "name": "compute",
                "path": "src/compute.ts",
                "range": {
                  "endLine": 3,
                  "startLine": 1,
                },
              },
            ],
            "old": [
              {
                "exported": true,
                "fileId": "src/compute.ts",
                "id": "src/compute.ts::function::compute::1:8",
                "kind": "function",
                "name": "compute",
                "path": "src/compute.ts",
                "range": {
                  "endLine": 3,
                  "startLine": 1,
                },
              },
            ],
          },
          "entityChanges": [
            {
              "after": {
                "exported": true,
                "fileId": "src/compute.ts",
                "id": "src/compute.ts::function::compute::1:8",
                "kind": "function",
                "name": "compute",
                "path": "src/compute.ts",
                "range": {
                  "endLine": 3,
                  "startLine": 1,
                },
              },
              "before": {
                "exported": true,
                "fileId": "src/compute.ts",
                "id": "src/compute.ts::function::compute::1:8",
                "kind": "function",
                "name": "compute",
                "path": "src/compute.ts",
                "range": {
                  "endLine": 3,
                  "startLine": 1,
                },
              },
              "changeKinds": [
                "modified",
              ],
              "confidence": 1,
              "id": "entity-change-1",
              "kind": "function",
              "linkedOperationIds": [
                "op-1",
              ],
            },
          ],
          "moves": [],
          "operations": [
            {
              "fileId": "src/compute.ts",
              "newRange": {
                "endLine": 2,
                "startLine": 1,
              },
              "oldRange": {
                "endLine": 2,
                "startLine": 1,
              },
              "renameGroupId": "rename-1",
              "type": "update",
            },
          ],
          "renames": [
            {
              "confidence": 0.375,
              "from": "foo",
              "occurrences": 3,
              "to": "bar",
            },
          ],
          "reviewRows": [
            {
              "fileId": "src/compute.ts",
              "header": "@@ -1,2 +1,2 @@",
              "hidden": undefined,
              "newLine": null,
              "newText": undefined,
              "oldLine": null,
              "oldText": undefined,
              "text": undefined,
              "type": "hunk",
            },
            {
              "fileId": "src/compute.ts",
              "header": undefined,
              "hidden": undefined,
              "newLine": 1,
              "newText": "export function compute(bar: number) {",
              "oldLine": 1,
              "oldText": "export function compute(foo: number) {",
              "text": undefined,
              "type": "replace",
            },
            {
              "fileId": "src/compute.ts",
              "header": undefined,
              "hidden": undefined,
              "newLine": 2,
              "newText": "  return bar + bar;",
              "oldLine": 2,
              "oldText": "  return foo + foo;",
              "text": undefined,
              "type": "replace",
            },
          ],
        },
        "tool": "semadiff",
        "toolVersion": "0.1.0",
      }
    `);
	});

	test("scores single-file entity truth without explicit file ids", () => {
		const benchmarkCase = loadBenchmarkCases(caseRoot).find(
			(entry) => entry.id === "update-ts-001",
		);
		expect(benchmarkCase).toBeDefined();
		if (!benchmarkCase) {
			throw new Error("Expected update-ts-001 to exist.");
		}
		const report = runBenchmarkSuite([benchmarkCase], { caseRoot });
		const evaluation = report.cases[0]?.evaluation.entity;
		expect(evaluation).toEqual({
			status: "scored",
			expectedEntities: 2,
			actualEntities: 2,
			matchedEntities: 2,
			entityPrecision: 1,
			entityRecall: 1,
			entityF1: 1,
			expectedChanges: 1,
			actualChanges: 1,
			matchedChanges: 1,
			changePrecision: 1,
			changeRecall: 1,
			changeF1: 1,
		});
	});

	test("scores the seeded suite with stable review metrics", () => {
		const report = runBenchmarkSuite(loadBenchmarkCases(caseRoot), {
			caseRoot,
		});
		expect({
			cases: report.cases.map((entry) => ({
				caseId: entry.caseId,
				review: entry.evaluation.review,
				performance: {
					...entry.evaluation.performance,
					runtimeMs: 0,
				},
				output: stripRuntime(entry.output),
			})),
			summary: {
				...report.summary,
				performance: {
					...report.summary.performance,
					totalRuntimeMs: 0,
					medianRuntimeMs: 0,
					p95RuntimeMs: 0,
				},
			},
		}).toMatchInlineSnapshot(`
      {
        "cases": [
          {
            "caseId": "cross-file-move-ts-001",
            "output": {
              "capabilities": {
                "entity": true,
                "graph": false,
                "review": true,
              },
              "caseId": "cross-file-move-ts-001",
              "result": {
                "durationMs": 0,
                "entities": {
                  "new": [
                    {
                      "exported": true,
                      "fileId": "src/b.ts",
                      "id": "src/b.ts::function::helper::1:8",
                      "kind": "function",
                      "name": "helper",
                      "path": "src/b.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                  "old": [
                    {
                      "exported": true,
                      "fileId": "src/a.ts",
                      "id": "src/a.ts::function::helper::1:8",
                      "kind": "function",
                      "name": "helper",
                      "path": "src/a.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                },
                "entityChanges": [
                  {
                    "after": {
                      "exported": true,
                      "fileId": "src/b.ts",
                      "id": "src/b.ts::function::helper::1:8",
                      "kind": "function",
                      "name": "helper",
                      "path": "src/b.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "before": {
                      "exported": true,
                      "fileId": "src/a.ts",
                      "id": "src/a.ts::function::helper::1:8",
                      "kind": "function",
                      "name": "helper",
                      "path": "src/a.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "changeKinds": [
                      "moved",
                    ],
                    "confidence": 1,
                    "id": "entity-change-1",
                    "kind": "function",
                    "linkedOperationIds": [
                      "op-1",
                    ],
                  },
                ],
                "moves": [],
                "operations": [
                  {
                    "fileId": "src/a.ts",
                    "oldRange": {
                      "endLine": 3,
                      "startLine": 1,
                    },
                    "type": "delete",
                  },
                  {
                    "fileId": "src/b.ts",
                    "newRange": {
                      "endLine": 3,
                      "startLine": 1,
                    },
                    "type": "insert",
                  },
                ],
                "renames": [],
                "reviewRows": [
                  {
                    "fileId": "src/a.ts",
                    "header": "@@ -1,3 +0,0 @@",
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": undefined,
                    "type": "hunk",
                  },
                  {
                    "fileId": "src/a.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": 1,
                    "oldText": undefined,
                    "text": "export function helper() {",
                    "type": "delete",
                  },
                  {
                    "fileId": "src/a.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": 2,
                    "oldText": undefined,
                    "text": "  return 1;",
                    "type": "delete",
                  },
                  {
                    "fileId": "src/a.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": 3,
                    "oldText": undefined,
                    "text": "}",
                    "type": "delete",
                  },
                  {
                    "fileId": "src/b.ts",
                    "header": "@@ -0,0 +1,3 @@",
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": undefined,
                    "type": "hunk",
                  },
                  {
                    "fileId": "src/b.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 1,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": "export function helper() {",
                    "type": "insert",
                  },
                  {
                    "fileId": "src/b.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 2,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": "  return 1;",
                    "type": "insert",
                  },
                  {
                    "fileId": "src/b.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 3,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": "}",
                    "type": "insert",
                  },
                ],
              },
              "tool": "semadiff",
              "toolVersion": "0.1.0",
            },
            "performance": {
              "moveCount": 0,
              "operationCount": 2,
              "renameCount": 0,
              "runtimeMs": 0,
              "status": "scored",
            },
            "review": {
              "reason": "Case does not exercise the review lane.",
              "status": "unsupported",
            },
          },
          {
            "caseId": "function-rename-ts-001",
            "output": {
              "capabilities": {
                "entity": true,
                "graph": false,
                "review": true,
              },
              "caseId": "function-rename-ts-001",
              "result": {
                "durationMs": 0,
                "entities": {
                  "new": [
                    {
                      "exported": true,
                      "fileId": "src/rename.ts",
                      "id": "src/rename.ts::function::bar::1:8",
                      "kind": "function",
                      "name": "bar",
                      "path": "src/rename.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                  "old": [
                    {
                      "exported": true,
                      "fileId": "src/rename.ts",
                      "id": "src/rename.ts::function::foo::1:8",
                      "kind": "function",
                      "name": "foo",
                      "path": "src/rename.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                },
                "entityChanges": [
                  {
                    "after": {
                      "exported": true,
                      "fileId": "src/rename.ts",
                      "id": "src/rename.ts::function::bar::1:8",
                      "kind": "function",
                      "name": "bar",
                      "path": "src/rename.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "before": {
                      "exported": true,
                      "fileId": "src/rename.ts",
                      "id": "src/rename.ts::function::foo::1:8",
                      "kind": "function",
                      "name": "foo",
                      "path": "src/rename.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "changeKinds": [
                      "renamed",
                    ],
                    "confidence": 0.95,
                    "id": "entity-change-1",
                    "kind": "function",
                    "linkedOperationIds": [
                      "op-1",
                    ],
                  },
                ],
                "moves": [],
                "operations": [
                  {
                    "fileId": "src/rename.ts",
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
                    "fileId": "src/rename.ts",
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
                    "fileId": "src/rename.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 1,
                    "newText": "export function bar() {",
                    "oldLine": 1,
                    "oldText": "export function foo() {",
                    "text": undefined,
                    "type": "replace",
                  },
                ],
              },
              "tool": "semadiff",
              "toolVersion": "0.1.0",
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
              "changedLineRecall": 0.333,
              "expectedChangedLines": 6,
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
          {
            "caseId": "move-with-edit-ts-001",
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
          {
            "caseId": "rename-local-ts-001",
            "output": {
              "capabilities": {
                "entity": true,
                "graph": false,
                "review": true,
              },
              "caseId": "rename-local-ts-001",
              "result": {
                "durationMs": 0,
                "entities": {
                  "new": [
                    {
                      "exported": true,
                      "fileId": "src/compute.ts",
                      "id": "src/compute.ts::function::compute::1:8",
                      "kind": "function",
                      "name": "compute",
                      "path": "src/compute.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                  "old": [
                    {
                      "exported": true,
                      "fileId": "src/compute.ts",
                      "id": "src/compute.ts::function::compute::1:8",
                      "kind": "function",
                      "name": "compute",
                      "path": "src/compute.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                },
                "entityChanges": [
                  {
                    "after": {
                      "exported": true,
                      "fileId": "src/compute.ts",
                      "id": "src/compute.ts::function::compute::1:8",
                      "kind": "function",
                      "name": "compute",
                      "path": "src/compute.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "before": {
                      "exported": true,
                      "fileId": "src/compute.ts",
                      "id": "src/compute.ts::function::compute::1:8",
                      "kind": "function",
                      "name": "compute",
                      "path": "src/compute.ts",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                    "changeKinds": [
                      "modified",
                    ],
                    "confidence": 1,
                    "id": "entity-change-1",
                    "kind": "function",
                    "linkedOperationIds": [
                      "op-1",
                    ],
                  },
                ],
                "moves": [],
                "operations": [
                  {
                    "fileId": "src/compute.ts",
                    "newRange": {
                      "endLine": 2,
                      "startLine": 1,
                    },
                    "oldRange": {
                      "endLine": 2,
                      "startLine": 1,
                    },
                    "renameGroupId": "rename-1",
                    "type": "update",
                  },
                ],
                "renames": [
                  {
                    "confidence": 0.375,
                    "from": "foo",
                    "occurrences": 3,
                    "to": "bar",
                  },
                ],
                "reviewRows": [
                  {
                    "fileId": "src/compute.ts",
                    "header": "@@ -1,2 +1,2 @@",
                    "hidden": undefined,
                    "newLine": null,
                    "newText": undefined,
                    "oldLine": null,
                    "oldText": undefined,
                    "text": undefined,
                    "type": "hunk",
                  },
                  {
                    "fileId": "src/compute.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 1,
                    "newText": "export function compute(bar: number) {",
                    "oldLine": 1,
                    "oldText": "export function compute(foo: number) {",
                    "text": undefined,
                    "type": "replace",
                  },
                  {
                    "fileId": "src/compute.ts",
                    "header": undefined,
                    "hidden": undefined,
                    "newLine": 2,
                    "newText": "  return bar + bar;",
                    "oldLine": 2,
                    "oldText": "  return foo + foo;",
                    "text": undefined,
                    "type": "replace",
                  },
                ],
              },
              "tool": "semadiff",
              "toolVersion": "0.1.0",
            },
            "performance": {
              "moveCount": 0,
              "operationCount": 1,
              "renameCount": 1,
              "runtimeMs": 0,
              "status": "scored",
            },
            "review": {
              "actualChangedLines": 4,
              "actualMoves": 0,
              "actualRenames": 1,
              "changedLinePrecision": 1,
              "changedLineRecall": 0.667,
              "expectedChangedLines": 6,
              "expectedMoves": 0,
              "expectedRenames": 1,
              "matchedChangedLines": 4,
              "matchedMoves": 0,
              "matchedRenames": 1,
              "moveRecall": null,
              "renameRecall": 1,
              "status": "scored",
            },
          },
          {
            "caseId": "tailwind-reorder-tsx-001",
            "output": {
              "capabilities": {
                "entity": true,
                "graph": false,
                "review": true,
              },
              "caseId": "tailwind-reorder-tsx-001",
              "result": {
                "durationMs": 0,
                "entities": {
                  "new": [
                    {
                      "exported": true,
                      "fileId": "src/button.tsx",
                      "id": "src/button.tsx::function::Button::1:8",
                      "kind": "function",
                      "name": "Button",
                      "path": "src/button.tsx",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                  "old": [
                    {
                      "exported": true,
                      "fileId": "src/button.tsx",
                      "id": "src/button.tsx::function::Button::1:8",
                      "kind": "function",
                      "name": "Button",
                      "path": "src/button.tsx",
                      "range": {
                        "endLine": 3,
                        "startLine": 1,
                      },
                    },
                  ],
                },
                "entityChanges": [],
                "moves": [],
                "operations": [],
                "renames": [],
                "reviewRows": [],
              },
              "tool": "semadiff",
              "toolVersion": "0.1.0",
            },
            "performance": {
              "moveCount": 0,
              "operationCount": 0,
              "renameCount": 0,
              "runtimeMs": 0,
              "status": "scored",
            },
            "review": {
              "actualChangedLines": 0,
              "actualMoves": 0,
              "actualRenames": 0,
              "changedLinePrecision": 1,
              "changedLineRecall": 1,
              "expectedChangedLines": 0,
              "expectedMoves": 0,
              "expectedRenames": 0,
              "matchedChangedLines": 0,
              "matchedMoves": 0,
              "matchedRenames": 0,
              "moveRecall": null,
              "renameRecall": null,
              "status": "scored",
            },
          },
          {
            "caseId": "update-ts-001",
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
        ],
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
      }
    `);
	});
});
