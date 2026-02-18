import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { structuralDiff } from "../src/diff";

const fixturesDir = join(import.meta.dirname, "fixtures");

function readFixturePair(name: string) {
  return {
    oldText: readFileSync(join(fixturesDir, name, "old.ts"), "utf8"),
    newText: readFileSync(join(fixturesDir, name, "new.ts"), "utf8"),
  };
}

function projectDiff(oldText: string, newText: string) {
  const diff = structuralDiff(oldText, newText, { language: "ts" });
  return {
    operations: diff.operations.map((operation) => ({
      type: operation.type,
      oldStartLine: operation.oldRange?.start.line ?? null,
      newStartLine: operation.newRange?.start.line ?? null,
      oldText: operation.oldText ?? null,
      newText: operation.newText ?? null,
      moveId: operation.meta?.moveId ?? null,
    })),
    moves: diff.moves.map((move) => ({
      confidence: Number(move.confidence.toFixed(2)),
      sourceStartLine: move.sourceRange?.start.line ?? null,
      targetStartLine: move.targetRange?.start.line ?? null,
    })),
    renames: diff.renames.map((rename) => ({
      from: rename.from,
      to: rename.to,
      occurrences: rename.occurrences,
      confidence: Number(rename.confidence.toFixed(2)),
    })),
  };
}

describe("diff characterization", () => {
  test("update fixture stays a single update operation", () => {
    const fixture = readFixturePair("update");
    expect(
      projectDiff(fixture.oldText, fixture.newText)
    ).toMatchInlineSnapshot(`
      {
        "moves": [],
        "operations": [
          {
            "moveId": null,
            "newStartLine": 1,
            "newText": "export const value = 2;\n",
            "oldStartLine": 1,
            "oldText": "export const value = 1;\n",
            "type": "update",
          },
        ],
        "renames": [],
      }
    `);
  });

  test("rename fixture stays grouped as one rename", () => {
    const fixture = readFixturePair("rename");
    expect(
      projectDiff(fixture.oldText, fixture.newText)
    ).toMatchInlineSnapshot(`
      {
        "moves": [],
        "operations": [
          {
            "moveId": null,
            "newStartLine": 1,
            "newText": "export function compute(bar: number) {\n  return bar + bar;\n",
            "oldStartLine": 1,
            "oldText": "export function compute(foo: number) {\n  return foo + foo;\n",
            "type": "update",
          },
        ],
        "renames": [
          {
            "confidence": 0.38,
            "from": "foo",
            "occurrences": 3,
            "to": "bar",
          },
        ],
      }
    `);
  });

  test("move fixture keeps move + nested update linkage", () => {
    const fixture = readFixturePair("move");
    expect(
      projectDiff(fixture.oldText, fixture.newText)
    ).toMatchInlineSnapshot(`
      {
        "moves": [
          {
            "confidence": 0.75,
            "sourceStartLine": null,
            "targetStartLine": null,
          },
        ],
        "operations": [
          {
            "moveId": "move-1",
            "newStartLine": 4,
            "newText": "\nexport function a() {\n  const value = 1;\n  return value + 0;\n}\n",
            "oldStartLine": 1,
            "oldText": "export function a() {\n  const value = 1;\n  return value;\n}\n\n",
            "type": "move",
          },
          {
            "moveId": "move-1",
            "newStartLine": 4,
            "newText": "\nexport function a() {\n  const value = 1;\n  return value + 0;\n}\n",
            "oldStartLine": 1,
            "oldText": "export function a() {\n  const value = 1;\n  return value;\n}\n\n",
            "type": "update",
          },
        ],
        "renames": [],
      }
    `);
  });
});
