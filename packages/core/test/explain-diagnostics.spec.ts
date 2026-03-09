import { describe, expect, it } from "vitest";

import {
	createDiagnosticsBundle,
	defaultConfig,
	explainDiff,
	structuralDiff,
} from "../src/index";

describe("explainDiff", () => {
	it("preserves move metadata and rationale from structural diffs", () => {
		const explained = explainDiff({
			version: "0.1.0",
			operations: [
				{
					id: "move-1",
					type: "move",
					oldRange: {
						start: { line: 1, column: 1 },
						end: { line: 4, column: 1 },
					},
					newRange: {
						start: { line: 5, column: 1 },
						end: { line: 8, column: 1 },
					},
					oldText: "export function moved() {\n  return value;\n}",
					newText: "export function moved() {\n  return value + 1;\n}",
					meta: { confidence: 0.91, moveId: "move-1" },
				},
				{
					id: "op-2",
					type: "update",
					oldRange: {
						start: { line: 2, column: 1 },
						end: { line: 2, column: 1 },
					},
					newRange: {
						start: { line: 6, column: 1 },
						end: { line: 6, column: 1 },
					},
					oldText: "  return value;",
					newText: "  return value + 1;",
					meta: { moveId: "move-1", confidence: 0.91 },
				},
			],
			moves: [
				{
					id: "move-1",
					oldRange: {
						start: { line: 1, column: 1 },
						end: { line: 4, column: 1 },
					},
					newRange: {
						start: { line: 5, column: 1 },
						end: { line: 8, column: 1 },
					},
					confidence: 0.91,
					operations: ["move-1", "op-2"],
				},
			],
			renames: [],
		});

		expect(
			explained.operations.some((operation) => operation.type === "move"),
		).toBe(true);
		expect(
			explained.operations.some((operation) => operation.moveId === "move-1"),
		).toBe(true);
		expect(explained.moves).toEqual([
			expect.objectContaining({
				id: "move-1",
				rationale: expect.stringContaining("operations"),
			}),
		]);
	});

	it("preserves rename metadata and rename rationale", () => {
		const diff = structuralDiff(
			[
				"export function compute(foo: number) {",
				"  return foo + foo;",
				"}",
			].join("\n"),
			[
				"export function compute(bar: number) {",
				"  return bar + bar;",
				"}",
			].join("\n"),
			{ language: "ts" },
		);

		const explained = explainDiff(diff);

		expect(explained.operations[0]).toEqual(
			expect.objectContaining({
				type: "update",
				renameGroupId: diff.renames[0]?.id,
				rationale: expect.stringContaining("Operation update"),
			}),
		);
		expect(explained.renames).toEqual([
			expect.objectContaining({
				from: "foo",
				to: "bar",
				occurrences: 3,
				rationale: expect.stringContaining("3 times"),
			}),
		]);
	});
});

describe("createDiagnosticsBundle", () => {
	it("redacts diff text by default while preserving counts and config", () => {
		const diff = structuralDiff(
			[
				"export const value = 1;",
				"export function read() {",
				"  return value;",
				"}",
			].join("\n"),
			[
				"export const result = 2;",
				"export function read() {",
				"  return result;",
				"}",
			].join("\n"),
			{ language: "ts" },
		);

		const bundle = createDiagnosticsBundle({
			diff,
			config: defaultConfig,
		});

		expect(bundle.redacted).toBe(true);
		expect(bundle.summary).toEqual({
			operationCount: diff.operations.length,
			moveCount: diff.moves.length,
			renameCount: diff.renames.length,
		});
		expect(bundle.config).toBe(defaultConfig);
		expect(bundle.diff?.operations).toEqual(
			diff.operations.map(
				({ oldText: _oldText, newText: _newText, ...rest }) => rest,
			),
		);
	});

	it("keeps source text when includeCode is enabled", () => {
		const diff = structuralDiff(
			"export const value = 1;",
			"export const value = 2;",
			{ language: "ts" },
		);

		const bundle = createDiagnosticsBundle({
			diff,
			includeCode: true,
		});

		expect(bundle.redacted).toBe(false);
		expect(bundle.diff).toBe(diff);
		expect(bundle.diff?.operations[0]).toEqual(
			expect.objectContaining({
				oldText: "1",
				newText: "2",
			}),
		);
	});
});
