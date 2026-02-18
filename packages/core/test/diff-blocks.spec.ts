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

function buildSequence(size: number, prefix = "t") {
  return Array.from({ length: size }, (_, index) =>
    makeToken(`${prefix}${index}`, `${prefix}${index}`, index)
  );
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

  test("myers path emits delete+insert for a large replacement", () => {
    const oldUnits = buildSequence(1500);
    const newUnits = buildSequence(1500);
    oldUnits[750] = makeToken("old-value", "old-value", 750);
    newUnits[750] = makeToken("new-value", "new-value", 750);

    const blocks = diffUnits(oldUnits, newUnits);
    expect(blocks.map((block) => block.type)).toEqual(["delete", "insert"]);
    expect(blocks[0]?.start).toBe(750);
    expect(blocks[1]?.start).toBe(750);
  });

  test("myers path emits an insert block for large tail append", () => {
    const oldUnits = buildSequence(1300);
    const newUnits = buildSequence(1600);
    const blocks = diffUnits(oldUnits, newUnits);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("insert");
    expect(blocks[0]?.start).toBe(1300);
    expect(blocks[0]?.units).toHaveLength(300);
  });
});
