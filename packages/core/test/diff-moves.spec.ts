import { describe, expect, test } from "vitest";
import type { UnitBlock } from "../src/diff-blocks";
import { detectMoves } from "../src/diff-moves";
import type { DiffToken } from "../src/diff-tokenize";

function token(
  text: string,
  compareText: string,
  startIndex: number,
  endIndex: number
): DiffToken {
  return {
    text,
    compareText,
    startIndex,
    endIndex,
    start: { line: 1, column: startIndex + 1 },
    end: { line: 1, column: endIndex + 1 },
  };
}

describe("move detection helpers", () => {
  test("detects move with nested update when content changes", () => {
    const oldText = "foo\nbar\n";
    const newText = "bar\nfoo+\n";
    const oldTokens = [
      token("foo\n", "foo", 0, 4),
      token("bar\n", "bar", 4, 8),
    ];
    const newTokens = [
      token("bar\n", "bar", 0, 4),
      token("foo+\n", "foo", 4, 9),
    ];
    const blocks: UnitBlock[] = [
      { type: "delete", start: 0, units: [oldTokens[0] as DiffToken] },
      { type: "insert", start: 1, units: [newTokens[1] as DiffToken] },
    ];

    const result = detectMoves(
      blocks,
      oldTokens,
      newTokens,
      oldText,
      newText,
      "rename-1",
      "ts"
    );

    expect(result.moves).toHaveLength(1);
    expect(result.moveOps).toHaveLength(1);
    expect(result.nestedOps).toHaveLength(1);
    expect(result.moveOps[0]?.meta?.renameGroupId).toBe("rename-1");
    expect(result.nestedOps[0]?.type).toBe("update");
  });

  test("detects move without nested update when content is unchanged", () => {
    const oldText = "foo\nbar\n";
    const newText = "bar\nfoo\n";
    const oldTokens = [
      token("foo\n", "foo", 0, 4),
      token("bar\n", "bar", 4, 8),
    ];
    const newTokens = [
      token("bar\n", "bar", 0, 4),
      token("foo\n", "foo", 4, 8),
    ];
    const blocks: UnitBlock[] = [
      { type: "delete", start: 0, units: [oldTokens[0] as DiffToken] },
      { type: "insert", start: 1, units: [newTokens[1] as DiffToken] },
    ];

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moves).toHaveLength(1);
    expect(result.moveOps).toHaveLength(1);
    expect(result.nestedOps).toHaveLength(0);
  });

  test("skips move detection when best score is below threshold", () => {
    const oldText = "foo\nbar\n";
    const newText = "bar\nzzz\n";
    const oldTokens = [
      token("foo\n", "foo", 0, 4),
      token("bar\n", "bar", 4, 8),
    ];
    const newTokens = [
      token("bar\n", "bar", 0, 4),
      token("zzz\n", "zzz", 4, 8),
    ];
    const blocks: UnitBlock[] = [
      { type: "delete", start: 0, units: [oldTokens[0] as DiffToken] },
      { type: "insert", start: 1, units: [newTokens[1] as DiffToken] },
    ];

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moves).toHaveLength(0);
    expect(result.moveOps).toHaveLength(0);
    expect(result.nestedOps).toHaveLength(0);
  });

  test("skips tiny single-token moves with insufficient content length", () => {
    const oldText = "x\n";
    const newText = "x\n";
    const oldTokens = [token("x\n", "x", 0, 2)];
    const newTokens = [token("x\n", "x", 0, 2)];
    const blocks: UnitBlock[] = [
      { type: "delete", start: 0, units: [oldTokens[0] as DiffToken] },
      { type: "insert", start: 0, units: [newTokens[0] as DiffToken] },
    ];

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moves).toHaveLength(0);
    expect(result.moveOps).toHaveLength(0);
  });
});
