import { describe, expect, test } from "vitest";
import {
  isCosmeticMove,
  suppressCosmeticMoves,
} from "../src/diff-cosmetic-moves";

describe("diff cosmetic move helpers", () => {
  test("treats empty normalized blocks as cosmetic moves", () => {
    expect(isCosmeticMove(" \n\t", "\n")).toBe(true);
  });

  test("treats use-client and import-only block reorder as cosmetic", () => {
    const oldText = [
      '"use client"',
      'import { B } from "b";',
      'import { A } from "a";',
    ].join("\n");
    const newText = [
      '"use client"',
      'import { A } from "a";',
      'import { B } from "b";',
    ].join("\n");
    expect(isCosmeticMove(oldText, newText)).toBe(true);
  });

  test("does not suppress large equal blocks", () => {
    const line = `import { A } from "${"x".repeat(170)}";`;
    expect(isCosmeticMove(line, line)).toBe(false);
  });

  test("does not suppress equal non-import statements", () => {
    expect(isCosmeticMove("const total = 1 + 2;", "const total = 1 + 2;")).toBe(
      false
    );
  });

  test("requires matching non-empty signatures", () => {
    expect(isCosmeticMove("alpha()", "beta()")).toBe(false);
    expect(isCosmeticMove("!!!", "???")).toBe(false);
  });

  test("suppresses import moves with matching signatures under max length", () => {
    const oldText = 'import { alpha } from "@scope/pkg/path";';
    const newText = 'import alpha from "@scope/pkg/path";';
    expect(isCosmeticMove(oldText, newText)).toBe(true);
  });

  test("does not suppress import moves when signature exceeds limit", () => {
    const path = `@scope/${"pkg-".repeat(40)}tail`;
    const oldText = `import { alpha } from "${path}";`;
    const newText = `import alpha from "${path}";`;
    expect(isCosmeticMove(oldText, newText)).toBe(false);
  });

  test("suppresses short matching prop-assignment signatures", () => {
    expect(isCosmeticMove("value = call(alpha)", "value = call[alpha]")).toBe(
      true
    );
  });

  test("does not suppress long non-import signatures", () => {
    const token = "x".repeat(90);
    expect(isCosmeticMove(`assign(${token})`, `assign[${token}]`)).toBe(false);
  });

  test("does not suppress short non-import signatures without assignments", () => {
    expect(isCosmeticMove("call(alpha)", "call[alpha]")).toBe(false);
  });
});

describe("suppressCosmeticMoves", () => {
  test("drops only move operations identified as cosmetic", () => {
    const operations = [
      { type: "insert", id: "insert-1", newText: "const x = 1;" },
      {
        type: "move",
        id: "move-1",
        oldText: "value = call(alpha)",
        newText: "value = call[alpha]",
      },
      {
        type: "move",
        id: "move-2",
        oldText: "call(alpha)",
        newText: "call[alpha]",
      },
      { type: "move", id: "move-3", oldText: "call(alpha)" },
    ];

    expect(suppressCosmeticMoves(operations)).toEqual([
      operations[0],
      operations[2],
      operations[3],
    ]);
  });
});
