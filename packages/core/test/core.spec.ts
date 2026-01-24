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
});
