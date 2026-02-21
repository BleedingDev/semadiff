import { defaultConfig, structuralDiff } from "@semadiff/core";
import { describe, expect, it } from "vitest";
import { renderFileDiffHtml } from "../src/pr-diff";

describe("renderFileDiffHtml", () => {
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
});
