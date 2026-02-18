import { describe, expect, test } from "vitest";
import { diffUnits } from "../src/diff-blocks";
import type { DiffToken } from "../src/diff-tokenize";

function makeToken(
  text: string,
  compareText: string,
  startIndex: number
): DiffToken {
  return {
    text,
    compareText,
    startIndex,
    endIndex: startIndex + text.length,
    start: { line: 1, column: startIndex + 1 },
    end: { line: 1, column: startIndex + text.length + 1 },
  };
}

describe("diff block generation", () => {
  test("emits delete and insert blocks for replaced token", () => {
    const oldUnits = [makeToken("a", "a", 0)];
    const newUnits = [makeToken("b", "b", 0)];
    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks.map((block) => block.type)).toEqual(["delete", "insert"]);
  });

  test("coalesces adjacent insert operations", () => {
    const oldUnits: DiffToken[] = [];
    const newUnits = [
      makeToken("a", "a", 0),
      makeToken("+", "+", 1),
      makeToken("b", "b", 2),
    ];
    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("insert");
    expect(blocks[0]?.units).toHaveLength(3);
  });

  test("coalesces adjacent delete operations", () => {
    const oldUnits = [
      makeToken("a", "a", 0),
      makeToken("+", "+", 1),
      makeToken("b", "b", 2),
    ];
    const newUnits: DiffToken[] = [];
    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("delete");
    expect(blocks[0]?.units).toHaveLength(3);
  });

  test("uses compareText for semantic equality checks", () => {
    const oldUnits = [makeToken("FOO", "id", 0)];
    const newUnits = [makeToken("BAR", "id", 0)];
    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks).toHaveLength(0);
  });

  test("falls back to myers algorithm for very large inputs", () => {
    const size = 1500;
    const oldUnits = Array.from({ length: size }, (_, index) =>
      makeToken("x", "x", index)
    );
    const newUnits = Array.from({ length: size }, (_, index) =>
      makeToken("x", "x", index)
    );
    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks).toHaveLength(0);
  });
});
