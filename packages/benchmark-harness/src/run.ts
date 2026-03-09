import { performance } from "node:perf_hooks";

import type { MoveGroup, Range, RenameGroup } from "@semadiff/core";
import { structuralDiff } from "@semadiff/core";
import {
	buildEntityDocumentFromSources,
	type EntityChange,
	type SemanticEntity,
	supportsEntityLanguage,
} from "@semadiff/entity-core";
import { swcParser } from "@semadiff/parser-swc";
import { renderHtml } from "@semadiff/render-html";
import { Effect } from "effect";

import type {
	BenchmarkCase,
	BenchmarkCaseEvaluation,
	BenchmarkCaseFile,
	BenchmarkCaseReport,
	BenchmarkEntityChangeTruth,
	BenchmarkEntityScore,
	BenchmarkEntityTruth,
	BenchmarkLineRange,
	BenchmarkMoveTruth,
	BenchmarkOperationTruth,
	BenchmarkRenameTruth,
	BenchmarkReport,
	BenchmarkReportSummary,
	BenchmarkReviewRow,
	BenchmarkReviewScore,
	BenchmarkToolResult,
	BenchmarkUnsupportedLane,
	ProjectedDiffOperation,
	ProjectedEntity,
	ProjectedEntityChange,
	ProjectedMove,
	ProjectedRename,
	SemadiffBenchmarkResult,
} from "./types.js";

const TOOL_VERSION = "0.1.0";
const LINE_PAYLOAD_MARKER = "globalThis.__SEMADIFF_DATA__ = ";
const LINE_SPLIT_RE = /\r?\n/;

function roundNumber(value: number) {
	return Number(value.toFixed(3));
}

function toLineRange(
	range: Range | undefined,
	maxLine: number,
): BenchmarkLineRange | undefined {
	if (!(range && maxLine > 0)) {
		return undefined;
	}
	const startLine = Math.max(1, Math.min(maxLine, range.start.line));
	let endLine = Math.max(1, Math.min(maxLine, range.end.line));
	if (
		range.end.column <= 1 &&
		range.end.line <= maxLine &&
		endLine > startLine
	) {
		endLine -= 1;
	}
	return {
		startLine,
		endLine,
	};
}

function projectOperations(
	fileId: string,
	oldMaxLine: number,
	newMaxLine: number,
	operations: readonly {
		type: ProjectedDiffOperation["type"];
		oldRange?: Range | undefined;
		newRange?: Range | undefined;
		meta?:
			| {
					moveId?: string | undefined;
					renameGroupId?: string | undefined;
			  }
			| undefined;
	}[],
) {
	return operations.map(
		(operation): ProjectedDiffOperation => ({
			fileId,
			type: operation.type,
			...(toLineRange(operation.oldRange, oldMaxLine)
				? { oldRange: toLineRange(operation.oldRange, oldMaxLine) }
				: {}),
			...(toLineRange(operation.newRange, newMaxLine)
				? { newRange: toLineRange(operation.newRange, newMaxLine) }
				: {}),
			...(operation.meta?.moveId ? { moveId: operation.meta.moveId } : {}),
			...(operation.meta?.renameGroupId
				? { renameGroupId: operation.meta.renameGroupId }
				: {}),
		}),
	);
}

function projectMoves(
	fileId: string,
	oldMaxLine: number,
	newMaxLine: number,
	moves: readonly MoveGroup[],
) {
	return moves.map(
		(move): ProjectedMove => ({
			fileId,
			oldRange: toLineRange(move.oldRange, oldMaxLine) ?? {
				startLine: 1,
				endLine: 1,
			},
			newRange: toLineRange(move.newRange, newMaxLine) ?? {
				startLine: 1,
				endLine: 1,
			},
			confidence: roundNumber(move.confidence),
			operationIds: move.operations.slice(),
		}),
	);
}

function projectRenames(renames: readonly RenameGroup[]) {
	return renames.map(
		(rename): ProjectedRename => ({
			from: rename.from,
			to: rename.to,
			occurrences: rename.occurrences,
			confidence: roundNumber(rename.confidence),
		}),
	);
}

function projectEntityRange(entity: SemanticEntity): BenchmarkLineRange {
	return {
		startLine: entity.range.start.line,
		endLine: entity.range.end.line,
	};
}

