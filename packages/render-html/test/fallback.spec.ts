import { describe, expect, test } from "vitest";

import { __testing } from "../src/index";

describe("chooseSemanticRowsWithFallback", () => {
	test("falls back to raw rows when semantic rows hide inflation behind replace grouping", () => {
		const semanticRows = [
			{
				type: "replace" as const,
				oldLine: 1,
				newLine: 1,
				oldText: "const a = 1;",
				newText: "const alpha = 1;",
			},
			{
				type: "replace" as const,
				oldLine: 2,
				newLine: 2,
				oldText: "const b = 2;",
				newText: "const beta = 2;",
			},
			{
				type: "replace" as const,
				oldLine: 3,
				newLine: 3,
				oldText: "const c = 3;",
				newText: "const gamma = 3;",
			},
			{
				type: "replace" as const,
				oldLine: 4,
				newLine: 4,
				oldText: "const d = 4;",
				newText: "const delta = 4;",
			},
			{
				type: "replace" as const,
				oldLine: 5,
				newLine: 5,
				oldText: "const e = 5;",
				newText: "const epsilon = 5;",
			},
		];
		const rawRows = [
			{
				type: "delete" as const,
				oldLine: 2,
				newLine: null,
				text: "const b = 2;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 2,
				text: "const beta = 2;",
			},
			{
				type: "delete" as const,
				oldLine: 3,
				newLine: null,
				text: "const c = 3;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 3,
				text: "const gamma = 3;",
			},
			{
				type: "delete" as const,
				oldLine: 4,
				newLine: null,
				text: "const d = 4;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 4,
				text: "const delta = 4;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 5,
				text: "const epsilon = 5;",
			},
		];

		const chosen = __testing.chooseSemanticRowsWithFallback(
			semanticRows,
			rawRows,
			(line) => line,
		);

		expect(chosen).toBe(rawRows);
		expect(__testing.countChangedLineVolume(semanticRows)).toBe(10);
		expect(__testing.countChangedLineVolume(rawRows)).toBe(7);
	});

	test("keeps semantic rows when they materially reduce changed-line volume", () => {
		const semanticRows = [
			{
				type: "replace" as const,
				oldLine: 10,
				newLine: 10,
				oldText: "const mode = 'old';",
				newText: 'const mode = "new";',
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 20,
				text: "const inserted = true;",
			},
		];
		const rawRows = [
			{
				type: "replace" as const,
				oldLine: 10,
				newLine: 10,
				oldText: "const mode = 'old';",
				newText: 'const mode = "new";',
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 16,
				text: "const keep2 = 2;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 17,
				text: "const keep3 = 3;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 20,
				text: "const inserted = true;",
			},
		];

		const chosen = __testing.chooseSemanticRowsWithFallback(
			semanticRows,
			rawRows,
			(line) => line,
		);

		expect(chosen).toBe(semanticRows);
		expect(__testing.countChangedLineVolume(semanticRows)).toBe(3);
		expect(__testing.countChangedLineVolume(rawRows)).toBe(5);
	});
});

