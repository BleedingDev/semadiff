import type { DiffDocument, Range } from "@semadiff/core";
import { structuralDiff } from "@semadiff/core";
import { renderHtml } from "@semadiff/render-html";
import { describe, expect, it } from "vitest";
import { renderTerminal, renderTerminalLinesFromHtml } from "../src/index";

function range(startLine: number, endLine: number): Range {
  return {
    start: { line: startLine, column: 1 },
    end: { line: endLine, column: 1 },
  };
}

function linePayloadHtml(payload: unknown) {
  return `<script>globalThis.__SEMADIFF_DATA__ = ${JSON.stringify(payload)};</script>`;
}

describe("renderTerminal", () => {
  it("renders side-by-side semantic output with nested move updates and renames", () => {
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "move-1",
          type: "move",
          oldRange: range(1, 4),
          newRange: range(5, 8),
          oldText: "function moved() {\n  return foo;\n}",
          newText: "function moved() {\n  return bar;\n}",
          meta: { confidence: 0.91 },
        },
        {
          id: "op-2",
          type: "update",
          oldRange: range(2, 2),
          newRange: range(6, 6),
          oldText: "  return foo;",
          newText: "  return bar;",
          meta: { moveId: "move-1" },
        },
        {
          id: "op-3",
          type: "insert",
          newRange: range(9, 9),
          newText:
            "const veryLongInsertedLine = 'this line should be truncated in side-by-side mode';",
        },
      ],
      moves: [
        {
          id: "move-1",
          oldRange: range(1, 4),
          newRange: range(5, 8),
          confidence: 0.91,
          operations: ["move-1", "op-2"],
        },
      ],
      renames: [
        {
          id: "rename-1",
          from: "foo",
          to: "bar",
          occurrences: 2,
          confidence: 0.72,
        },
      ],
    };

    const output = renderTerminal(diff, {
      format: "plain",
      layout: "side-by-side",
      maxWidth: 24,
    });

    expect(output).toContain("OLD");
    expect(output).toContain("NEW");
    expect(output).toContain("move 1 -> 5");
    expect(output).toContain("  ~ update 2");
    expect(output).toContain("foo -> bar (2)");
    expect(output).toContain("...");
  });

  it("renders ANSI output when requested", () => {
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "insert",
          newRange: range(1, 1),
          newText: "const inserted = true;",
        },
      ],
      moves: [],
      renames: [],
    };

    const output = renderTerminal(diff, { format: "ansi" });

    expect(output).toContain("\u001b[32m+ insert 1\u001b[0m");
  });

  it("renders semantic line views directly from source text", () => {
    const oldText = ["export function widget() {", "  return 1;", "}"].join(
      "\n"
    );
    const newText = ["export function widget() {", "  return 2;", "}"].join(
      "\n"
    );
    const diff = structuralDiff(oldText, newText, { language: "ts" });

    const output = renderTerminal(diff, {
      format: "plain",
      view: "lines",
      layout: "unified",
      lineMode: "semantic",
      oldText,
      newText,
      language: "ts",
      contextLines: -1,
    });

    expect(output).not.toBe("Unable to render line diff.");
    expect(output).toContain("return 1;");
    expect(output).toContain("return 2;");
  });

  it("renders line payloads produced by renderHtml", () => {
    const oldText = [
      "const keep = true;",
      "const value = 1;",
      "console.log(value);",
    ].join("\n");
    const newText = [
      "const keep = true;",
      "const result = 2;",
      "console.log(result);",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, { language: "ts" });
    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      language: "ts",
      lineLayout: "split",
      contextLines: -1,
      virtualize: true,
    });

    const output = renderTerminalLinesFromHtml(html, {
      format: "plain",
      layout: "side-by-side",
      contextLines: -1,
    });

    expect(output).toContain("result");
    expect(output).toContain("|");
  });

  it("gracefully falls back when a line payload is malformed", () => {
    const html =
      '<script>globalThis.__SEMADIFF_DATA__ = {"rows":[{"type":"insert"}],"lineLayout":invalid};</script>';

    expect(renderTerminalLinesFromHtml(html, { format: "plain" })).toBe(
      "Unable to render line diff."
    );
  });

  it("renders unified line payload markers, replacements, moves, and hidden gaps", () => {
    const html = linePayloadHtml({
      lineLayout: "unified",
      rows: [
        { type: "equal", oldLine: 1, newLine: 1, text: "const keep = true;" },
        { type: "hunk", header: "@@ -2,3 +2,4 @@" },
        { type: "delete", oldLine: 2, oldText: "const oldValue = 1;" },
        { type: "insert", newLine: 2, newText: "const newValue = 2;" },
        {
          type: "replace",
          oldLine: 3,
          newLine: 3,
          oldText: "return oldValue;",
          newText: "return newValue;",
        },
        {
          type: "move",
          oldLine: 6,
          newLine: 4,
          oldText: "moved();",
          newText: "moved();",
        },
        { type: "gap", hidden: 2 },
      ],
    });

    const output = renderTerminalLinesFromHtml(html, {
      format: "plain",
      layout: "unified",
      contextLines: 0,
    });

    expect(output).toContain("@@ -2,3 +2,4 @@");
    expect(output).not.toContain("const keep = true;");
    expect(output).toContain("- const oldValue = 1;");
    expect(output).toContain("+ const newValue = 2;");
    expect(output).toContain("- return oldValue;");
    expect(output).toContain("+ return newValue;");
    expect(output).toContain("> moved();");
    expect(output).toContain("2 lines hidden");
  });

  it("renders split line payload rows and empty semantic summaries", () => {
    const html = linePayloadHtml({
      lineLayout: "split",
      rows: [
        { type: "equal", oldLine: 1, newLine: 1, text: "const same = true;" },
        { type: "delete", oldLine: 2, oldText: "const before = 1;" },
        { type: "insert", newLine: 2, newText: "const after = 2;" },
        {
          type: "replace",
          oldLine: 3,
          newLine: 3,
          oldText: "return before;",
          newText: "return after;",
        },
        {
          type: "move",
          oldLine: 5,
          newLine: 4,
          oldText: "movedLine();",
          newText: "movedLine();",
        },
        { type: "gap", hidden: 1 },
      ],
    });
    const emptyDiff: DiffDocument = {
      version: "0.1.0",
      operations: [],
      moves: [],
      renames: [],
    };

    const output = renderTerminalLinesFromHtml(html, {
      format: "plain",
      layout: "side-by-side",
      contextLines: 1,
      maxWidth: 14,
    });

    expect(output).toContain("const same ...");
    expect(output).toContain("const befor...");
    expect(output).toContain("const after...");
    expect(output).toContain("return after;");
    expect(output).toContain("movedLine()");
    expect(output).toContain("1 line hidden");
    expect(renderTerminal(emptyDiff, { format: "plain" })).toBe(
      "No semantic changes detected."
    );
    expect(
      renderTerminal(emptyDiff, {
        format: "plain",
        layout: "side-by-side",
      })
    ).toBe("No semantic changes detected.");
  });
});
