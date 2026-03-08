import { defaultConfig, structuralDiff } from "@semadiff/core";
import { describe, expect, it } from "vitest";
import { renderFileDiffHtml } from "../src/pr-diff";

describe("renderFileDiffHtml", () => {
  it("localizes semantic update rows inside oversized update envelopes", () => {
    const oldText = [
      'import { List } from "@mui/material";',
      "",
      "function helper() {",
      '  const label = "Virtualize";',
      "  return label;",
      "}",
    ].join("\n");
    const newText = [
      'import { List } from "@mui/material";',
      "",
      "function helper() {",
      '  const name = "Virtualize";',
      "  return name;",
      "}",
    ].join("\n");

    const diff = {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "update" as const,
          oldRange: {
            start: { line: 1, column: 1 },
            end: { line: 6, column: 2 },
          },
          newRange: {
            start: { line: 1, column: 1 },
            end: { line: 6, column: 2 },
          },
          oldText,
          newText,
        },
      ],
      moves: [],
      renames: [],
    };

    const { linesHtml } = renderFileDiffHtml({
      filename: "demo.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      oldTokens: undefined,
      newTokens: undefined,
      contextLines: -1,
      lineLayout: "split",
      lineMode: "semantic",
      hideComments: false,
    });

    expect(linesHtml).toContain("import { List } from");
    expect(
      linesHtml.match(/<div class="sd-line sd-line--replace">/g) ?? []
    ).toHaveLength(2);
    expect(linesHtml).not.toContain(
      '<div class="sd-line sd-line--replace"><div class="sd-num sd-num--old">1</div>'
    );
  });

  it("does not emit quote-style only noise in semantic line mode", () => {
    const oldText = "mode = 'add',";
    const newText = 'mode = "add",';
    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "demo.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      contextLines: -1,
      lineLayout: "unified",
      lineMode: "semantic",
      hideComments: true,
    });

    expect(linesHtml).not.toContain(
      '<span class="sd-inline-del">&#39;add&#39;'
    );
    expect(linesHtml).not.toContain(
      '<span class="sd-inline-add">&quot;add&quot;'
    );
    expect(linesHtml).not.toContain(
      '<div class="sd-line sd-line--delete sd-line--unified">'
    );
    expect(linesHtml).not.toContain(
      '<div class="sd-line sd-line--insert sd-line--unified">'
    );
  });

  it("keeps meaningful identifier edits while ignoring quote-style noise", () => {
    const oldText =
      "import { useCreateAddress, useUpdateAddress } from '@/hooks/use-addresses'";
    const newText =
      'import { useCreateAddress, useDeleteAddress } from "@/hooks/use-addresses"';
    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "demo.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      contextLines: -1,
      lineLayout: "split",
      lineMode: "semantic",
      hideComments: true,
    });

    expect(linesHtml).toContain(
      '<span class="sd-inline-del">useUpdateAddress</span>'
    );
    expect(linesHtml).toContain(
      '<span class="sd-inline-add">useDeleteAddress</span>'
    );
    expect(linesHtml).not.toContain(
      '<span class="sd-inline-del">&#39;@/hooks/use-addresses&#39;</span>'
    );
    expect(linesHtml).not.toContain(
      '<span class="sd-inline-add">&quot;@/hooks/use-addresses&quot;</span>'
    );
  });

  it("suppresses quote-only delete/insert rows inside mixed edits", () => {
    const oldText = [
      "import { checkoutContext } from '../_context/checkout-context'",
      "import { useUpdateAddress } from '@/hooks/use-addresses'",
      "",
      "mode = 'add',",
    ].join("\n");
    const newText = [
      'import { checkoutContext } from "../_context/checkout-context"',
      'import { useDeleteAddress } from "@/hooks/use-addresses"',
      "",
      'mode = "add",',
    ].join("\n");

    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "demo.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      contextLines: -1,
      lineLayout: "unified",
      lineMode: "semantic",
      hideComments: true,
    });

    expect(linesHtml).toContain(
      '<span class="sd-inline-del">useUpdateAddress</span>'
    );
    expect(linesHtml).toContain(
      '<span class="sd-inline-add">useDeleteAddress</span>'
    );
    expect(linesHtml).not.toContain(
      "&#39;../_context/checkout-context&#39;</span>"
    );
    expect(linesHtml).not.toContain(
      "&quot;../_context/checkout-context&quot;</span>"
    );
    expect(linesHtml).not.toContain(
      '<span class="sd-inline-del">&#39;add&#39;'
    );
    expect(linesHtml).not.toContain(
      '<span class="sd-inline-add">&quot;add&quot;'
    );
  });

  it("suppresses unchanged imports around multiline import reshapes", () => {
    const oldText = [
      "import * as React from 'react';",
      "import { FixedSizeList, ListChildComponentProps } from 'react-window';",
      "import { Popper } from '@mui/base/Popper';",
      "import Autocomplete from '@mui/joy/Autocomplete';",
      "import AutocompleteListbox from '@mui/joy/AutocompleteListbox';",
      "import AutocompleteOption from '@mui/joy/AutocompleteOption';",
      "import FormControl from '@mui/joy/FormControl';",
      "import FormLabel from '@mui/joy/FormLabel';",
      "import ListSubheader from '@mui/joy/ListSubheader';",
      "",
      "const LISTBOX_PADDING = 6; // px",
      "",
      "function renderRow(props: ListChildComponentProps) {",
      "  return props.index;",
      "}",
    ].join("\n");
    const newText = [
      "import * as React from 'react';",
      "import { List, RowComponentProps, ListImperativeAPI } from 'react-window';",
      "import { Popper } from '@mui/base/Popper';",
      "import Autocomplete from '@mui/joy/Autocomplete';",
      "import AutocompleteOption from '@mui/joy/AutocompleteOption';",
      "import FormControl from '@mui/joy/FormControl';",
      "import FormLabel from '@mui/joy/FormLabel';",
      "import ListSubheader from '@mui/joy/ListSubheader';",
      "import AutocompleteListbox, {",
      "  AutocompleteListboxProps,",
      "} from '@mui/joy/AutocompleteListbox';",
      "",
      "const LISTBOX_PADDING = 6; // px",
      "",
      "function renderRow(props: RowComponentProps & { data: any }) {",
      "  return props.index;",
      "}",
    ].join("\n");

    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
      detectMoves: true,
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "demo.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      contextLines: 0,
      lineLayout: "split",
      lineMode: "semantic",
      hideComments: false,
    });

    expect(linesHtml).toContain("AutocompleteListboxProps");
    expect(linesHtml).toContain("RowComponentProps");
    expect(linesHtml).toContain("data");
    expect(linesHtml).not.toContain(
      '<div class="sd-line sd-line--insert"><div class="sd-num sd-num--new">5</div>'
    );
    expect(linesHtml).not.toContain(
      '<div class="sd-line sd-line--delete"><div class="sd-num sd-num--old">9</div>'
    );
  });

  it("does not emit synthetic deletes for added files", () => {
    const oldText = "";
    const newText = [
      "export default function SimplePortal() {",
      "  return null;",
      "}",
    ].join("\n");

    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "tsx",
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "SimplePortal.tsx",
      diff,
      language: "tsx",
      oldText,
      newText,
      contextLines: -1,
      lineLayout: "split",
      lineMode: "semantic",
      hideComments: false,
    });

    expect(linesHtml).toContain("SimplePortal");
    expect(linesHtml).toContain("@@ -0,0 +1,3 @@");
    expect(linesHtml).toContain('<span class="sd-inline-add">}</span>');
    expect(linesHtml).not.toContain('<div class="sd-line sd-line--delete"');
    expect(linesHtml).not.toContain('<div class="sd-line sd-line--replace"');
  });

  it("keeps moved block anchors visible when a moved function also changes", () => {
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

    const diff = structuralDiff(oldText, newText, {
      normalizers: defaultConfig.normalizers,
      language: "ts",
      detectMoves: true,
    });

    const { linesHtml } = renderFileDiffHtml({
      filename: "src/example.ts",
      diff,
      language: "ts",
      oldText,
      newText,
      contextLines: 0,
      lineLayout: "split",
      lineMode: "semantic",
      hideComments: false,
    });

    expect(linesHtml).toContain('<div class="sd-line sd-line--move"');
    expect(linesHtml).toContain("export function a() {");
    expect(linesHtml).toContain("const value = 1;");
    expect(linesHtml).toContain("return value + 0;");
  });
});
