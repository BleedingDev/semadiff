import { describe, expect, test } from "vitest";
import { defaultConfig } from "../src/config";
import { structuralDiff } from "../src/diff";

describe("core diff basics", () => {
  test("tailwind class reorder produces no diff", () => {
    const oldText = '<div className="b a" />';
    const newText = '<div className="a b" />';
    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
    });
    expect(diff.operations.length).toBe(0);
  });

  test("rename grouping detects repeated mapping", () => {
    const diff = structuralDiff(
      "const foo = foo + foo;",
      "const bar = bar + bar;"
    );
    expect(diff.renames.length).toBeGreaterThan(0);
    expect(diff.renames[0]?.from).toBe("foo");
    expect(diff.renames[0]?.to).toBe("bar");
  });

  test("import specifier ordering normalizes named imports", () => {
    const oldText = 'import { b, a } from "lib";';
    const newText = 'import { a, b } from "lib";';
    const enabled = {
      global: {
        ...defaultConfig.normalizers.global,
        importOrder: true,
      },
      perLanguage: {},
    };
    const diffEnabled = structuralDiff(oldText, newText, {
      normalizers: enabled,
      language: "ts",
    });
    const diffDisabled = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "ts",
    });
    expect(diffEnabled.operations.length).toBe(0);
    expect(diffDisabled.operations.length).toBeGreaterThan(0);
  });

  test("numeric literal normalization removes separators", () => {
    const oldText = "const total = 1_000 + 2;";
    const newText = "const total = 1000 + 2;";
    const enabled = {
      global: {
        ...defaultConfig.normalizers.global,
        numericLiterals: true,
      },
      perLanguage: {},
    };
    const diffEnabled = structuralDiff(oldText, newText, {
      normalizers: enabled,
      language: "ts",
    });
    const diffDisabled = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "ts",
    });
    expect(diffEnabled.operations.length).toBe(0);
    expect(diffDisabled.operations.length).toBeGreaterThan(0);
  });

  test("moves are detected without parser roots for code blocks", () => {
    const diff = structuralDiff(
      "export function a() {\n  const value = 1;\n  return value;\n}\n\nexport function b() {\n  return 2;\n}\n",
      "export function b() {\n  return 2;\n}\n\nexport function a() {\n  const value = 1;\n  return value + 0;\n}\n",
      { language: "ts" }
    );
    expect(diff.moves.length).toBeGreaterThan(0);
    expect(diff.operations.some((op) => op.type === "move")).toBe(true);
    expect(
      diff.operations.some(
        (op) => op.type === "update" && op.meta?.moveId !== undefined
      )
    ).toBe(true);
  });

  test("empty old text yields a single insert operation", () => {
    const newText = "export const value = 1;\n";
    const diff = structuralDiff("", newText, { language: "ts" });
    expect(diff.moves).toHaveLength(0);
    expect(diff.renames).toHaveLength(0);
    expect(diff.operations).toHaveLength(1);
    expect(diff.operations[0]?.type).toBe("insert");
    expect(diff.operations[0]?.newText).toBe(newText);
    expect(diff.operations[0]?.newRange).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 2, column: 1 },
    });
  });

  test("empty new text yields a single delete operation", () => {
    const oldText = "export const value = 1;\n";
    const diff = structuralDiff(oldText, "", { language: "ts" });
    expect(diff.moves).toHaveLength(0);
    expect(diff.renames).toHaveLength(0);
    expect(diff.operations).toHaveLength(1);
    expect(diff.operations[0]?.type).toBe("delete");
    expect(diff.operations[0]?.oldText).toBe(oldText);
    expect(diff.operations[0]?.oldRange).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 2, column: 1 },
    });
  });

  test("explicit token ranges force structural token diff path", () => {
    const oldText = "const a = 1;\nconst b = 2;\n";
    const newText = "const b = 2;\nconst a = 1;\n";

    const baseline = structuralDiff(oldText, newText, { language: "ts" });
    const withExplicitTokens = structuralDiff(oldText, newText, {
      language: "ts",
      oldTokens: [{ startIndex: 0, endIndex: oldText.length }],
      newTokens: [{ startIndex: 0, endIndex: newText.length }],
    });

    expect(baseline.operations.some((op) => op.type === "move")).toBe(true);
    expect(withExplicitTokens.operations).toHaveLength(1);
    expect(withExplicitTokens.operations[0]?.type).toBe("update");
    expect(withExplicitTokens.moves).toHaveLength(0);
  });

  test("detectMoves=false disables move detection output", () => {
    const diff = structuralDiff(
      "export function a() {\n  const value = 1;\n  return value;\n}\n\nexport function b() {\n  return 2;\n}\n",
      "export function b() {\n  return 2;\n}\n\nexport function a() {\n  const value = 1;\n  return value + 0;\n}\n",
      { language: "ts", detectMoves: false }
    );
    expect(diff.moves).toHaveLength(0);
    expect(diff.operations.some((op) => op.type === "move")).toBe(false);
    expect(diff.operations.length).toBeGreaterThan(0);
  });
});