function resolveEntityFileId(
	benchmarkCase: BenchmarkCase,
	side: "old" | "new",
	entity: { path?: string | undefined },
) {
	const byPath = benchmarkCase.files.find((file) =>
		side === "old"
			? file.oldPath === entity.path
			: file.newPath === entity.path,
	);
	return byPath?.id ?? benchmarkCase.files[0]?.id ?? "file-1";
}

function projectEntity(
	benchmarkCase: BenchmarkCase,
	side: "old" | "new",
	entity: SemanticEntity,
): ProjectedEntity {
	return {
		id: entity.id,
		fileId: resolveEntityFileId(benchmarkCase, side, entity),
		kind: entity.kind,
		name: entity.name,
		range: projectEntityRange(entity),
		...(entity.parentName ? { parentName: entity.parentName } : {}),
		...(entity.path ? { path: entity.path } : {}),
		exported: entity.exported,
	};
}

function projectEntityChange(
	benchmarkCase: BenchmarkCase,
	change: EntityChange,
): ProjectedEntityChange {
	return {
		id: change.id,
		kind: change.kind,
		...(change.before
			? { before: projectEntity(benchmarkCase, "old", change.before) }
			: {}),
		...(change.after
			? { after: projectEntity(benchmarkCase, "new", change.after) }
			: {}),
		changeKinds: change.changeKinds,
		confidence: roundNumber(change.confidence),
		linkedOperationIds: change.linkedOperationIds,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalString(value: unknown) {
	return typeof value === "string" ? value : undefined;
}

export function extractLinePayloadFromHtml(html: string) {
	const start = html.indexOf(LINE_PAYLOAD_MARKER);
	if (start === -1) {
		return {
			rows: [] as BenchmarkReviewRow[],
			lineLayout: "split" as const,
		};
	}
	const from = start + LINE_PAYLOAD_MARKER.length;
	const end = html.indexOf(";</script>", from);
	if (end === -1) {
		return {
			rows: [] as BenchmarkReviewRow[],
			lineLayout: "split" as const,
		};
	}
	const rawPayload = html.slice(from, end).trim();
	if (!rawPayload) {
		return {
			rows: [] as BenchmarkReviewRow[],
			lineLayout: "split" as const,
		};
	}
	const parsed = JSON.parse(rawPayload) as unknown;
	if (!(isRecord(parsed) && Array.isArray(parsed.rows))) {
		return {
			rows: [] as BenchmarkReviewRow[],
			lineLayout: "split" as const,
		};
	}
	const lineLayout = parsed.lineLayout === "unified" ? "unified" : "split";
	const rows = parsed.rows.flatMap((value) => {
		if (!isRecord(value)) {
			return [];
		}
		const type = value.type;
		if (
			type !== "equal" &&
			type !== "insert" &&
			type !== "delete" &&
			type !== "replace" &&
			type !== "gap" &&
			type !== "hunk" &&
			type !== "move"
		) {
			return [];
		}
		return [
			{
				fileId: "",
				type,
				oldLine: asNullableNumber(value.oldLine),
				newLine: asNullableNumber(value.newLine),
				text: asOptionalString(value.text),
				hidden:
					typeof value.hidden === "number" && Number.isFinite(value.hidden)
						? value.hidden
						: undefined,
				oldText: asOptionalString(value.oldText),
				newText: asOptionalString(value.newText),
				header: asOptionalString(value.header),
			} satisfies BenchmarkReviewRow,
		];
	});
	return { rows, lineLayout };
}

function buildReviewRows(file: BenchmarkCaseFile) {
	const diff = structuralDiff(file.before, file.after, {
		language: file.language,
		detectMoves: true,
	});
	const html = renderHtml(diff, {
		oldText: file.before,
		newText: file.after,
		language: file.language,
		view: "lines",
		lineMode: "semantic",
		lineLayout: "split",
		contextLines: 0,
		virtualize: true,
		showBanner: false,
		showSummary: false,
		showFilePath: false,
		layout: "embed",
	});
	const payload = extractLinePayloadFromHtml(html);
	return {
		diff,
		reviewRows: payload.rows.map((row) => ({ ...row, fileId: file.id })),
	};
}

function parseRootIfSupported(file: BenchmarkCaseFile, text: string) {
	if (!supportsEntityLanguage(file.language)) {
		return undefined;
	}
	return Effect.runSync(
		swcParser.parse({
			content: text,
			language: file.language,
		}),
	).root;
}

function buildEntityOutput(
	benchmarkCase: BenchmarkCase,
	diffsByFileId: ReadonlyMap<string, ReturnType<typeof structuralDiff>>,
) {
	const entityCompatibleFiles = benchmarkCase.files.filter((file) =>
		supportsEntityLanguage(file.language),
	);
	const entitySupported = entityCompatibleFiles.length > 0;
	const entityDocument = entitySupported
		? buildEntityDocumentFromSources({
				sources: entityCompatibleFiles.map((file) => ({
					oldText: file.before,
					newText: file.after,
					language: file.language,
					oldRoot: parseRootIfSupported(file, file.before),
					newRoot: parseRootIfSupported(file, file.after),
					...(file.oldPath ? { oldPath: file.oldPath } : {}),
					...(file.newPath ? { newPath: file.newPath } : {}),
					diff: diffsByFileId.get(file.id),
				})),
			})
		: undefined;

	return {
		entitySupported,
		entities: {
			old:
				entityDocument?.old.map((entity) =>
					projectEntity(benchmarkCase, "old", entity),
				) ?? [],
			new:
				entityDocument?.new.map((entity) =>
					projectEntity(benchmarkCase, "new", entity),
				) ?? [],
		},
		entityChanges:
			entityDocument?.changes.map((change) =>
				projectEntityChange(benchmarkCase, change),
			) ?? [],
	};
}

export function runSemadiffCase(
	benchmarkCase: BenchmarkCase,
): SemadiffBenchmarkResult {
	let durationMs = 0;
	const operations: ProjectedDiffOperation[] = [];
	const moves: ProjectedMove[] = [];
	const renamesByKey = new Map<string, ProjectedRename>();
	const reviewRows: BenchmarkReviewRow[] = [];
	const diffsByFileId = new Map<string, ReturnType<typeof structuralDiff>>();

	for (const file of benchmarkCase.files) {
		const startedAt = performance.now();
		const { diff, reviewRows: fileRows } = buildReviewRows(file);
		const oldMaxLine = splitLines(file.before).length;
		const newMaxLine = splitLines(file.after).length;
		durationMs += performance.now() - startedAt;
		diffsByFileId.set(file.id, diff);
		operations.push(
			...projectOperations(file.id, oldMaxLine, newMaxLine, diff.operations),
		);
		moves.push(...projectMoves(file.id, oldMaxLine, newMaxLine, diff.moves));
		for (const rename of projectRenames(diff.renames)) {
			renamesByKey.set(`${rename.from}->${rename.to}`, rename);
		}
		reviewRows.push(...fileRows);
	}

	const entityOutput = buildEntityOutput(benchmarkCase, diffsByFileId);

	return {
		tool: "semadiff",
		toolVersion: TOOL_VERSION,
		caseId: benchmarkCase.id,
		capabilities: {
			review: true,
			entity: entityOutput.entitySupported,
			graph: false,
		},
		result: {
			durationMs: roundNumber(durationMs),
			operations,
			moves,
			renames: [...renamesByKey.values()],
			reviewRows,
			entities: entityOutput.entities,
			entityChanges: entityOutput.entityChanges,
		},
	};
}

function splitLines(text: string) {
	if (text.length === 0) {
		return [""];
	}
	const lines = text.split(LINE_SPLIT_RE);
	if (lines.length > 1 && lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

function lineKey(
	fileId: string,
	side: "old" | "new",
	line: number,
	text: string,
) {
	return `${fileId}:${side}:${line}:${text}`;
}

function operationFileId(
	benchmarkCase: BenchmarkCase,
	fileId: string | undefined,
): string {
	if (fileId) {
		return fileId;
	}
	return benchmarkCase.files[0]?.id ?? "file-1";
}

function addRangeKeys(
	target: Set<string>,
	fileId: string,
	side: "old" | "new",
	range: BenchmarkLineRange | undefined,
	text: string,
) {
	if (!range) {
		return;
	}
	const lines = splitLines(text);
	for (let line = range.startLine; line <= range.endLine; line += 1) {
		const content = lines[line - 1] ?? "";
		target.add(lineKey(fileId, side, line, content));
	}
}

function buildExpectedLineKeys(
	benchmarkCase: BenchmarkCase,
	operations: readonly BenchmarkOperationTruth[],
) {
	const keys = new Set<string>();
	const filesById = new Map(benchmarkCase.files.map((file) => [file.id, file]));
	for (const operation of operations) {
		const fileId = operationFileId(benchmarkCase, operation.fileId);
		const file = filesById.get(fileId);
		if (!file) {
			continue;
		}
		if (operation.type !== "insert") {
			addRangeKeys(keys, fileId, "old", operation.oldRange, file.before);
		}
		if (operation.type !== "delete") {
			addRangeKeys(keys, fileId, "new", operation.newRange, file.after);
		}
	}
	return keys;
}

function buildActualLineKeys(rows: readonly BenchmarkReviewRow[]) {
	const keys = new Set<string>();
	for (const row of rows) {
		switch (row.type) {
			case "delete": {
				if (row.oldLine != null) {
					keys.add(
						lineKey(
							row.fileId,
							"old",
							row.oldLine,
							row.oldText ?? row.text ?? "",
						),
					);
				}
				break;
			}
			case "insert": {
				if (row.newLine != null) {
					keys.add(
						lineKey(
							row.fileId,
							"new",
							row.newLine,
							row.newText ?? row.text ?? "",
						),
					);
				}
				break;
			}
			case "replace":
			case "move": {
				if (row.oldLine != null) {
					keys.add(
						lineKey(
							row.fileId,
							"old",
							row.oldLine,
							row.oldText ?? row.text ?? "",
						),
					);
				}
				if (row.newLine != null) {
					keys.add(
						lineKey(
							row.fileId,
							"new",
							row.newLine,
							row.newText ?? row.text ?? "",
						),
					);
				}
				break;
			}
			default: {
				break;
			}
		}
	}
	return keys;
}

function moveKey(fileId: string, move: BenchmarkMoveTruth | ProjectedMove) {
	return `${fileId}:${move.oldRange.startLine}-${move.oldRange.endLine}->${move.newRange.startLine}-${move.newRange.endLine}`;
}

function renameKey(rename: BenchmarkRenameTruth | ProjectedRename) {
	return `${rename.from}->${rename.to}`;
}

function entityEndpointKey(endpoint: {
	fileId?: string | undefined;
	kind: string;
	name: string;
	range: BenchmarkLineRange;
	parentName?: string | undefined;
	exported: boolean;
}) {
	return [
		endpoint.fileId ?? "",
		endpoint.kind,
		endpoint.parentName ?? "",
		endpoint.name,
		`${endpoint.range.startLine}-${endpoint.range.endLine}`,
		endpoint.exported ? "1" : "0",
	].join(":");
}

function resolvedEntityFileId(
	benchmarkCase: BenchmarkCase,
	fileId: string | undefined,
) {
	return fileId ?? benchmarkCase.files[0]?.id ?? "file-1";
}

function resolvedEntityEndpointKey(
	benchmarkCase: BenchmarkCase,
	endpoint: {
		fileId?: string | undefined;
		kind: string;
		name: string;
		range: BenchmarkLineRange;
		parentName?: string | undefined;
		exported: boolean;
	},
) {
	return entityEndpointKey({
		...endpoint,
		fileId: resolvedEntityFileId(benchmarkCase, endpoint.fileId),
	});
}

function entityKey(
	benchmarkCase: BenchmarkCase,
	entity: BenchmarkEntityTruth | (ProjectedEntity & { side: "old" | "new" }),
) {
	return `${entity.side}:${resolvedEntityEndpointKey(benchmarkCase, entity)}`;
}

function entityChangeKey(
	benchmarkCase: BenchmarkCase,
	change: BenchmarkEntityChangeTruth | ProjectedEntityChange,
) {
	return [
		change.kind,
		change.before
			? resolvedEntityEndpointKey(benchmarkCase, change.before)
			: "",
		change.after ? resolvedEntityEndpointKey(benchmarkCase, change.after) : "",
		[...change.changeKinds].sort().join("+"),
	].join("|");
}

function matchedCount(expected: Set<string>, actual: Set<string>) {
	let matches = 0;
	for (const key of expected) {
		if (actual.has(key)) {
			matches += 1;
		}
	}
	return matches;
}

function precisionScore(
	expectedSize: number,
	actualSize: number,
	matched: number,
) {
	if (actualSize === 0) {
		return expectedSize === 0 ? 1 : 0;
	}
	return roundNumber(matched / actualSize);
}

function recallScore(
	expectedSize: number,
	actualSize: number,
	matched: number,
) {
	if (expectedSize === 0) {
		return actualSize === 0 ? 1 : 0;
	}
	return roundNumber(matched / expectedSize);
}

function unsupportedLane(reason: string): BenchmarkUnsupportedLane {
	return {
		status: "unsupported",
		reason,
	};
}

function scoreReviewLane(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkToolResult,
): BenchmarkReviewScore | BenchmarkUnsupportedLane {
	if (!benchmarkCase.capabilities.review) {
		return unsupportedLane("Case does not exercise the review lane.");
	}
	if (!output.capabilities.review) {
		return unsupportedLane("Tool does not support the review lane.");
	}

	const expectedLineKeys = buildExpectedLineKeys(
		benchmarkCase,
		benchmarkCase.truth.operations,
	);
	const actualLineKeys = buildActualLineKeys(output.result.reviewRows);
	const matchedChangedLines = matchedCount(expectedLineKeys, actualLineKeys);

	const expectedMoves = new Set(
		benchmarkCase.truth.moves.map((move) =>
			moveKey(operationFileId(benchmarkCase, move.fileId), move),
		),
	);
	const actualMoves = new Set(
		output.result.moves.map((move) => moveKey(move.fileId, move)),
	);
	const matchedMoves = matchedCount(expectedMoves, actualMoves);

	const expectedRenames = new Set(
		benchmarkCase.truth.renames.map((rename) => renameKey(rename)),
	);
	const actualRenames = new Set(
		output.result.renames.map((rename) => renameKey(rename)),
	);
	const matchedRenames = matchedCount(expectedRenames, actualRenames);

	return {
		status: "scored",
		expectedChangedLines: expectedLineKeys.size,
		actualChangedLines: actualLineKeys.size,
		matchedChangedLines,
		changedLinePrecision: precisionScore(
			expectedLineKeys.size,
			actualLineKeys.size,
			matchedChangedLines,
		),
		changedLineRecall: recallScore(
			expectedLineKeys.size,
			actualLineKeys.size,
			matchedChangedLines,
		),
		expectedMoves: expectedMoves.size,
		actualMoves: actualMoves.size,
		matchedMoves,
		moveRecall:
			expectedMoves.size === 0
				? null
				: roundNumber(matchedMoves / expectedMoves.size),
		expectedRenames: expectedRenames.size,
		actualRenames: actualRenames.size,
		matchedRenames,
		renameRecall:
			expectedRenames.size === 0
				? null
				: roundNumber(matchedRenames / expectedRenames.size),
	};
}

function scorePerformanceLane(output: BenchmarkToolResult) {
	return {
		status: "scored" as const,
		runtimeMs: output.result.durationMs,
		operationCount: output.result.operations.length,
		moveCount: output.result.moves.length,
		renameCount: output.result.renames.length,
	};
}

function f1Score(precision: number, recall: number) {
	if (precision === 0 && recall === 0) {
		return 0;
	}
	return roundNumber((2 * precision * recall) / (precision + recall));
}

function scoreEntityLane(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkToolResult,
): BenchmarkEntityScore | BenchmarkUnsupportedLane {
	if (!benchmarkCase.capabilities.entity) {
		return unsupportedLane("Case does not require entity capability.");
	}
	if (!output.capabilities.entity) {
		return unsupportedLane("Tool does not support the entity lane.");
	}

	const expectedEntities = new Set(
		benchmarkCase.truth.entities.map((entity) =>
			entityKey(benchmarkCase, entity),
		),
	);
	const actualEntities = new Set(
		output.result.entities.old
			.map((entity) =>
				entityKey(benchmarkCase, { ...entity, side: "old" as const }),
			)
			.concat(
				output.result.entities.new.map((entity) =>
					entityKey(benchmarkCase, { ...entity, side: "new" as const }),
				),
			),
	);
	const matchedEntities = matchedCount(expectedEntities, actualEntities);
	const entityPrecision = precisionScore(
		expectedEntities.size,
		actualEntities.size,
		matchedEntities,
	);
	const entityRecall = recallScore(
		expectedEntities.size,
		actualEntities.size,
		matchedEntities,
	);

	const expectedChanges = new Set(
		benchmarkCase.truth.entityChanges.map((change) =>
			entityChangeKey(benchmarkCase, change),
		),
	);
	const actualChanges = new Set(
		output.result.entityChanges.map((change) =>
			entityChangeKey(benchmarkCase, change),
		),
	);
	const matchedChanges = matchedCount(expectedChanges, actualChanges);
	const changePrecision = precisionScore(
		expectedChanges.size,
		actualChanges.size,
		matchedChanges,
	);
	const changeRecall = recallScore(
		expectedChanges.size,
		actualChanges.size,
		matchedChanges,
	);

	return {
		status: "scored",
		expectedEntities: expectedEntities.size,
		actualEntities: actualEntities.size,
		matchedEntities,
		entityPrecision,
		entityRecall,
		entityF1: f1Score(entityPrecision, entityRecall),
		expectedChanges: expectedChanges.size,
		actualChanges: actualChanges.size,
		matchedChanges,
		changePrecision,
		changeRecall,
		changeF1: f1Score(changePrecision, changeRecall),
	};
}

export function scoreCase(
	benchmarkCase: BenchmarkCase,
	output: BenchmarkToolResult,
): BenchmarkCaseEvaluation {
	return {
		review: scoreReviewLane(benchmarkCase, output),
		entity: scoreEntityLane(benchmarkCase, output),
		graph: benchmarkCase.capabilities.graph
			? unsupportedLane("SemaDiff does not expose graph results yet.")
			: unsupportedLane("Case does not require graph capability."),
		performance: scorePerformanceLane(output),
	};
}

function average(values: readonly number[]) {
	if (values.length === 0) {
		return null;
	}
	return roundNumber(
		values.reduce((sum, value) => sum + value, 0) / values.length,
	);
}

function percentile(values: readonly number[], fraction: number) {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * fraction) - 1),
	);
	return roundNumber(sorted[index] ?? sorted.at(-1) ?? 0);
}

export function summarizeReports(
	reports: readonly BenchmarkCaseReport[],
): BenchmarkReportSummary {
	const reviewScores = reports.flatMap((report) =>
		report.evaluation.review.status === "scored"
			? [report.evaluation.review]
			: [],
	);
	const entityScores = reports.flatMap((report) =>
		report.evaluation.entity.status === "scored"
			? [report.evaluation.entity]
			: [],
	);
	const performanceScores = reports.map(
		(report) => report.evaluation.performance,
	);
	return {
		review: {
			cases: reviewScores.length,
			averagePrecision: average(
				reviewScores.map((score) => score.changedLinePrecision),
			),
			averageRecall: average(
				reviewScores.map((score) => score.changedLineRecall),
			),
			averageMoveRecall: average(
				reviewScores.flatMap((score) =>
					score.moveRecall === null ? [] : [score.moveRecall],
				),
			),
			averageRenameRecall: average(
				reviewScores.flatMap((score) =>
					score.renameRecall === null ? [] : [score.renameRecall],
				),
			),
		},
		performance: {
			cases: performanceScores.length,
			totalRuntimeMs: roundNumber(
				performanceScores.reduce((sum, score) => sum + score.runtimeMs, 0),
			),
			medianRuntimeMs: percentile(
				performanceScores.map((score) => score.runtimeMs),
				0.5,
			),
			p95RuntimeMs: percentile(
				performanceScores.map((score) => score.runtimeMs),
				0.95,
			),
		},
		entity: {
			supportedCases: entityScores.length,
			unsupportedCases: reports.length - entityScores.length,
			averagePrecision: average(
				entityScores.map((score) => score.entityPrecision),
			),
			averageRecall: average(entityScores.map((score) => score.entityRecall)),
			averageF1: average(entityScores.map((score) => score.entityF1)),
			averageChangePrecision: average(
				entityScores.map((score) => score.changePrecision),
			),
			averageChangeRecall: average(
				entityScores.map((score) => score.changeRecall),
			),
			averageChangeF1: average(entityScores.map((score) => score.changeF1)),
		},
		graph: {
			supportedCases: 0,
			unsupportedCases: reports.length,
		},
	};
}

export function runBenchmarkSuite(
	benchmarkCases: readonly BenchmarkCase[],
	options?: {
		caseRoot?: string | undefined;
	},
): BenchmarkReport {
	const reports = benchmarkCases.map((benchmarkCase) => {
		const output = runSemadiffCase(benchmarkCase);
		return {
			caseId: benchmarkCase.id,
			description: benchmarkCase.description,
			kind: benchmarkCase.kind,
			capabilities: benchmarkCase.capabilities,
			...(benchmarkCase.source ? { source: benchmarkCase.source } : {}),
			evaluation: scoreCase(benchmarkCase, output),
			output,
		} satisfies BenchmarkCaseReport;
	});
	return {
		version: "0.1.0",
		tool: "semadiff",
		caseRoot: options?.caseRoot ?? process.cwd(),
		generatedAt: new Date().toISOString(),
		cases: reports,
		summary: summarizeReports(reports),
	};
}
