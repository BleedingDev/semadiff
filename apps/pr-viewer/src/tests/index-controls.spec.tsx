// @vitest-environment jsdom

import type {
	FileDiffPayload,
	FileReviewGuide,
	PrDiffResult,
	PrReviewSummary,
	PrSummary,
} from "@semadiff/pr-backend";
import {
	ChangeTotals,
	findFirstChangedLine,
	focusFirstDiffChange,
	SemaDiffExplorer,
	scrollDiffDocumentToFirstChange,
} from "@semadiff/react-ui";
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const SUMMARY_FIXTURE: PrSummary = {
	pr: {
		title: "Refactor checkout flow",
		url: "https://github.com/NMIT-WR/new-engine/pull/237",
		baseSha: "base-sha",
		headSha: "head-sha",
		additions: 34,
		deletions: 254,
		changedFiles: 1,
	},
	files: [
		{
			filename: "apps/n1/next.config.ts",
			status: "modified",
			additions: 1,
			deletions: 1,
			changes: 2,
			sha: "abc123",
		},
	],
};

const SUMMARY_TWO_FILES: PrSummary = {
	...SUMMARY_FIXTURE,
	files: [
		{
			filename: "apps/n1/next.config.ts",
			status: "modified",
			additions: 1,
			deletions: 1,
			changes: 2,
			sha: "abc123",
		},
		{
			filename: "apps/n1/package.json",
			status: "modified",
			additions: 2,
			deletions: 1,
			changes: 3,
			sha: "def456",
		},
	],
};

const DIFF_FIXTURE: FileDiffPayload = {
	file: {
		filename: "apps/n1/next.config.ts",
		status: "modified",
		additions: 1,
		deletions: 1,
		changes: 2,
		sha: "abc123",
		warnings: [],
	},
	semanticHtml: "",
	linesHtml: "<html><body><div>ok</div></body></html>",
};

const REVIEW_SUMMARY_FIXTURE: PrReviewSummary = {
	version: "0.1.0",
	ruleVersion: "0.1.0",
	themes: ["1 source file carries active code-review weight."],
	queue: [
		{
			filename: "apps/n1/next.config.ts",
			priority: "review_first",
			classification: {
				primaryCategory: "source",
				categories: ["source"],
				trustBand: "deterministic_inference",
				reasons: ["Default source-file classification."],
			},
			reasons: [
				{
					id: "reason:queue",
					scope: "pr",
					message: "Review this config change early.",
					trustBand: "deterministic_inference",
					ruleId: "priority:source",
					evidence: [],
				},
			],
			warnings: [],
		},
	],
	deprioritized: [],
	deprioritizedGroups: [],
	warnings: [],
};

const REVIEW_GUIDE_FIXTURE: FileReviewGuide = {
	version: "0.1.0",
	ruleVersion: "0.1.0",
	filename: "apps/n1/next.config.ts",
	priority: "review_first",
	classification: {
		primaryCategory: "source",
		categories: ["source"],
		trustBand: "deterministic_inference",
		reasons: ["Default source-file classification."],
	},
	summary: "Review this config change carefully.",
	reasons: [
		{
			id: "reason:file",
			scope: "file",
			message: "Configuration changes can alter application behavior.",
			trustBand: "structural_fact",
			ruleId: "reason:config_change",
			evidence: [],
		},
	],
	questions: [
		{
			id: "question:file",
			question: "Does this config change affect deployment or routing?",
			rationale: "Configuration updates often affect runtime behavior.",
			trustBand: "contextual_hint",
			suggestedAction: "open_file",
			ruleId: "question:config_runtime",
			evidence: [],
		},
	],
	warnings: [],
	diagnostics: {
		version: "0.1.0",
		ruleVersion: "0.1.0",
		ruleHits: [],
		scoreBreakdown: [],
		evidenceIndex: [],
		traceSummary: {
			ruleHitCount: 0,
			scoreEntryCount: 0,
			evidenceCount: 0,
		},
		consistency: {
			missingRuleIds: [],
			emptyEvidenceOwners: [],
			warnings: [],
		},
		trustBandCounts: {
			structuralFact: 1,
			deterministicInference: 1,
			contextualHint: 1,
			lowConfidence: 0,
		},
	},
};

const REVIEW_SUMMARY_TWO_FILES: PrReviewSummary = {
	...REVIEW_SUMMARY_FIXTURE,
	queue: [
		REVIEW_SUMMARY_FIXTURE.queue[0],
		{
			...REVIEW_SUMMARY_FIXTURE.queue[0],
			filename: "apps/n1/package.json",
			priority: "review_next",
			reasons: [
				{
					id: "reason:package",
					scope: "pr",
					message: "Review dependency metadata after the config change.",
					trustBand: "deterministic_inference",
					ruleId: "priority:metadata",
					evidence: [],
				},
			],
		},
	],
};

const ok = <T,>(data: T): PrDiffResult<T> => ({ ok: true, data });

const createClient = () => ({
	getPrSummary: vi.fn(async () => ok(SUMMARY_FIXTURE)),
	getPrReviewSummary: vi.fn(async () => ok(REVIEW_SUMMARY_FIXTURE)),
	getFileDiff: vi.fn(async () => ok(DIFF_FIXTURE)),
	getFileReviewGuide: vi.fn(async () => ok(REVIEW_GUIDE_FIXTURE)),
});

