import { describe, expect, test } from "vitest";
import { detectRenames } from "../src/diff-rename";

describe("rename detection helpers", () => {
  test("returns no rename groups when token counts differ", () => {
    expect(detectRenames("const foo = 1;", "const foo = 1; foo")).toEqual([]);
  });

  test("returns no rename groups when mapping occurs only once", () => {
    expect(detectRenames("const foo = 1;", "const bar = 1;")).toEqual([]);
  });

  test("detects repeated identifier mapping as a rename group", () => {
    const renames = detectRenames(
      "const foo = foo + foo;",
      "const bar = bar + bar;"
    );
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({
      id: "rename-1",
      from: "foo",
      to: "bar",
      occurrences: 3,
    });
  });

  test("supports multiple rename groups", () => {
    const renames = detectRenames(
      "foo foo baz baz keep keep",
      "bar bar qux qux keep keep"
    );
    expect(renames).toHaveLength(2);
    expect(renames.map((rename) => `${rename.from}->${rename.to}`)).toEqual([
      "foo->bar",
      "baz->qux",
    ]);
  });
});