describe("line-view heuristics", () => {
	const makeInsertRows = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			type: "insert" as const,
			oldLine: null,
			newLine: index + 1,
			text: `const line${index + 1} = ${index + 1};`,
		}));

	test("prefers rows by line impact only when the delta and ratio thresholds are exceeded", () => {
		expect(
			__testing.shouldPreferRowsByLineImpact(
				makeInsertRows(4),
				makeInsertRows(4),
			),
		).toBe(false);
		expect(
			__testing.shouldPreferRowsByLineImpact(
				makeInsertRows(4),
				makeInsertRows(6),
			),
		).toBe(false);
		expect(
			__testing.shouldPreferRowsByLineImpact(
				makeInsertRows(4),
				makeInsertRows(8),
			),
		).toBe(true);
	});

	test("prefers operation-anchored rows only for large diff volumes within the ratio budget", () => {
		expect(
			__testing.shouldPreferOperationAnchoredRows([], makeInsertRows(50)),
		).toBe(false);
		expect(
			__testing.shouldPreferOperationAnchoredRows(
				makeInsertRows(30),
				makeInsertRows(39),
			),
		).toBe(false);
		expect(
			__testing.shouldPreferOperationAnchoredRows(
				makeInsertRows(40),
				makeInsertRows(50),
			),
		).toBe(true);
		expect(
			__testing.shouldPreferOperationAnchoredRows(
				makeInsertRows(61),
				makeInsertRows(50),
			),
		).toBe(false);
	});

	test("filters low-information semantic rows unless preservation is requested", () => {
		const rows = [
			{ type: "gap" as const, oldLine: null, newLine: null, text: "..." },
			{ type: "hunk" as const, oldLine: null, newLine: null, text: "@@" },
			{
				type: "replace" as const,
				oldLine: 1,
				newLine: 1,
				oldText: "const value = 'old';",
				newText: 'const value = "old";',
			},
			{
				type: "replace" as const,
				oldLine: 2,
				newLine: 2,
				oldText: "const value = 1;",
				newText: "const result = 2;",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 3,
				text: "}",
			},
			{
				type: "delete" as const,
				oldLine: 4,
				newLine: null,
				text: "{",
			},
			{
				type: "move" as const,
				oldLine: 5,
				newLine: 8,
				text: "const moved = true;",
			},
		];

		const normalize = (line: string) =>
			line.replaceAll("'", '"').replaceAll("value", "result");

		expect(__testing.filterSemanticRows(rows, normalize)).toEqual([
			rows[3],
			rows[6],
		]);
		expect(__testing.filterSemanticRows(rows, normalize, true)).toEqual([
			rows[3],
			rows[4],
			rows[5],
			rows[6],
		]);
	});

	test("filters lockfile header churn while keeping package entries", () => {
		const rows = [
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 1,
				text: "dependencies:",
			},
			{
				type: "delete" as const,
				oldLine: 2,
				newLine: null,
				text: "peerDependencies:",
			},
			{
				type: "insert" as const,
				oldLine: null,
				newLine: 3,
				text: "react:",
			},
		];

		expect(__testing.filterLockfileRows(rows)).toEqual([rows[2]]);
	});

	test("projects AST-matched inserts back into equal rows while preserving anchors", () => {
		const emptyMarks = {
			changedOld: new Set<number>(),
			changedNew: new Set<number>(),
			movedOld: new Set<number>(),
			movedNew: new Set<number>(),
		};

		expect(
			__testing.filterAstProjectedRows(
				[
					{
						type: "delete",
						oldLine: 2,
						newLine: null,
						text: "foo();",
					},
					{
						type: "insert",
						oldLine: null,
						newLine: 2,
						text: "foo();",
					},
				],
				emptyMarks,
				new Map([[2, ["foo"]]]),
				new Map([[2, ["foo"]]]),
			),
		).toEqual([
			{
				type: "equal",
				oldLine: null,
				newLine: 2,
				text: "foo();",
			},
		]);

		expect(
			__testing.filterAstProjectedRows(
				[
					{
						type: "delete",
						oldLine: 3,
						newLine: null,
						text: "return foo;",
					},
					{
						type: "insert",
						oldLine: null,
						newLine: 3,
						text: "items: {",
					},
				],
				emptyMarks,
				new Map([[3, ["foo"]]]),
				new Map([[3, ["items"]]]),
			),
		).toEqual([
			{
				type: "insert",
				oldLine: null,
				newLine: 3,
				text: "items: {",
			},
			{
				type: "delete",
				oldLine: 3,
				newLine: null,
				text: "return foo;",
			},
		]);

		expect(
			__testing.filterAstProjectedRows(
				[
					{
						type: "delete",
						oldLine: 4,
						newLine: null,
						text: "bar();",
					},
					{
						type: "gap",
						oldLine: null,
						newLine: null,
						text: "...",
					},
				],
				{
					...emptyMarks,
					changedOld: new Set([4]),
				},
				new Map([[4, ["bar"]]]),
				new Map(),
			),
		).toEqual([
			{
				type: "delete",
				oldLine: 4,
				newLine: null,
				text: "bar();",
			},
			{
				type: "gap",
				oldLine: null,
				newLine: null,
				text: "...",
			},
		]);
	});

	test("can expand discontinuities with or without synthesized changed rows", () => {
		const changedGapRows = [
			{ type: "equal" as const, oldLine: 1, newLine: 1, text: "keep" },
			{ type: "equal" as const, oldLine: 3, newLine: 3, text: "tail" },
		];
		const deleteGapRows = [
			{ type: "equal" as const, oldLine: 1, newLine: 1, text: "keep" },
			{ type: "equal" as const, oldLine: 3, newLine: 2, text: "tail" },
		];
		const insertGapRows = [
			{ type: "equal" as const, oldLine: 1, newLine: 1, text: "keep" },
			{ type: "equal" as const, oldLine: 2, newLine: 3, text: "tail" },
		];

		expect(
			__testing.expandLineDiscontinuities(
				changedGapRows,
				["keep", "before", "tail"].join("\n"),
				["keep", "after", "tail"].join("\n"),
				false,
			),
		).toEqual(changedGapRows);
		expect(
			__testing.expandLineDiscontinuities(
				changedGapRows,
				["keep", "before", "tail"].join("\n"),
				["keep", "after", "tail"].join("\n"),
				true,
			),
		).toEqual([
			changedGapRows[0],
			{
				type: "replace",
				oldLine: 2,
				newLine: 2,
				oldText: "before",
				newText: "after",
			},
			changedGapRows[1],
		]);

		expect(
			__testing.expandLineDiscontinuities(
				deleteGapRows,
				["keep", "removed", "tail"].join("\n"),
				["keep", "tail"].join("\n"),
				true,
			),
		).toEqual([
			deleteGapRows[0],
			{
				type: "delete",
				oldLine: 2,
				newLine: null,
				text: "removed",
			},
			deleteGapRows[1],
		]);

		expect(
			__testing.expandLineDiscontinuities(
				insertGapRows,
				["keep", "tail"].join("\n"),
				["keep", "added", "tail"].join("\n"),
				true,
			),
		).toEqual([
			insertGapRows[0],
			{
				type: "insert",
				oldLine: null,
				newLine: 2,
				text: "added",
			},
			insertGapRows[1],
		]);
	});

	test("can synthesize equal, changed, deleted, and inserted context rows", () => {
		expect(
			__testing.buildSyntheticContextRow(1, 1, ["same"], ["same"], true),
		).toEqual({
			type: "equal",
			oldLine: 1,
			newLine: 1,
			text: "same",
		});
		expect(
			__testing.buildSyntheticContextRow(1, 1, ["before"], ["after"], false),
		).toBeNull();
		expect(
			__testing.buildSyntheticContextRow(1, 1, ["before"], ["after"], true),
		).toEqual({
			type: "replace",
			oldLine: 1,
			newLine: 1,
			oldText: "before",
			newText: "after",
		});
		expect(
			__testing.buildSyntheticContextRow(1, null, ["removed"], [], true),
		).toEqual({
			type: "delete",
			oldLine: 1,
			newLine: null,
			text: "removed",
		});
		expect(
			__testing.buildSyntheticContextRow(null, 1, [], ["added"], true),
		).toEqual({
			type: "insert",
			oldLine: null,
			newLine: 1,
			text: "added",
		});
		expect(
			__testing.buildSyntheticContextRow(null, null, [], [], true),
		).toBeNull();
	});
});

