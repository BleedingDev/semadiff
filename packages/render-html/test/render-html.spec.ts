import type { DiffDocument, Range } from "@semadiff/core";
import { structuralDiff } from "@semadiff/core";
import { describe, expect, it } from "vitest";
import { __testing, renderHtml } from "../src/index";

function range(startLine: number, endLine: number): Range {
  return {
    start: { line: startLine, column: 1 },
    end: { line: endLine, column: 1 },
  };
}

function extractPayload(html: string) {
  const marker = "globalThis.__SEMADIFF_DATA__ = ";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("Expected virtualized payload marker.");
  }
  const from = start + marker.length;
  const end = html.indexOf(";</script>", from);
  if (end < 0) {
    throw new Error("Expected virtualized payload terminator.");
  }
  return JSON.parse(html.slice(from, end).trim()) as {
    operations?: unknown[];
    rows?: Array<{ type: string }>;
    batchSize?: number;
    lineLayout?: string;
  };
}

describe("renderHtml", () => {
  it("renders semantic operation views with summaries, renames, moves, and truncated previews", () => {
    const longOldText = [
      "const oldValue = '<tag>';",
      ...Array.from({ length: 80 }, () => "return oldValue;"),
    ].join("\n");
    const longNewText = [
      "const newValue = '<tag>';",
      ...Array.from({ length: 80 }, () => "return newValue;"),
    ].join("\n");
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "update",
          oldRange: range(1, 81),
          newRange: range(1, 81),
          oldText: longOldText,
          newText: longNewText,
          meta: { confidence: 0.65 },
        },
        {
          id: "op-2",
          type: "insert",
          newRange: range(82, 82),
          newText: "console.log(newValue);",
        },
        {
          id: "move-1",
          type: "move",
          oldRange: range(90, 92),
          newRange: range(100, 102),
          oldText: "function moved() {\n  return newValue;\n}",
          newText: "function moved() {\n  return newValue;\n}",
        },
      ],
      moves: [
        {
          id: "move-1",
          oldRange: range(90, 92),
          newRange: range(100, 102),
          confidence: 0.9,
          operations: ["move-1"],
        },
      ],
      renames: [
        {
          id: "rename-1",
          from: "oldValue",
          to: "newValue",
          occurrences: 2,
          confidence: 0.8,
        },
      ],
    };

    const html = renderHtml(diff, {
      title: "Semantic demo",
      filePath: "src/example.ts",
      showBanner: true,
      showSummary: true,
      showFilePath: true,
      layout: "full",
      virtualize: false,
    });

    expect(html).toContain("Semantic demo");
    expect(html).toContain("src/example.ts");
    expect(html).toContain("Operations");
    expect(html).toContain("Touched Lines");
    expect(html).toContain("Renames: oldValue → newValue (2)");
    expect(html).toContain("Moves: 1");
    expect(html).toContain("Confidence 65%");
    expect(html).toContain("Preview truncated");
  });

  it("shows a truncation banner when maxOps clips semantic operation output", () => {
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "update",
          oldRange: range(1, 1),
          newRange: range(1, 1),
          oldText: "const value = 1;",
          newText: "const value = 2;",
        },
        {
          id: "op-2",
          type: "insert",
          newRange: range(2, 2),
          newText: "const other = 3;",
        },
      ],
      moves: [],
      renames: [],
    };

    const html = renderHtml(diff, {
      virtualize: false,
      maxOperations: 1,
    });

    expect(html).toContain("Showing 1 of 2 operations.");
    expect(html).not.toContain("const other = 3;");
  });

  it("renders delete-only semantic operations with before previews", () => {
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "op-delete",
          type: "delete",
          oldRange: range(4, 6),
          oldText: "const removed = true;\nreturn removed;",
        },
      ],
      moves: [],
      renames: [],
    };

    const html = renderHtml(diff, {
      title: "Delete preview",
      virtualize: false,
    });

    expect(html).toContain("DELETE");
    expect(html).toContain("Before");
    expect(html).toContain("const removed = true;");
  });

  it("emits virtualized operation payloads for deferred semantic rendering", () => {
    const diff = structuralDiff(
      "export const value = 1;",
      "export const result = 2;",
      { language: "ts" }
    );

    const html = renderHtml(diff, {
      title: "Deferred ops",
      virtualize: true,
      batchSize: 1,
    });
    const payload = extractPayload(html);

    expect(payload.batchSize).toBe(1);
    expect(payload.operations).toHaveLength(1);
    expect(html).toContain('id="sd-ops"');
    expect(html).toContain("Loaded ");
  });

  it("emits virtualized line payloads with the requested layout", () => {
    const oldText = [
      "const keep = true;",
      "const value = 1;",
      "console.log(value);",
    ].join("\n");
    const newText = [
      "const keep = true;",
      "const result = 2;",
      "console.log(result);",
      "console.log('done');",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, {
      language: "ts",
      detectMoves: true,
    });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      filePath: "src/example.ts",
      language: "ts",
      lineLayout: "split",
      contextLines: 0,
      virtualize: true,
      layout: "embed",
      showBanner: false,
      showSummary: false,
      showFilePath: false,
    });
    const payload = extractPayload(html);

    expect(payload.lineLayout).toBe("split");
    expect(payload.rows?.some((row) => row.type === "replace")).toBe(true);
    expect(payload.rows?.some((row) => row.type === "insert")).toBe(true);
    expect(html).toContain("Loaded ");
  });

  it("uses semantic token ranges to anchor multiline import and identifier changes", () => {
    const oldText = [
      "import {",
      "  alpha,",
      "  beta,",
      "} from './dep';",
      "",
      "// duplicate comment",
      "// duplicate comment",
      "const shared = keep;",
      "const changed = oldValue;",
    ].join("\n");
    const newText = [
      "import {",
      "  alpha,",
      "  gamma,",
      "} from './dep';",
      "",
      "// duplicate comment",
      "// duplicate comment",
      "const shared = keep;",
      "const changed = newValue;",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, { language: "ts" });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      language: "ts",
      lineLayout: "split",
      contextLines: 0,
      virtualize: true,
      semanticTokens: {
        old: [
          {
            startIndex: oldText.indexOf("beta"),
            endIndex: oldText.indexOf("beta") + "beta".length,
          },
          {
            startIndex: oldText.indexOf("oldValue"),
            endIndex: oldText.indexOf("oldValue") + "oldValue".length,
          },
        ],
        new: [
          {
            startIndex: newText.indexOf("gamma"),
            endIndex: newText.indexOf("gamma") + "gamma".length,
          },
          {
            startIndex: newText.indexOf("newValue"),
            endIndex: newText.indexOf("newValue") + "newValue".length,
          },
        ],
      },
    });
    const payload = extractPayload(html);
    const text = JSON.stringify(payload.rows);

    expect(text).toContain("gamma");
    expect(text).toContain("newValue");
    expect(text).not.toContain("// duplicate comment");
  });

  it("suppresses balanced pnpm lock noise while keeping changed versions visible", () => {
    const oldText = [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    dependencies:",
      "      react:",
      "        version: 18.2.0",
      "packages:",
      "  react@18.2.0:",
      "    resolution: {integrity: sha512-old}",
    ].join("\n");
    const newText = [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    dependencies:",
      "      react:",
      "        version: 19.0.0",
      "packages:",
      "  react@18.2.0:",
      "    resolution: {integrity: sha512-old}",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, { language: "yaml" });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      language: "yaml",
      filePath: "pnpm-lock.yaml",
      lineLayout: "split",
      contextLines: 0,
      virtualize: true,
    });
    const payload = extractPayload(html);
    const text = JSON.stringify(payload.rows);

    expect(text).toContain("19.0.0");
    expect(text).not.toContain("resolution: {integrity: sha512-old}");
  });

  it("hides comment-only rows from semantic line views", () => {
    const oldText = [
      "// same header comment",
      "const value = 1;",
      "// trailing note",
    ].join("\n");
    const newText = [
      "// same header comment",
      "const value = 2;",
      "// trailing note",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, { language: "ts" });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      language: "ts",
      hideComments: true,
      contextLines: -1,
      lineLayout: "split",
      virtualize: true,
    });
    const payload = extractPayload(html);
    const text = JSON.stringify(payload.rows);

    expect(text).toContain("const value = 2;");
    expect(text).not.toContain("same header comment");
    expect(text).not.toContain("trailing note");
  });

  it("returns no line markup when hidden comments remove every semantic change", () => {
    const oldText = "// old comment";
    const newText = "// new comment";
    const diff = structuralDiff(oldText, newText, { language: "ts" });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "semantic",
      oldText,
      newText,
      language: "ts",
      hideComments: true,
      contextLines: 0,
      virtualize: false,
    });

    expect(html).toBe("");
  });

  it("filters comment-only semantic operations when comment hiding is enabled", () => {
    const diff: DiffDocument = {
      version: "0.1.0",
      operations: [
        {
          id: "comment-op",
          type: "update",
          oldRange: range(1, 1),
          newRange: range(1, 1),
          oldText: "// old comment",
          newText: "// new comment",
        },
        {
          id: "code-op",
          type: "update",
          oldRange: range(2, 2),
          newRange: range(2, 2),
          oldText: "const value = 1;",
          newText: "const value = 2;",
        },
      ],
      moves: [],
      renames: [],
    };

    const html = renderHtml(diff, {
      language: "ts",
      hideComments: true,
      virtualize: false,
    });

    expect(html).toContain("const value = 2;");
    expect(html).not.toContain("old comment");
    expect(html).not.toContain("new comment");
  });

  it("renders removed-file raw lines without requiring virtualization", () => {
    const oldText = ["const first = 1;", "const second = 2;"].join("\n");
    const newText = "";
    const diff = structuralDiff(oldText, newText, {
      language: "text",
      detectMoves: false,
    });

    const html = renderHtml(diff, {
      view: "lines",
      lineMode: "raw",
      oldText,
      newText,
      language: "text",
      lineLayout: "unified",
      contextLines: -1,
      virtualize: false,
    });

    expect(html).toContain("sd-line--delete");
    expect(html).toContain("const first = 1;");
    expect(html).toContain("const second = 2;");
  });

  it("marks inline token changes while keeping unchanged HTML escaped", () => {
    const inline = __testing.renderInlineDiff(
      "const oldValue = '<tag>';",
      "const newValue = '<tag>';",
      "ts"
    );

    expect(inline.oldHtml).toContain('class="sd-inline-del"');
    expect(inline.newHtml).toContain('class="sd-inline-add"');
    expect(inline.oldHtml).toContain("&lt;tag&gt;");
    expect(inline.newHtml).toContain("&lt;tag&gt;");
  });

  it("uses operation-anchored line rows when they preserve nearby equal context", () => {
    const oldText = [
      "const before = 0;",
      "const keep1 = 1;",
      "const mode = 'old';",
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const tail = 4;",
    ].join("\n");
    const newText = [
      "const before = 0;",
      "const keep1 = 1;",
      'const mode = "new";',
      "const keep2 = 2;",
      "const keep3 = 3;",
      "const insertA = 5;",
      "const insertB = 6;",
      "const tail = 4;",
    ].join("\n");
    const diff = structuralDiff(oldText, newText, {
      language: "ts",
      detectMoves: true,
    });

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
    const payload = extractPayload(html);
    const rows = payload.rows ?? [];

    expect(
      rows.some(
        (row) =>
          row.type === "equal" &&
          "text" in row &&
          row.text === "const keep2 = 2;"
      )
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.type === "equal" &&
          "text" in row &&
          row.text === "const keep3 = 3;"
      )
    ).toBe(true);
  });

  it("treats balanced cosmetic raw rows as non-meaningful but preserves moves", () => {
    const balancedRows = [
      {
        type: "delete" as const,
        oldLine: 1,
        newLine: null,
        text: "import { Box } from '@mui/material';",
      },
      {
        type: "insert" as const,
        oldLine: null,
        newLine: 1,
        text: 'import { Box } from "@mui/material";',
      },
    ];
    const moveRows = [
      {
        type: "move" as const,
        oldLine: 4,
        newLine: 8,
        text: "const moved = true;",
      },
    ];

    expect(
      __testing.hasMeaningfulRawLineChanges(balancedRows, (line: string) =>
        line.replaceAll("'", '"')
      )
    ).toBe(false);
    expect(
      __testing.hasMeaningfulRawLineChanges(moveRows, (line: string) => line)
    ).toBe(true);
  });
});
