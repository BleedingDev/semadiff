import { structuralDiff } from "@semadiff/core";
import { swcParser } from "@semadiff/parser-swc";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import {
  buildEntityDocument,
  buildEntityDocumentFromSources,
  buildHybridDiffDocument,
  extractEntitiesFromRoot,
} from "../src/index.js";

async function parseRoot(text: string, language: "ts" | "tsx" | "js" | "jsx") {
  const result = await Effect.runPromise(
    swcParser.parse({ content: text, language })
  );
  return result.root;
}

describe("entity sidecar", () => {
  test("extracts top-level TS entities and class methods", async () => {
    const text = [
      "export class Greeter {",
      "  greet(name: string) {",
      "    return name;",
      "  }",
      "}",
      "",
      "export interface User {",
      "  id: string;",
      "}",
      "",
      "export type UserId = string;",
      "export const answer = 1;",
    ].join("\n");
    const root = await parseRoot(text, "ts");
    expect(
      extractEntitiesFromRoot({
        root,
        text,
        language: "ts",
        path: "src/demo.ts",
      })
    ).toMatchInlineSnapshot(`
      [
        {
          "exported": true,
          "id": "src/demo.ts::class::Greeter::1:8",
          "kind": "class",
          "name": "Greeter",
          "path": "src/demo.ts",
          "range": {
            "end": {
              "column": 1,
              "line": 5,
            },
            "start": {
              "column": 8,
              "line": 1,
            },
          },
        },
        {
          "exported": true,
          "id": "src/demo.ts::method::Greeter.greet::2:3",
          "kind": "method",
          "name": "greet",
          "parentName": "Greeter",
          "path": "src/demo.ts",
          "range": {
            "end": {
              "column": 3,
              "line": 4,
            },
            "start": {
              "column": 3,
              "line": 2,
            },
          },
        },
        {
          "exported": true,
          "id": "src/demo.ts::interface::User::7:8",
          "kind": "interface",
          "name": "User",
          "path": "src/demo.ts",
          "range": {
            "end": {
              "column": 1,
              "line": 9,
            },
            "start": {
              "column": 8,
              "line": 7,
            },
          },
        },
        {
          "exported": true,
          "id": "src/demo.ts::typeAlias::UserId::11:8",
          "kind": "typeAlias",
          "name": "UserId",
          "path": "src/demo.ts",
          "range": {
            "end": {
              "column": 28,
              "line": 11,
            },
            "start": {
              "column": 8,
              "line": 11,
            },
          },
        },
        {
          "exported": true,
          "id": "src/demo.ts::variable::answer::12:14",
          "kind": "variable",
          "name": "answer",
          "path": "src/demo.ts",
          "range": {
            "end": {
              "column": 23,
              "line": 12,
            },
            "start": {
              "column": 14,
              "line": 12,
            },
          },
        },
      ]
    `);
  });

  test("classifies rename-only, move-plus-edit, and cross-file moves", async () => {
    const renameOld = "export function foo() {\n  return 1;\n}\n";
    const renameNew = "export function bar() {\n  return 1;\n}\n";
    const renameDiff = structuralDiff(renameOld, renameNew, { language: "ts" });

    const moveOld = [
      "export function a() {",
      "  const value = 1;",
      "  return value;",
      "}",
      "",
      "export function b() {",
      "  return 2;",
      "}",
    ].join("\n");
    const moveNew = [
      "export function b() {",
      "  return 2;",
      "}",
      "",
      "export function a() {",
      "  const value = 1;",
      "  return value + 0;",
      "}",
    ].join("\n");
    const moveDiff = structuralDiff(moveOld, moveNew, { language: "ts" });

    const crossFileOld = "export function helper() {\n  return 1;\n}\n";
    const crossFileNew = "export function helper() {\n  return 1;\n}\n";

    const renameDocument = buildEntityDocument({
      diff: renameDiff,
      oldText: renameOld,
      newText: renameNew,
      language: "ts",
      oldRoot: await parseRoot(renameOld, "ts"),
      newRoot: await parseRoot(renameNew, "ts"),
      oldPath: "src/a.ts",
      newPath: "src/a.ts",
    });
    const moveDocument = buildEntityDocument({
      diff: moveDiff,
      oldText: moveOld,
      newText: moveNew,
      language: "ts",
      oldRoot: await parseRoot(moveOld, "ts"),
      newRoot: await parseRoot(moveNew, "ts"),
      oldPath: "src/move.ts",
      newPath: "src/move.ts",
    });
    const crossFileDocument = buildEntityDocumentFromSources({
      sources: [
        {
          oldText: crossFileOld,
          newText: "",
          language: "ts",
          oldRoot: await parseRoot(crossFileOld, "ts"),
          newRoot: await parseRoot("", "ts"),
          oldPath: "src/a.ts",
          diff: structuralDiff(crossFileOld, "", { language: "ts" }),
        },
        {
          oldText: "",
          newText: crossFileNew,
          language: "ts",
          oldRoot: await parseRoot("", "ts"),
          newRoot: await parseRoot(crossFileNew, "ts"),
          newPath: "src/b.ts",
          diff: structuralDiff("", crossFileNew, { language: "ts" }),
        },
      ],
    });

    expect({
      crossFileDocument,
      renameDocument,
      moveDocument,
    }).toMatchInlineSnapshot(`
      {
        "crossFileDocument": {
          "changes": [
            {
              "after": {
                "exported": true,
                "id": "src/b.ts::function::helper::1:8",
                "kind": "function",
                "name": "helper",
                "path": "src/b.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 8,
                    "line": 1,
                  },
                },
              },
              "before": {
                "exported": true,
                "id": "src/a.ts::function::helper::1:8",
                "kind": "function",
                "name": "helper",
                "path": "src/a.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 8,
                    "line": 1,
                  },
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
          "new": [
            {
              "exported": true,
              "id": "src/b.ts::function::helper::1:8",
              "kind": "function",
              "name": "helper",
              "path": "src/b.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 3,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
          ],
          "old": [
            {
              "exported": true,
              "id": "src/a.ts::function::helper::1:8",
              "kind": "function",
              "name": "helper",
              "path": "src/a.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 3,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
          ],
        },
        "moveDocument": {
          "changes": [
            {
              "after": {
                "exported": true,
                "id": "src/move.ts::function::a::5:8",
                "kind": "function",
                "name": "a",
                "path": "src/move.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 8,
                  },
                  "start": {
                    "column": 8,
                    "line": 5,
                  },
                },
              },
              "before": {
                "exported": true,
                "id": "src/move.ts::function::a::1:8",
                "kind": "function",
                "name": "a",
                "path": "src/move.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 4,
                  },
                  "start": {
                    "column": 8,
                    "line": 1,
                  },
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
          "new": [
            {
              "exported": true,
              "id": "src/move.ts::function::b::1:8",
              "kind": "function",
              "name": "b",
              "path": "src/move.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 3,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
            {
              "exported": true,
              "id": "src/move.ts::function::a::5:8",
              "kind": "function",
              "name": "a",
              "path": "src/move.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 8,
                },
                "start": {
                  "column": 8,
                  "line": 5,
                },
              },
            },
          ],
          "old": [
            {
              "exported": true,
              "id": "src/move.ts::function::a::1:8",
              "kind": "function",
              "name": "a",
              "path": "src/move.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 4,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
            {
              "exported": true,
              "id": "src/move.ts::function::b::6:8",
              "kind": "function",
              "name": "b",
              "path": "src/move.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 8,
                },
                "start": {
                  "column": 8,
                  "line": 6,
                },
              },
            },
          ],
        },
        "renameDocument": {
          "changes": [
            {
              "after": {
                "exported": true,
                "id": "src/a.ts::function::bar::1:8",
                "kind": "function",
                "name": "bar",
                "path": "src/a.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 8,
                    "line": 1,
                  },
                },
              },
              "before": {
                "exported": true,
                "id": "src/a.ts::function::foo::1:8",
                "kind": "function",
                "name": "foo",
                "path": "src/a.ts",
                "range": {
                  "end": {
                    "column": 1,
                    "line": 3,
                  },
                  "start": {
                    "column": 8,
                    "line": 1,
                  },
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
          "new": [
            {
              "exported": true,
              "id": "src/a.ts::function::bar::1:8",
              "kind": "function",
              "name": "bar",
              "path": "src/a.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 3,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
          ],
          "old": [
            {
              "exported": true,
              "id": "src/a.ts::function::foo::1:8",
              "kind": "function",
              "name": "foo",
              "path": "src/a.ts",
              "range": {
                "end": {
                  "column": 1,
                  "line": 3,
                },
                "start": {
                  "column": 8,
                  "line": 1,
                },
              },
            },
          ],
        },
      }
    `);
  });

  test("classifies variable initializer updates as modified entity changes", async () => {
    const oldText = "export const value = 1;\n";
    const newText = "export const value = 2;\n";
    const diff = structuralDiff(oldText, newText, { language: "ts" });
    const entityDocument = buildEntityDocument({
      diff,
      oldText,
      newText,
      language: "ts",
      oldRoot: await parseRoot(oldText, "ts"),
      newRoot: await parseRoot(newText, "ts"),
      oldPath: "src/value.ts",
      newPath: "src/value.ts",
    });

    expect(entityDocument?.changes).toMatchInlineSnapshot(`
      [
        {
          "after": {
            "exported": true,
            "id": "src/value.ts::variable::value::1:14",
            "kind": "variable",
            "name": "value",
            "path": "src/value.ts",
            "range": {
              "end": {
                "column": 22,
                "line": 1,
              },
              "start": {
                "column": 14,
                "line": 1,
              },
            },
          },
          "before": {
            "exported": true,
            "id": "src/value.ts::variable::value::1:14",
            "kind": "variable",
            "name": "value",
            "path": "src/value.ts",
            "range": {
              "end": {
                "column": 22,
                "line": 1,
              },
              "start": {
                "column": 14,
                "line": 1,
              },
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
      ]
    `);
  });

  test("builds a hybrid diff document without changing the diff payload", async () => {
    const oldText = "export const value = 1;\n";
    const newText = "export const value = 2;\n";
    const diff = structuralDiff(oldText, newText, { language: "ts" });
    const hybrid = buildHybridDiffDocument({
      diff,
      oldText,
      newText,
      language: "ts",
      oldRoot: await parseRoot(oldText, "ts"),
      newRoot: await parseRoot(newText, "ts"),
      oldPath: "src/value.ts",
      newPath: "src/value.ts",
    });
    expect(hybrid).toMatchInlineSnapshot(`
      {
        "diff": {
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
        "entities": {
          "changes": [
            {
              "after": {
                "exported": true,
                "id": "src/value.ts::variable::value::1:14",
                "kind": "variable",
                "name": "value",
                "path": "src/value.ts",
                "range": {
                  "end": {
                    "column": 22,
                    "line": 1,
                  },
                  "start": {
                    "column": 14,
                    "line": 1,
                  },
                },
              },
              "before": {
                "exported": true,
                "id": "src/value.ts::variable::value::1:14",
                "kind": "variable",
                "name": "value",
                "path": "src/value.ts",
                "range": {
                  "end": {
                    "column": 22,
                    "line": 1,
                  },
                  "start": {
                    "column": 14,
                    "line": 1,
                  },
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
          "new": [
            {
              "exported": true,
              "id": "src/value.ts::variable::value::1:14",
              "kind": "variable",
              "name": "value",
              "path": "src/value.ts",
              "range": {
                "end": {
                  "column": 22,
                  "line": 1,
                },
                "start": {
                  "column": 14,
                  "line": 1,
                },
              },
            },
          ],
          "old": [
            {
              "exported": true,
              "id": "src/value.ts::variable::value::1:14",
              "kind": "variable",
              "name": "value",
              "path": "src/value.ts",
              "range": {
                "end": {
                  "column": 22,
                  "line": 1,
                },
                "start": {
                  "column": 14,
                  "line": 1,
                },
              },
            },
          ],
        },
      }
    `);
  });
});
