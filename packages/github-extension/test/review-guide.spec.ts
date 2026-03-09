import type { DiffDocument } from "@semadiff/core";
import { describe, expect, test } from "vitest";

import {
	composeExtensionFileGuide,
	findExtensionReviewEntry,
	summarizeExtensionReview,
} from "../src/review-guide";

const diffFixture: DiffDocument = {
	version: "0.1.0",
	operations: [
		{
			id: "op-1",
			kind: "update",
			oldText: "return 1;",
			newText: "return 2;",
			oldRange: {
				start: { line: 2, column: 1 },
				end: { line: 2, column: 10 },
			},
			newRange: {
				start: { line: 2, column: 1 },
				end: { line: 2, column: 10 },
			},
			meta: {},
		},
	],
	moves: [
		{
			id: "move-1",
			oldRange: {
				start: { line: 1, column: 1 },
				end: { line: 3, column: 1 },
			},
			newRange: {
				start: { line: 4, column: 1 },
				end: { line: 6, column: 1 },
			},
			confidence: 0.96,
			operations: ["op-1"],
		},
	],
	renames: [],
};

describe("extension review-guide helpers", () => {
	test("summarizes overlay review priorities from file paths", () => {
		const summary = summarizeExtensionReview(
			["src/app.tsx", "pnpm-lock.yaml"],
			"Overlay test",
		);

		expect(summary.queue[0]?.filename).toBe("src/app.tsx");
		expect(findExtensionReviewEntry(summary, "pnpm-lock.yaml")?.priority).toBe(
			"deprioritized",
		);
	});

	test("composes detailed file guidance from a local diff document", () => {
		const guide = composeExtensionFileGuide({
			path: "src/app.tsx",
			diff: diffFixture,
			initialPriority: "review_first",
			language: "tsx",
			title: "Overlay test",
		});

		expect(guide.filename).toBe("src/app.tsx");
		expect(guide.priority).toBe("review_first");
		expect(guide.reasons.some((reason) => reason.ruleId.includes("move"))).toBe(
			true,
		);
	});

	test("downgrades trust when the local diff fell back to plain text", () => {
		const guide = composeExtensionFileGuide({
			path: "docs/notes.txt",
			diff: {
				...diffFixture,
				moves: [],
			},
			language: "text",
			title: "Overlay test",
		});

		expect(guide.warnings).toContain(
			"Parsed as plain text; semantic confidence reduced.",
		);
	});
});