describe("buildOperationAnchoredRows", () => {
	const identity = (line: string) => line;
	const range = (startLine: number, endLine: number) => ({
		start: { line: startLine, column: 1 },
		end: { line: endLine, column: 1 },
	});

	test("preserves equal gaps before insert-only operations", () => {
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

		const rows = __testing.buildOperationAnchoredRows(
			oldText,
			newText,
			-1,
			"split",
			identity,
			[
				{
					id: "op-1",
					type: "update" as const,
					oldRange: range(3, 3),
					newRange: range(3, 3),
					oldText: "const mode = 'old';",
					newText: 'const mode = "new";',
				},
				{
					id: "op-2",
					type: "insert" as const,
					newRange: range(6, 7),
					newText: ["const insertA = 5;", "const insertB = 6;"].join("\n"),
				},
			],
		);

		expect(rows).not.toBeNull();
		expect(
			rows?.some(
				(row) =>
					row.type === "equal" &&
					row.oldLine === 4 &&
					row.newLine === 4 &&
					row.text === "const keep2 = 2;",
			),
		).toBe(true);
		expect(
			rows?.some(
				(row) =>
					row.type === "equal" &&
					row.oldLine === 5 &&
					row.newLine === 5 &&
					row.text === "const keep3 = 3;",
			),
		).toBe(true);
		expect(
			rows?.some(
				(row) => row.type === "insert" && row.text === "const keep2 = 2;",
			),
		).toBe(false);
		expect(
			rows?.some(
				(row) => row.type === "insert" && row.text === "const keep3 = 3;",
			),
		).toBe(false);
	});

	test("bridges coarse update start gaps into equal and inserted prefix rows", () => {
		const oldText = [
			"const keep0 = 0;",
			"const keep1 = 1;",
			"const mode = 'old';",
			"const tail = 4;",
		].join("\n");
		const newText = [
			"const keep0 = 0;",
			"const keep1 = 1;",
			"const insertedA = 5;",
			"const insertedB = 6;",
			'const mode = "new";',
			"const tail = 4;",
		].join("\n");

		const rows = __testing.buildOperationAnchoredRows(
			oldText,
			newText,
			-1,
			"split",
			identity,
			[
				{
					id: "op-1",
					type: "update" as const,
					oldRange: range(3, 3),
					newRange: range(5, 5),
					oldText: "const mode = 'old';",
					newText: 'const mode = "new";',
				},
			],
		);

		expect(rows).not.toBeNull();
		expect(
			rows?.some(
				(row) =>
					row.type === "equal" &&
					row.oldLine === 2 &&
					row.newLine === 2 &&
					row.text === "const keep1 = 1;",
			),
		).toBe(true);
		expect(
			rows?.filter(
				(row) =>
					row.type === "insert" &&
					(row.text === "const insertedA = 5;" ||
						row.text === "const insertedB = 6;"),
			),
		).toHaveLength(2);
	});

	test("preserves equal gaps before delete-only operations", () => {
		const oldText = [
			"const before = 0;",
			"const keep1 = 1;",
			"const mode = 'old';",
			"const keep2 = 2;",
			"const keep3 = 3;",
			"const dropA = 5;",
			"const dropB = 6;",
			"const tail = 4;",
		].join("\n");
		const newText = [
			"const before = 0;",
			"const keep1 = 1;",
			'const mode = "new";',
			"const keep2 = 2;",
			"const keep3 = 3;",
			"const tail = 4;",
		].join("\n");

		const rows = __testing.buildOperationAnchoredRows(
			oldText,
			newText,
			-1,
			"split",
			identity,
			[
				{
					id: "op-1",
					type: "update" as const,
					oldRange: range(3, 3),
					newRange: range(3, 3),
					oldText: "const mode = 'old';",
					newText: 'const mode = "new";',
				},
				{
					id: "op-2",
					type: "delete" as const,
					oldRange: range(6, 7),
					oldText: ["const dropA = 5;", "const dropB = 6;"].join("\n"),
				},
			],
		);

		expect(rows).not.toBeNull();
		expect(
			rows?.some(
				(row) =>
					row.type === "equal" &&
					row.oldLine === 4 &&
					row.newLine === 4 &&
					row.text === "const keep2 = 2;",
			),
		).toBe(true);
		expect(
			rows?.some(
				(row) =>
					row.type === "equal" &&
					row.oldLine === 5 &&
					row.newLine === 5 &&
					row.text === "const keep3 = 3;",
			),
		).toBe(true);
		expect(
			rows?.some(
				(row) => row.type === "delete" && row.text === "const keep2 = 2;",
			),
		).toBe(false);
		expect(
			rows?.some(
				(row) => row.type === "delete" && row.text === "const keep3 = 3;",
			),
		).toBe(false);
	});
});
