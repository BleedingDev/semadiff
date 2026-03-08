import { describe, expect, test } from "vitest";
import type { UnitBlock } from "../src/diff-blocks";
import { diffUnits } from "../src/diff-blocks";
import { detectMoves } from "../src/diff-moves";
import type { DiffToken } from "../src/diff-tokenize";
import { tokenize } from "../src/diff-tokenize";

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

  test("trims surrounding blank lines from move ranges", () => {
    const oldText = `${[
      "export function a() {",
      "  const value = 1;",
      "  return value;",
      "}",
      "",
      "export function b() {",
      "  return 2;",
      "}",
    ].join("\n")}\n`;
    const newText = `${[
      "export function b() {",
      "  return 2;",
      "}",
      "",
      "export function a() {",
      "  const value = 1;",
      "  return value + 0;",
      "}",
    ].join("\n")}\n`;
    const oldTokens = tokenize(oldText, undefined, undefined, "ts");
    const newTokens = tokenize(newText, undefined, undefined, "ts");
    const blocks = diffUnits(oldTokens, newTokens);

    const result = detectMoves(blocks, oldTokens, newTokens, oldText, newText);

    expect(result.moveOps).toHaveLength(1);
    expect(result.nestedOps).toHaveLength(1);
    expect(result.moveOps[0]?.oldRange).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 5, column: 1 },
    });
    expect(result.moveOps[0]?.newRange).toEqual({
      start: { line: 5, column: 1 },
      end: { line: 9, column: 1 },
    });
    expect(result.moveOps[0]?.oldText).toBe(
      `${[
        "export function a() {",
        "  const value = 1;",
        "  return value;",
        "}",
      ].join("\n")}\n`
    );
    expect(result.moveOps[0]?.newText).toBe(
      `${[
        "export function a() {",
        "  const value = 1;",
        "  return value + 0;",
        "}",
      ].join("\n")}\n`
    );
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
