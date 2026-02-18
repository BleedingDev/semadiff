import { describe, expect, test } from "vitest";
import type { DiffOperation, Range } from "../src/diff";
import {
  coalesceOperations,
  suppressCosmeticLineMoves,
  suppressCosmeticUpdates,
  suppressMovedLineOps,
} from "../src/diff-operations";

function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): Range {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

describe("coalesceOperations", () => {
  test("returns empty array unchanged", () => {
    const operations: DiffOperation[] = [];
    expect(coalesceOperations(operations, "", "")).toBe(operations);
  });

  test("merges adjacent insert operations", () => {
    const operations: DiffOperation[] = [
      {
        id: "op-1",
        type: "insert",
        newRange: range(1, 1, 2, 1),
        newText: "a\n",
      },
      {
        id: "op-2",
        type: "insert",
        newRange: range(2, 1, 3, 1),
        newText: "b\n",
      },
    ];

    expect(coalesceOperations(operations, "", "a\nb\n")).toEqual([
      {
        id: "op-1",
        type: "insert",
        newRange: range(1, 1, 3, 1),
        newText: "a\nb\n",
      },
    ]);
  });

  test("merges adjacent update operations and recomputes texts from ranges", () => {
    const operations: DiffOperation[] = [
      {
        id: "op-1",
        type: "update",
        oldRange: range(1, 1, 1, 2),
        newRange: range(1, 1, 1, 2),
        oldText: "a",
        newText: "x",
      },
      {
        id: "op-2",
        type: "update",
        oldRange: range(1, 2, 1, 3),
        newRange: range(1, 2, 1, 3),
        oldText: "b",
        newText: "y",
      },
    ];

    expect(coalesceOperations(operations, "ab", "xy")).toEqual([
      {
        id: "op-1",
        type: "update",
        oldRange: range(1, 1, 1, 3),
        newRange: range(1, 1, 1, 3),
        oldText: "ab",
        newText: "xy",
      },
    ]);
  });

  test("does not merge operations crossing move boundaries or mismatched meta", () => {
    const operations: DiffOperation[] = [
      {
        id: "op-1",
        type: "insert",
        newRange: range(1, 1, 2, 1),
        newText: "a\n",
      },
      {
        id: "op-2",
        type: "insert",
        newRange: range(2, 1, 3, 1),
        newText: "b\n",
        meta: { renameGroupId: "rename-1" },
      },
      {
        id: "op-3",
        type: "move",
        oldRange: range(3, 1, 4, 1),
        newRange: range(4, 1, 5, 1),
      },
      {
        id: "op-4",
        type: "insert",
        newRange: range(5, 1, 6, 1),
        newText: "c\n",
        meta: { moveId: "move-1" },
      },
    ];

    expect(coalesceOperations(operations, "", "a\nb\nc\n")).toEqual(operations);
  });
});

describe("suppressMovedLineOps", () => {
  test("rewrites matching single-line update into insert when old line already inserted", () => {
    const operations: DiffOperation[] = [
      { id: "op-1", type: "insert", newText: "a\n" },
      { id: "op-2", type: "update", oldText: "a\n", newText: "b\n" },
    ];

    expect(suppressMovedLineOps(operations, "a\n", "a\nb\n")).toEqual([
      { id: "op-2", type: "insert", newText: "b\n" },
    ]);
  });

  test("drops balanced single-line delete/insert pairs", () => {
    const line = "const value = 1;\n";
    const operations: DiffOperation[] = [
      { id: "op-1", type: "insert", newText: line },
      { id: "op-2", type: "delete", oldText: line },
    ];

    expect(suppressMovedLineOps(operations, line, line)).toEqual([]);
  });

  test("keeps line pairs when source and target counts differ", () => {
    const line = "const value = 1;\n";
    const operations: DiffOperation[] = [
      { id: "op-1", type: "insert", newText: line },
      { id: "op-2", type: "delete", oldText: line },
    ];

    expect(suppressMovedLineOps(operations, line, `${line}${line}`)).toEqual(
      operations
    );
  });

  test("keeps non-single-line operations untouched", () => {
    const operations: DiffOperation[] = [
      {
        id: "op-1",
        type: "insert",
        newText: "const a = 1;\nconst b = 2;\n",
      },
      {
        id: "op-2",
        type: "delete",
        oldText: "const a = 1;\nconst b = 2;\n",
      },
    ];

    expect(
      suppressMovedLineOps(
        operations,
        "const a = 1;\nconst b = 2;\n",
        "const a = 1;\nconst b = 2;\n"
      )
    ).toEqual(operations);
  });
});

describe("suppressCosmeticLineMoves", () => {
  test("drops cosmetic use-client single-line moves", () => {
    const line = '"use client"\n';
    const operations: DiffOperation[] = [
      { id: "op-1", type: "insert", newText: line },
      { id: "op-2", type: "delete", oldText: line },
    ];

    expect(suppressCosmeticLineMoves(operations, line, line)).toEqual([]);
  });

  test("keeps side-effect import single-line moves", () => {
    const line = 'import "./setup";\n';
    const operations: DiffOperation[] = [
      { id: "op-1", type: "insert", newText: line },
      { id: "op-2", type: "delete", oldText: line },
    ];

    expect(suppressCosmeticLineMoves(operations, line, line)).toEqual(
      operations
    );
  });
});

describe("suppressCosmeticUpdates", () => {
  test("drops updates that only change cosmetic block ordering", () => {
    const operations: DiffOperation[] = [
      {
        id: "op-1",
        type: "update",
        oldText: '"use client"\nimport { B } from "b";\nimport { A } from "a";',
        newText: '"use client"\nimport { A } from "a";\nimport { B } from "b";',
      },
      { id: "op-2", type: "insert", newText: "const x = 1;\n" },
    ];

    expect(suppressCosmeticUpdates(operations)).toEqual([operations[1]]);
  });

  test("keeps non-cosmetic updates and updates missing text", () => {
    const operations: DiffOperation[] = [
      { id: "op-1", type: "update", oldText: undefined, newText: "next" },
      {
        id: "op-2",
        type: "update",
        oldText: "const x = 1;",
        newText: "const x = 2;",
      },
    ];

    expect(suppressCosmeticUpdates(operations)).toEqual(operations);
  });
});