const createTwoFileClient = () => ({
	getPrSummary: vi.fn(async () => ok(SUMMARY_TWO_FILES)),
	getPrReviewSummary: vi.fn(async () => ok(REVIEW_SUMMARY_TWO_FILES)),
	getFileDiff: vi.fn(async (input: { filename: string }) =>
		ok({
			...DIFF_FIXTURE,
			file: { ...DIFF_FIXTURE.file, filename: input.filename },
		}),
	),
	getFileReviewGuide: vi.fn(async (input: { filename: string }) =>
		ok({
			...REVIEW_GUIDE_FIXTURE,
			filename: input.filename,
			summary: `Review ${input.filename} carefully.`,
		}),
	),
});

const REVIEW_CARD_TEXT = /Review changes with/i;
const PACKAGE_FILE_BUTTON_TEXT = /apps\/n1\/package\.json/i;

afterEach(() => {
	cleanup();
});

describe("SemaDiffExplorer controls", () => {
	test("does not render removed controls", async () => {
		const client = createClient();

		render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() => expect(client.getPrSummary).toHaveBeenCalledTimes(1));

		expect(screen.queryByRole("button", { name: "Ops" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Lines" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Prev" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
	});

	test("keeps core diff controls visible", async () => {
		const client = createClient();

		render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() => expect(client.getPrSummary).toHaveBeenCalledTimes(1));

		expect(screen.getAllByRole("button", { name: "Recompute" }).length).toBe(1);
		expect(screen.getAllByRole("button", { name: "Unified" }).length).toBe(1);
		expect(screen.getAllByRole("button", { name: "Split" }).length).toBe(1);
		expect(screen.getAllByRole("button", { name: "Show" }).length).toBe(1);
		expect(screen.getAllByRole("button", { name: "Hide" }).length).toBe(1);
	});

	test("renders file filter input in dedicated full-width search row", async () => {
		const client = createClient();

		const { container } = render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() => expect(client.getPrSummary).toHaveBeenCalledTimes(1));

		const fileFilter = screen.getByPlaceholderText("Filter files");
		expect(fileFilter.className).toContain("sd-input--search");
		const searchRow = container.querySelector(
			".sd-panel-header-actions--search",
		);
		expect(searchRow).not.toBeNull();
	});

	test("does not render the legacy reduction card above iframe", async () => {
		const client = createClient();

		render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() => expect(client.getFileDiff).toHaveBeenCalledTimes(1));

		expect(screen.getByTitle("diff-apps/n1/next.config.ts")).toBeDefined();
		expect(screen.queryByText(REVIEW_CARD_TEXT)).toBeNull();
	});

	test("renders the review queue and selected-file guide", async () => {
		const client = createClient();

		render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() =>
			expect(client.getPrReviewSummary).toHaveBeenCalledTimes(1),
		);
		await waitFor(() =>
			expect(client.getFileReviewGuide).toHaveBeenCalledTimes(1),
		);

		expect(screen.getByText("Review Queue")).toBeDefined();
		expect(
			screen.getByText(
				"Start with the files carrying the highest review weight.",
			),
		).toBeDefined();
		expect(screen.getByText("File Guide")).toBeDefined();
		expect(screen.getByText("Why this file matters")).toBeDefined();
		expect(screen.getByText("Diagnostics")).toBeDefined();
	});

	test("emits selected file changes for URL persistence", async () => {
		const client = createTwoFileClient();
		const onSelectedFileChange = vi.fn();

		render(
			<SemaDiffExplorer
				client={client}
				contextLines={-1}
				onSelectedFileChange={onSelectedFileChange}
				prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
			/>,
		);

		await waitFor(() =>
			expect(onSelectedFileChange).toHaveBeenCalledWith(
				"apps/n1/next.config.ts",
			),
		);

		const packageButtons = screen.getAllByRole("button", {
			name: PACKAGE_FILE_BUTTON_TEXT,
		});
		const packageFileRow = packageButtons.find((button) =>
			button.className.includes("sd-file-row"),
		);
		packageFileRow?.click();

		await waitFor(() =>
			expect(onSelectedFileChange).toHaveBeenLastCalledWith(
				"apps/n1/package.json",
			),
		);
	});
});

describe("ChangeTotals", () => {
	test("renders additions in green and deletions in red", () => {
		render(<ChangeTotals additions={12} deletions={3} />);

		const totals = screen.getByTestId("change-totals");
		expect(within(totals).getByText("+12").className).toContain(
			"sd-count--add",
		);
		expect(within(totals).getByText("-3").className).toContain("sd-count--del");
	});
});

describe("Diff auto-focus", () => {
	test("finds the first changed line in document order", () => {
		const doc = document.implementation.createHTMLDocument("diff");
		doc.body.innerHTML = `
      <div class="sd-line sd-line--equal"></div>
      <div class="sd-line sd-line--delete"></div>
      <div class="sd-line sd-line--insert"></div>
    `;

		const first = findFirstChangedLine(doc);
		expect(first?.className).toContain("sd-line--delete");
	});

	test("scrolls the first changed line into view", () => {
		const doc = document.implementation.createHTMLDocument("diff");
		doc.body.innerHTML = `
      <div class="sd-line sd-line--equal"></div>
      <div class="sd-line sd-line--replace"></div>
    `;
		const first = doc.querySelector(".sd-line--replace") as HTMLElement;
		const spy = vi.fn();
		first.scrollIntoView = spy;

		const didScroll = scrollDiffDocumentToFirstChange(doc);
		expect(didScroll).toBe(true);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test("focusFirstDiffChange returns false when iframe is missing", () => {
		expect(focusFirstDiffChange(null)).toBe(false);
	});
});
