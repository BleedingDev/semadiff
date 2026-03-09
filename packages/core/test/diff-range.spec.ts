import { describe, expect, test } from "vitest";

import {
	buildLineOffsets,
	EMPTY_RANGE,
	offsetToPosition,
	positionToOffset,
	rangeForText,
	sliceTextByRange,
} from "../src/diff-range.js";

describe("diff range helpers", () => {
	test("computes full-text ranges for empty and multi-line text", () => {
		expect(rangeForText("")).toBe(EMPTY_RANGE);
		expect(rangeForText("first\nsecond\n")).toEqual({
			start: { line: 1, column: 1 },
			end: { line: 3, column: 1 },
		});
	});

	test("builds line offsets for each newline boundary", () => {
		expect(buildLineOffsets("first\nsecond\nthird")).toEqual([0, 6, 13]);
	});

	test("clamps positions into valid text offsets", () => {
		const text = "first\nsecond";
		const offsets = buildLineOffsets(text);

		expect(positionToOffset({ line: 1, column: 1 }, offsets, text.length)).toBe(
			0,
		);
		expect(positionToOffset({ line: 2, column: 3 }, offsets, text.length)).toBe(
			8,
		);
		expect(
			positionToOffset({ line: 99, column: 99 }, offsets, text.length),
		).toBe(text.length);
		expect(positionToOffset({ line: 0, column: 0 }, offsets, text.length)).toBe(
			0,
		);
	});

	test("slices text by ranges and rejects empty spans", () => {
		const text = "first\nsecond\nthird";

		expect(sliceTextByRange(text, undefined)).toBe("");
		expect(
			sliceTextByRange(text, {
				start: { line: 2, column: 1 },
				end: { line: 3, column: 1 },
			}),
		).toBe("second\n");
		expect(
			sliceTextByRange(text, {
				start: { line: 2, column: 3 },
				end: { line: 2, column: 3 },
			}),
		).toBe("");
	});

	test("maps offsets back to positions across empty, in-range, and trailing cases", () => {
		const offsets = buildLineOffsets("first\nsecond\nthird");

		expect(offsetToPosition(2, [])).toEqual({ line: 1, column: 3 });
		expect(offsetToPosition(0, offsets)).toEqual({ line: 1, column: 1 });
		expect(offsetToPosition(7, offsets)).toEqual({ line: 2, column: 2 });
		expect(offsetToPosition(99, offsets)).toEqual({ line: 3, column: 87 });
	});
});
