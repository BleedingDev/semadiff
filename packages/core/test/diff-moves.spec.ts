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

  test("skips insert candidates that normalize to empty units", () => {
    const oldText = "foo\nbar\n";
    const newText = " \nbar\n";
    const oldTokens = [
      token("foo\n", "foo", 0, 4),
      token("bar\n", "bar", 4, 8),
    ];
    const newTokens = [token(" \n", " ", 0, 2), token("bar\n", "bar", 2, 6)];
    const blocks: UnitBlock[] = [
      { type: "delete", start: 0, units: [oldTokens[0] as DiffToken] },
      { type: "insert", start: 0, units: [newTokens[0] as DiffToken] },
    ];

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moves).toHaveLength(0);
    expect(result.usedInserts.size).toBe(0);
  });

  test("skips low-similarity candidates after content-length threshold", () => {
    const oldText = "alpha\nbeta\n";
    const newText = "alpha\ngamma\n";
    const oldTokens = [
      token("alpha\n", "alpha", 0, 6),
      token("beta\n", "beta", 6, 11),
    ];
    const newTokens = [
      token("alpha\n", "alpha", 0, 6),
      token("gamma\n", "gamma", 6, 12),
    ];
    const blocks: UnitBlock[] = [
      {
        type: "delete",
        start: 0,
        units: [oldTokens[0] as DiffToken, oldTokens[1] as DiffToken],
      },
      {
        type: "insert",
        start: 0,
        units: [newTokens[0] as DiffToken, newTokens[1] as DiffToken],
      },
    ];

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moves).toHaveLength(0);
    expect(result.moveOps).toHaveLength(0);
  });
});
