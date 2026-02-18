import { describe, expect, test } from "vitest";
import {
  getComparableText,
  moveUnitTextLength,
  normalizeMoveUnits,
  similarityRatio,
} from "../src/diff-move-math";
import type { DiffToken } from "../src/diff-tokenize";

function token(text: string, compareText: string): DiffToken {
  return {
    text,
    compareText,
    startIndex: 0,
    endIndex: text.length,
    start: { line: 1, column: 1 },
    end: { line: 1, column: text.length + 1 },
  };
}

describe("move math helpers", () => {
  test("uses compareText when present", () => {
    expect(getComparableText(token("Foo", "foo"))).toBe("foo");
  });

  test("similarity ratio handles empty and partial matches", () => {
    expect(similarityRatio([], [])).toBe(1);
    expect(similarityRatio(["a", "b", "c"], ["a", "x", "c"])).toBeCloseTo(
      2 / 3
    );
    expect(similarityRatio(["a"], ["b"])).toBe(0);
  });

  test("normalizes units by removing whitespace-only entries", () => {
    const units = [
      token("  ", " "),
      token("foo", "foo"),
      token("\n\t", " "),
      token("bar", "bar"),
    ];
    expect(normalizeMoveUnits(units).map((unit) => unit.compareText)).toEqual([
      "foo",
      "bar",
    ]);
  });

  test("sums trimmed comparable text length", () => {
    const units = [
      token(" foo ", " foo "),
      token("bar", "bar"),
      token(" ", " "),
    ];
    expect(moveUnitTextLength(units)).toBe(6);
  });
});
