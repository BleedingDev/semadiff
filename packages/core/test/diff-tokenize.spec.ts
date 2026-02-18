import { describe, expect, test } from "vitest";
import { rangeForTokens, textForTokens, tokenize } from "../src/diff-tokenize";

describe("diff tokenization helpers", () => {
  test("prefers explicit ranges over parser roots", () => {
    const text = "const value = 1;";
    const root = {
      startIndex: 0,
      endIndex: text.length,
      childCount: 1,
      children: [
        { startIndex: 0, endIndex: text.length, childCount: 0, children: [] },
      ],
    };
    const tokens = tokenize(
      text,
      root,
      [
        { startIndex: 0, endIndex: 5 },
        { startIndex: 6, endIndex: 11 },
      ],
      "ts"
    );
    expect(tokens.map((token) => token.text)).toEqual([
      "const",
      " ",
      "value",
      " = 1;",
    ]);
  });

  test("uses tree-sitter leaves when explicit ranges are absent", () => {
    const text = "ab cd";
    const root = {
      startIndex: 0,
      endIndex: text.length,
      childCount: 2,
      children: [
        { startIndex: 0, endIndex: 2, childCount: 0, children: [] },
        { startIndex: 3, endIndex: 5, childCount: 0, children: [] },
      ],
    };
    const tokens = tokenize(text, root, undefined, "ts");
    expect(tokens.map((token) => token.text)).toEqual(["ab", " ", "cd"]);
  });

  test("clamps out-of-bounds parser ranges and ignores invalid children", () => {
    const text = "abc";
    const root = {
      startIndex: 0,
      endIndex: text.length,
      childCount: 2,
      children: [
        { foo: "bar" },
        { startIndex: -10, endIndex: 99, childCount: 0, children: [] },
      ],
    };
    const tokens = tokenize(text, root, undefined, "ts");
    expect(tokens.map((token) => token.text)).toEqual(["abc"]);
  });

  test("falls back to regex tokenization for single-line text", () => {
    const tokens = tokenize("let x=1", undefined, undefined, "ts");
    expect(tokens.map((token) => token.text)).toEqual([
      "let",
      " ",
      "x",
      "=",
      "1",
    ]);
  });

  test("regex tokenization returns a single token when no matches are found", () => {
    const tokens = tokenize("   ", undefined, undefined, "ts");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.text).toBe("   ");
  });

  test("falls back to line tokenization for multiline text", () => {
    const tokens = tokenize("a\nb\n", undefined, undefined, "ts");
    expect(tokens.map((token) => token.text)).toEqual(["a\n", "b\n"]);
  });

  test("uses regex tokenization for single-line json and preserves spacing", () => {
    const tokens = tokenize('{"a": 1}', undefined, undefined, "json");
    expect(tokens.map((token) => token.text)).toEqual([
      "{",
      '"a"',
      ":",
      " ",
      "1",
      "}",
    ]);
    expect(tokens[3]?.compareText).toBe(" ");
  });

  test("uses line tokenization for multiline json", () => {
    const text = '{\n  "a": 1\n}\n';
    const tokens = tokenize(text, undefined, undefined, "json");
    expect(tokens.map((token) => token.text)).toEqual([
      "{\n",
      '  "a": 1\n',
      "}\n",
    ]);
  });

  test("rangeForTokens returns empty range for invalid spans", () => {
    expect(rangeForTokens([], 0, 1)).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    });
  });

  test("rangeForTokens and textForTokens clamp to token boundaries", () => {
    const text = "foo bar";
    const tokens = tokenize(text, undefined, undefined, "ts");
    expect(rangeForTokens(tokens, 1, 10)).toEqual({
      start: { line: 1, column: 4 },
      end: { line: 1, column: 8 },
    });
    expect(textForTokens(text, tokens, 1, 10)).toBe(" bar");
    expect(textForTokens(text, tokens, 1, 0)).toBe("");
  });
});
