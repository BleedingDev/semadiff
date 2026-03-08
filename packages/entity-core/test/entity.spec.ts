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

  test("extracts default-exported classes and functions plus function-valued variables", async () => {
    const functionText = [
      "export default function DefaultWidget() {",
      "  return 1;",
      "}",
      "",
      "export const buildValue = () => 2;",
      "export const buildOther = function namedFactory() {",
      "  return 3;",
      "};",
      "const count = 4;",
    ].join("\n");
    const classText = [
      "export default class DefaultView {",
      '  "save"() {',
      "    return true;",
      "  }",
      "  0() {",
      "    return false;",
      "  }",
      "}",
    ].join("\n");

    const functionEntities = extractEntitiesFromRoot({
      root: await parseRoot(functionText, "js"),
      text: functionText,
      language: "js",
      path: "src/defaults.js",
    });
    const classEntities = extractEntitiesFromRoot({
      root: await parseRoot(classText, "js"),
      text: classText,
      language: "js",
      path: "src/default-class.js",
    });

    expect(
      functionEntities.map((entity) => ({
        kind: entity.kind,
        name: entity.name,
        exported: entity.exported,
      }))
    ).toEqual([
      { kind: "function", name: "DefaultWidget", exported: true },
      { kind: "function", name: "buildValue", exported: true },
      { kind: "function", name: "buildOther", exported: true },
      { kind: "variable", name: "count", exported: false },
    ]);
    expect(
      classEntities.map((entity) => ({
        kind: entity.kind,
        name: entity.name,
        parentName: entity.parentName ?? null,
        exported: entity.exported,
      }))
    ).toEqual([
      {
        kind: "class",
        name: "DefaultView",
        parentName: null,
        exported: true,
      },
      {
        kind: "method",
        name: "save",
        parentName: "DefaultView",
        exported: true,
      },
      {
        kind: "method",
        name: "0",
        parentName: "DefaultView",
        exported: true,
      },
    ]);
  });

  test("names anonymous default exports and skips unsupported declarations", async () => {
    const functionText = [
      "export default function () {",
      "  return 1;",
      "}",
    ].join("\n");
    const classText = [
      "export default class {",
      "  value = 1;",
      "}",
      "",
      "class Empty {}",
      "const [item] = [1];",
    ].join("\n");
    const expressionText = "export default 1;";

    const functionEntities = extractEntitiesFromRoot({
      root: await parseRoot(functionText, "js"),
      text: functionText,
      language: "js",
    });
    const classEntities = extractEntitiesFromRoot({
      root: await parseRoot(classText, "js"),
      text: classText,
      language: "js",
      path: "src/anonymous.js",
    });
    const expressionEntities = extractEntitiesFromRoot({
      root: await parseRoot(expressionText, "js"),
      text: expressionText,
      language: "js",
      path: "src/expression.js",
    });

    expect(functionEntities).toEqual([
      {
        id: "<memory>::function::default::1:16",
        kind: "function",
        name: "default",
        range: {
          start: { line: 1, column: 16 },
          end: { line: 3, column: 1 },
        },
        exported: true,
      },
    ]);
    expect(
      classEntities.map((entity) => ({
        kind: entity.kind,
        name: entity.name,
        parentName: entity.parentName ?? null,
        exported: entity.exported,
      }))
    ).toEqual([
      {
        kind: "class",
        name: "default",
        parentName: null,
        exported: true,
      },
      {
        kind: "class",
        name: "Empty",
        parentName: null,
        exported: false,
      },
    ]);
    expect(expressionEntities).toEqual([]);
  });

  test("returns no entities for unsupported languages or malformed roots", () => {
    expect(
      extractEntitiesFromRoot({
        root: { body: [] },
        text: "",
        language: "json",
        path: "fixtures/data.json",
      })
    ).toEqual([]);
    expect(
      extractEntitiesFromRoot({
        root: null,
        text: "export const value = 1;",
        language: "ts",
        path: "src/value.ts",
      })
    ).toEqual([]);
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

  test("emits added and deleted entity changes for unmatched sources", async () => {
    const deletedText = "export function removedThing() {\n  return 1;\n}\n";
    const addedText = "export function addedThing() {\n  return 2;\n}\n";

    const deletedDocument = buildEntityDocument({
      diff: structuralDiff(deletedText, "", { language: "ts" }),
      oldText: deletedText,
      newText: "",
      language: "ts",
      oldRoot: await parseRoot(deletedText, "ts"),
      newRoot: await parseRoot("", "ts"),
      oldPath: "src/deleted.ts",
      newPath: "src/deleted.ts",
    });
    const addedDocument = buildEntityDocument({
      diff: structuralDiff("", addedText, { language: "ts" }),
      oldText: "",
      newText: addedText,
      language: "ts",
      oldRoot: await parseRoot("", "ts"),
      newRoot: await parseRoot(addedText, "ts"),
      oldPath: "src/added.ts",
      newPath: "src/added.ts",
    });

    expect(deletedDocument?.changes).toEqual([
      expect.objectContaining({
        kind: "function",
        changeKinds: ["deleted"],
        before: expect.objectContaining({ name: "removedThing" }),
      }),
    ]);
    expect(addedDocument?.changes).toEqual([
      expect.objectContaining({
        kind: "function",
        changeKinds: ["added"],
        after: expect.objectContaining({ name: "addedThing" }),
      }),
    ]);
  });

  test("classifies rename and move pairs without requiring a diff payload", async () => {
    const oldText = "export function beforeName() {\n  return 1;\n}\n";
    const newText = "export function afterName() {\n  return 1;\n}\n";

    const entityDocument = buildEntityDocumentFromSources({
      sources: [
        {
          oldText,
          newText,
          language: "ts",
          oldRoot: await parseRoot(oldText, "ts"),
          newRoot: await parseRoot(newText, "ts"),
          oldPath: "src/old-name.ts",
          newPath: "src/new-name.ts",
        },
      ],
    });

    expect(entityDocument?.changes).toEqual([
      expect.objectContaining({
        kind: "function",
        changeKinds: ["renamed", "moved"],
        before: expect.objectContaining({
          name: "beforeName",
          path: "src/old-name.ts",
        }),
        after: expect.objectContaining({
          name: "afterName",
          path: "src/new-name.ts",
        }),
      }),
    ]);
  });
});
