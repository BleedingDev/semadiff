import { describe, expect, test } from "vitest";
import {
  buildCompareText,
  isCosmeticLanguage,
  isSideEffectImportLine,
  normalizeCosmeticBlock,
  normalizeCosmeticText,
  shouldPairDeleteInsert,
} from "../src/diff-cosmetic";

describe("diff cosmetic helpers", () => {
  test("normalizes single-quoted strings for cosmetic compares", () => {
    expect(normalizeCosmeticText("const x = 'hello';")).toBe(
      'const x = "hello";'
    );
  });

  test("buildCompareText only normalizes configured cosmetic languages", () => {
    expect(buildCompareText("a   b", "json", true)).toBe("a   b");
    expect(buildCompareText("a   b", "ts", true)).toBe("a b");
    expect(buildCompareText("   \n\t", "ts", true)).toBe(" ");
  });

  test("identifies supported cosmetic languages", () => {
    expect(isCosmeticLanguage("ts")).toBe(true);
    expect(isCosmeticLanguage("tsx")).toBe(true);
    expect(isCosmeticLanguage("json")).toBe(false);
    expect(isCosmeticLanguage(undefined)).toBe(false);
  });

  test("pairs json delete/insert only when object key is stable", () => {
    expect(shouldPairDeleteInsert('  "name": 1,', '"name": 2,', "json")).toBe(
      true
    );
    expect(shouldPairDeleteInsert('"name": 1,', '"title": 2,', "json")).toBe(
      false
    );
    expect(shouldPairDeleteInsert("foo", "bar", "ts")).toBe(true);
  });

  test("detects side-effect import lines", () => {
    expect(isSideEffectImportLine('import "./setup";')).toBe(true);
    expect(isSideEffectImportLine('import { x } from "./x";')).toBe(false);
    expect(isSideEffectImportLine('import type { X } from "./x";')).toBe(false);
  });

  test("normalizes cosmetic import blocks with stable ordering", () => {
    const input = [
      '"use client"',
      'import { B } from "b";',
      'import { A } from "a";',
    ].join("\n");
    expect(normalizeCosmeticBlock(input)).toBe(
      ['"use client"', 'import { A } from "a";', 'import { B } from "b";'].join(
        "\n"
      )
    );
  });

  test("keeps side-effect import ordering in import-only blocks", () => {
    const input = [
      'import "./polyfill";',
      'import { B } from "b";',
      'import { A } from "a";',
    ].join("\n");
    expect(normalizeCosmeticBlock(input)).toBe(input);
  });

  test("keeps non-import blocks stable after cosmetic pass", () => {
    const arrow = "const View = () => { return (<div />); };";
    expect(normalizeCosmeticBlock(arrow)).toBe(arrow);

    const jsx = ["<Widget", "  zeta={2}", "  alpha={1}", "/>"].join("\n");
    expect(normalizeCosmeticBlock(jsx)).toBe(jsx);
  });

  test("keeps spread-heavy JSX blocks unchanged", () => {
    const jsx = [
      "<Widget",
      "  zeta={2}",
      "  {...props}",
      "  beta={2}",
      "  alpha={1}",
      "/>",
    ].join("\n");
    expect(normalizeCosmeticBlock(jsx)).toBe(jsx);
  });

  test("returns empty cosmetic block for whitespace-only input", () => {
    expect(normalizeCosmeticBlock(" \n\t ")).toBe("");
  });

  test("keeps malformed multiline JSX blocks unchanged", () => {
    const jsx = [
      "<Widget",
      "  alpha={1}",
      "  {condition && <Child />}",
      "/>",
    ].join("\n");
    expect(normalizeCosmeticBlock(jsx)).toBe(jsx);
  });

  test("keeps single-attribute multiline JSX blocks unchanged", () => {
    const jsx = ["<Widget", "  alpha={1}", "/>"].join("\n");
    expect(normalizeCosmeticBlock(jsx)).toBe(jsx);
  });

  test("keeps unterminated multiline JSX blocks unchanged", () => {
    const jsx = ["<Widget", "  alpha={1}"].join("\n");
    expect(normalizeCosmeticBlock(jsx)).toBe(jsx);
  });
});
