import { describe, expect, test } from "vitest";
import { __testing } from "../src/index";

describe("chooseSemanticRowsWithFallback", () => {
  test("falls back to raw rows when semantic rows hide inflation behind replace grouping", () => {
    const semanticRows = [
      {
        type: "replace" as const,
        oldLine: 1,
        newLine: 1,
        oldText: "const a = 1;",
        newText: "const alpha = 1;",
      },
      {
        type: "replace" as const,
        oldLine: 2,
        newLine: 2,
        oldText: "const b = 2;",
        newText: "const beta = 2;",
      },
      {
        type: "replace" as const,
        oldLine: 3,
        newLine: 3,
        oldText: "const c = 3;",
        newText: "const gamma = 3;",
      },
      {
        type: "replace" as const,
        oldLine: 4,
        newLine: 4,
        oldText: "const d = 4;",
        newText: "const delta = 4;",
      },
      {
        type: "replace" as const,
        oldLine: 5,
        newLine: 5,
        oldText: "const e = 5;",
        newText: "const epsilon = 5;",
      },
    ];
    const rawRows = [
      {
        type: "delete" as const,
        oldLine: 2,
        newLine: null,
        text: "const b = 2;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 2,
        text: "const beta = 2;",
      },
      {
        type: "delete" as const,
        oldLine: 3,
        newLine: null,
        text: "const c = 3;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 3,
        text: "const gamma = 3;",
      },
      {
        type: "delete" as const,
        oldLine: 4,
        newLine: null,
        text: "const d = 4;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 4,
        text: "const delta = 4;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 5,
        text: "const epsilon = 5;",
      },
    ];

    const chosen = __testing.chooseSemanticRowsWithFallback(
      semanticRows,
      rawRows,
      (line) => line
    );

    expect(chosen).toBe(rawRows);
    expect(__testing.countChangedLineVolume(semanticRows)).toBe(10);
    expect(__testing.countChangedLineVolume(rawRows)).toBe(7);
  });

  test("keeps semantic rows when they materially reduce changed-line volume", () => {
    const semanticRows = [
      {
        type: "replace" as const,
        oldLine: 10,
        newLine: 10,
        oldText: "const mode = 'old';",
        newText: 'const mode = "new";',
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 20,
        text: "const inserted = true;",
      },
    ];
    const rawRows = [
      {
        type: "replace" as const,
        oldLine: 10,
        newLine: 10,
        oldText: "const mode = 'old';",
        newText: 'const mode = "new";',
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 16,
        text: "const keep2 = 2;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 17,
        text: "const keep3 = 3;",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 20,
        text: "const inserted = true;",
      },
    ];

    const chosen = __testing.chooseSemanticRowsWithFallback(
      semanticRows,
      rawRows,
      (line) => line
    );

    expect(chosen).toBe(semanticRows);
    expect(__testing.countChangedLineVolume(semanticRows)).toBe(3);
    expect(__testing.countChangedLineVolume(rawRows)).toBe(5);
  });
});

