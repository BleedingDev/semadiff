import { defaultConfig, structuralDiff } from "@semadiff/core";
import { makeRegistry } from "@semadiff/parsers";
import { renderHtml } from "@semadiff/render-html";
import { describe, expect, it } from "vitest";

describe("semantic inline rendering", () => {
	it("ignores quote-style only noise in semantic token highlighting", () => {
		const oldText =
			"import { useCreateAddress, useUpdateAddress } from '@/hooks/use-addresses'";
		const newText =
			'import { useCreateAddress, useDeleteAddress } from "@/hooks/use-addresses"';

		const diff = structuralDiff(oldText, newText, {
			normalizers: defaultConfig.normalizers,
			language: "tsx",
		});

		const html = renderHtml(diff, {
			view: "lines",
			lineMode: "semantic",
			lineLayout: "split",
			language: "tsx",
			oldText,
			newText,
			virtualize: false,
			showBanner: false,
			showSummary: false,
			showFilePath: false,
			layout: "embed",
		});

		expect(html).toContain(
			'<span class="sd-inline-del">useUpdateAddress</span>',
		);
		expect(html).toContain(
			'<span class="sd-inline-add">useDeleteAddress</span>',
		);
		expect(html).not.toContain(
			'sd-inline-del">&#39;@/hooks/use-addresses&#39;',
		);
		expect(html).not.toContain(
			'sd-inline-add">&quot;@/hooks/use-addresses&quot;',
		);
		expect(html).toContain("from &#39;@/hooks/use-addresses&#39;");
		expect(html).toContain("from &quot;@/hooks/use-addresses&quot;");
	});

	it("detects js/ts module extensions for semantic language selection", () => {
		const registry = makeRegistry([]);

		expect(registry.selectLanguage({ content: "", path: "file.mjs" })).toBe(
			"js",
		);
		expect(registry.selectLanguage({ content: "", path: "file.cjs" })).toBe(
			"js",
		);
		expect(registry.selectLanguage({ content: "", path: "file.mts" })).toBe(
			"ts",
		);
		expect(registry.selectLanguage({ content: "", path: "file.cts" })).toBe(
			"ts",
		);
	});
});