describe("buildOperationAnchoredRows", () => {
  const identity = (line: string) => line;
  const range = (startLine: number, endLine: number) => ({
    start: { line: startLine, column: 1 },
    end: { line: endLine, column: 1 },
  });

  test("preserves equal gaps before insert-only operations", () => {
    const oldText = [
      "const before = 0;",
      "const keep1 = 1;",
      "const mode = 'old';",
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const tail = 4;",
    ].join("\n");
    const newText = [
      "const before = 0;",
      "const keep1 = 1;",
      'const mode = "new";',
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const insertA = 5;",
      "const insertB = 6;",
      "const tail = 4;",
    ].join("\n");

    const rows = __testing.buildOperationAnchoredRows(
      oldText,
      newText,
      -1,
      "split",
      identity,
      [
        {
          id: "op-1",
          type: "update" as const,
          oldRange: range(3, 3),
          newRange: range(3, 3),
          oldText: "const mode = 'old';",
          newText: 'const mode = "new";',
        },
        {
          id: "op-2",
          type: "insert" as const,
          newRange: range(6, 7),
          newText: ["const insertA = 5;", "const insertB = 6;"].join("\n"),
        },
      ]
    );

    expect(rows).not.toBeNull();
    expect(
      rows?.some(
        (row) =>
          row.type === "equal" &&
          row.oldLine === 4 &&
          row.newLine === 4 &&
          row.text === "const keep2 = 2;"
      )
    ).toBe(true);
    expect(
      rows?.some(
        (row) =>
          row.type === "equal" &&
          row.oldLine === 5 &&
          row.newLine === 5 &&
          row.text === "const keep3 = 3;"
      )
    ).toBe(true);
    expect(
      rows?.some(
        (row) => row.type === "insert" && row.text === "const keep2 = 2;"
      )
    ).toBe(false);
    expect(
      rows?.some(
        (row) => row.type === "insert" && row.text === "const keep3 = 3;"
      )
    ).toBe(false);
  });

  test("bridges coarse update start gaps into equal and inserted prefix rows", () => {
    const oldText = [
      "const keep0 = 0;",
      "const keep1 = 1;",
      "const mode = 'old';",
      "const tail = 4;",
    ].join("\n");
    const newText = [
      "const keep0 = 0;",
      "const keep1 = 1;",
      "const insertedA = 5;",
      "const insertedB = 6;",
      'const mode = "new";',
      "const tail = 4;",
    ].join("\n");

    const rows = __testing.buildOperationAnchoredRows(
      oldText,
      newText,
      -1,
      "split",
      identity,
      [
        {
          id: "op-1",
          type: "update" as const,
          oldRange: range(3, 3),
          newRange: range(5, 5),
          oldText: "const mode = 'old';",
          newText: 'const mode = "new";',
        },
      ]
    );

    expect(rows).not.toBeNull();
    expect(
      rows?.some(
        (row) =>
          row.type === "equal" &&
          row.oldLine === 2 &&
          row.newLine === 2 &&
          row.text === "const keep1 = 1;"
      )
    ).toBe(true);
    expect(
      rows?.filter(
        (row) =>
          row.type === "insert" &&
          (row.text === "const insertedA = 5;" ||
            row.text === "const insertedB = 6;")
      )
    ).toHaveLength(2);
  });

  test("preserves equal gaps before delete-only operations", () => {
    const oldText = [
      "const before = 0;",
      "const keep1 = 1;",
      "const mode = 'old';",
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const dropA = 5;",
      "const dropB = 6;",
      "const tail = 4;",
    ].join("\n");
    const newText = [
      "const before = 0;",
      "const keep1 = 1;",
      'const mode = "new";',
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const tail = 4;",
    ].join("\n");

    const rows = __testing.buildOperationAnchoredRows(
      oldText,
      newText,
      -1,
      "split",
      identity,
      [
        {
          id: "op-1",
          type: "update" as const,
          oldRange: range(3, 3),
          newRange: range(3, 3),
          oldText: "const mode = 'old';",
          newText: 'const mode = "new";',
        },
        {
          id: "op-2",
          type: "delete" as const,
          oldRange: range(6, 7),
          oldText: ["const dropA = 5;", "const dropB = 6;"].join("\n"),
        },
      ]
    );

    expect(rows).not.toBeNull();
    expect(
      rows?.some(
        (row) =>
          row.type === "equal" &&
          row.oldLine === 4 &&
          row.newLine === 4 &&
          row.text === "const keep2 = 2;"
      )
    ).toBe(true);
    expect(
      rows?.some(
        (row) =>
          row.type === "equal" &&
          row.oldLine === 5 &&
          row.newLine === 5 &&
          row.text === "const keep3 = 3;"
      )
    ).toBe(true);
    expect(
      rows?.some(
        (row) => row.type === "delete" && row.text === "const keep2 = 2;"
      )
    ).toBe(false);
    expect(
      rows?.some(
        (row) => row.type === "delete" && row.text === "const keep3 = 3;"
      )
    ).toBe(false);
  });
});
