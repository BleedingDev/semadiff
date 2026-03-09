import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type {
	EntityChangeKind,
	SemanticEntityKind,
} from "@semadiff/entity-core";

import { runSemadiffCase } from "./run.js";
import type {
	BenchmarkCase,
	BenchmarkCaseFile,
	BenchmarkLineRange,
	BenchmarkReviewRow,
	BenchmarkToolResult,
	ProjectedEntity,
	ProjectedEntityChange,
	ProjectedMove,
} from "./types.js";

export interface BenchmarkAdapter {
	readonly tool: string;
	runCase(benchmarkCase: BenchmarkCase): BenchmarkToolResult;
}

const versionCache = new Map<string, string>();
const LEADING_SLASH_RE = /^\/+/;
const PARENT_TRAVERSAL_RE = /\.\.(\/|\\)/g;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const LINE_SPLIT_RE = /\r?\n/;
const ANSI_ESCAPE_PREFIX = `${String.fromCharCode(27)}\\[`;
const ANSI_RE = new RegExp(`${ANSI_ESCAPE_PREFIX}[0-9;]*m`, "g");
const GIT_COLOR_MOVED_DELETE_RE = new RegExp(
	`^${ANSI_ESCAPE_PREFIX}[0-9;]*35m-`,
);
const GIT_COLOR_MOVED_INSERT_RE = new RegExp(
	`^${ANSI_ESCAPE_PREFIX}[0-9;]*36m\\+`,
);
const COMMAND_MAX_BUFFER = 50 * 1024 * 1024;
const SEM_GRAPH_ENTITY_RE =
	/^\s{4,}(\S+)\s+(.+?)\s+L(\d+)-(\d+)(?:\s+\(.*\))?$/;
const LEADING_EXPORT_RE = /^\s*export(?:\s+default)?\s+/;

function roundNumber(value: number) {
	return Number(value.toFixed(3));
}

function resolveRelativePath(
	file: BenchmarkCaseFile,
	side: "old" | "new",
): string {
	return (
		(side === "old" ? file.oldPath : file.newPath) ??
		(side === "old" ? file.newPath : file.oldPath) ??
		file.id
	).replace(LEADING_SLASH_RE, "");
}

function writeFixtureFile(
	tempDir: string,
	relativePath: string,
	text: string,
): string {
	const safePath = relativePath.replace(PARENT_TRAVERSAL_RE, "__/");
	const absolutePath = join(tempDir, safePath);
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, text);
	return absolutePath;
}

function commandVersion(command: string, args: readonly string[]) {
	const cacheKey = [command, ...args].join(" ");
	const cached = versionCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	const result = spawnSync(command, [...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		const stderr = result.stderr?.trim();
		throw new Error(stderr || `Failed to determine version for ${command}.`);
	}
	const version = result.stdout.trim();
	versionCache.set(cacheKey, version);
	return version;
}

function execWithAllowedExitCodes(
	command: string,
	args: readonly string[],
	options?: {
		env?: NodeJS.ProcessEnv | undefined;
		cwd?: string | undefined;
		input?: string | undefined;
		allowedExitCodes?: readonly number[] | undefined;
	},
) {
	try {
		return execFileSync(command, [...args], {
			encoding: "utf8",
			env: options?.env,
			cwd: options?.cwd,
			input: options?.input,
			maxBuffer: COMMAND_MAX_BUFFER,
		});
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		const exited = error as Error & {
			status?: number;
			stdout?: Buffer | string;
			stderr?: Buffer | string;
		};
		if (
			exited.status !== undefined &&
			(options?.allowedExitCodes ?? []).includes(exited.status)
		) {
			return exited.stdout?.toString() ?? "";
		}
		throw error;
	}
}

function execWithDiffExitCode(
	command: string,
	args: readonly string[],
	options?: {
		env?: NodeJS.ProcessEnv | undefined;
		cwd?: string | undefined;
		input?: string | undefined;
	},
) {
	return execWithAllowedExitCodes(command, args, {
		...options,
		allowedExitCodes: [0, 1],
	});
}

function buildReviewOnlyResult(params: {
	tool: string;
	toolVersion: string;
	benchmarkCase: BenchmarkCase;
	durationMs: number;
	reviewRows: readonly BenchmarkReviewRow[];
}): BenchmarkToolResult {
	const projectedMoves = buildProjectedMovesFromReviewRows(params.reviewRows);
	return {
		tool: params.tool,
		toolVersion: params.toolVersion,
		caseId: params.benchmarkCase.id,
		capabilities: {
			review: true,
			entity: false,
			graph: false,
		},
		result: {
			durationMs: roundNumber(params.durationMs),
			operations: [],
			moves: projectedMoves,
			renames: [],
			reviewRows: params.reviewRows,
			entities: {
				old: [],
				new: [],
			},
			entityChanges: [],
		},
	};
}

function buildEntityOnlyResult(params: {
	tool: string;
	toolVersion: string;
	benchmarkCase: BenchmarkCase;
	durationMs: number;
	oldEntities: readonly ProjectedEntity[];
	newEntities: readonly ProjectedEntity[];
	entityChanges: readonly ProjectedEntityChange[];
}): BenchmarkToolResult {
	return {
		tool: params.tool,
		toolVersion: params.toolVersion,
		caseId: params.benchmarkCase.id,
		capabilities: {
			review: false,
			entity: true,
			graph: false,
		},
		result: {
			durationMs: roundNumber(params.durationMs),
			operations: [],
			moves: [],
			renames: [],
			reviewRows: [],
			entities: {
				old: params.oldEntities,
				new: params.newEntities,
			},
			entityChanges: params.entityChanges,
		},
	};
}

function resolveSemCommand() {
	const configured = process.env.SEM_BIN;
	if (configured) {
		return configured.startsWith("/")
			? configured
			: resolve(process.cwd(), configured);
	}
	const repoLocal = resolve(process.cwd(), "tmp/sem-install/bin/sem");
	return existsSync(repoLocal) ? repoLocal : "sem";
}

function readJsonFile(path: string) {
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolveBenchmarkEntityFileId(
	benchmarkCase: BenchmarkCase,
	side: "old" | "new",
	path: string,
) {
	const file = benchmarkCase.files.find((entry) =>
		side === "old" ? entry.oldPath === path : entry.newPath === path,
	);
	return file?.id ?? benchmarkCase.files[0]?.id ?? path;
}

function mapSemEntityKind(entityType: string): SemanticEntityKind | null {
	switch (entityType) {
		case "function":
		case "class":
		case "method":
		case "interface":
		case "variable":
			return entityType;
		case "type":
		case "typeAlias":
		case "typealias":
			return "typeAlias";
		default:
			return null;
	}
}

function normalizeSemEntitySnippet(text: string | null | undefined) {
	return (text ?? "")
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.replace(LEADING_EXPORT_RE, "")
		.trim();
}

interface ParsedSemGraphEntity {
	readonly filePath: string;
	readonly kind: SemanticEntityKind;
	readonly name: string;
	readonly range: BenchmarkLineRange;
	readonly exported: boolean;
	readonly snippet: string;
}

function parseSemGraphEntities(
	output: string,
	fileContentsByPath: ReadonlyMap<string, string>,
) {
	const entities: ParsedSemGraphEntity[] = [];
	let currentFilePath: string | undefined;

	for (const line of output.split(LINE_SPLIT_RE)) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("graph:")) {
			continue;
		}
		const entityMatch = SEM_GRAPH_ENTITY_RE.exec(line);
		if (entityMatch && currentFilePath) {
			const kind = mapSemEntityKind(entityMatch[1] ?? "");
			if (!kind) {
				continue;
			}
			const startLine = Number.parseInt(entityMatch[3] ?? "0", 10);
			const endLine = Number.parseInt(entityMatch[4] ?? "0", 10);
			const fileText = fileContentsByPath.get(currentFilePath) ?? "";
			const snippet = fileText
				.split(LINE_SPLIT_RE)
				.slice(startLine - 1, endLine)
				.join("\n");
			entities.push({
				filePath: currentFilePath,
				kind,
				name: entityMatch[2] ?? "",
				range: {
					startLine,
					endLine,
				},
				exported: LEADING_EXPORT_RE.test(snippet),
				snippet,
			});
			continue;
		}

		currentFilePath = trimmed;
	}

	return entities;
}

function writeSnapshotFiles(
	benchmarkCase: BenchmarkCase,
	tempDir: string,
	side: "old" | "new",
) {
	const filesByPath = new Map<string, string>();
	for (const file of benchmarkCase.files) {
		const relativePath = side === "old" ? file.oldPath : file.newPath;
		const text = side === "old" ? file.before : file.after;
		if (!relativePath) {
			continue;
		}
		writeFixtureFile(tempDir, relativePath, text);
		filesByPath.set(relativePath, text);
	}
	return filesByPath;
}

function buildSemProjectedEntities(
	benchmarkCase: BenchmarkCase,
	side: "old" | "new",
	entities: readonly ParsedSemGraphEntity[],
): ProjectedEntity[] {
	return entities.map((entity) => ({
		id: `sem:${side}:${entity.filePath}:${entity.kind}:${entity.name}:${entity.range.startLine}:${entity.range.endLine}`,
		fileId: resolveBenchmarkEntityFileId(benchmarkCase, side, entity.filePath),
		kind: entity.kind,
		name: entity.name,
		range: entity.range,
		path: entity.filePath,
		exported: entity.exported,
	}));
}

interface SemDiffChangeRecord {
	readonly changeType: string;
	readonly entityName: string;
	readonly entityType: string;
	readonly filePath: string;
	readonly oldFilePath: string | null;
	readonly beforeContent: string | null;
	readonly afterContent: string | null;
}

interface SemDiffJsonResult {
	readonly changes?: readonly SemDiffChangeRecord[] | undefined;
}

function matchSemEntityByContent(
	changeContent: string | null,
	candidates: readonly ParsedSemGraphEntity[],
) {
	const normalizedTarget = normalizeSemEntitySnippet(changeContent);
	if (!normalizedTarget) {
		return undefined;
	}
	return candidates.find((candidate) => {
		const normalizedCandidate = normalizeSemEntitySnippet(candidate.snippet);
		return (
			normalizedCandidate === normalizedTarget ||
			normalizedCandidate.includes(normalizedTarget) ||
			normalizedTarget.includes(normalizedCandidate)
		);
	});
}

function findSemEntityForChange(
	change: SemDiffChangeRecord,
	side: "old" | "new",
	entities: readonly ParsedSemGraphEntity[],
) {
	const path =
		side === "old" ? (change.oldFilePath ?? change.filePath) : change.filePath;
	const kind = mapSemEntityKind(change.entityType);
	if (!kind) {
		return undefined;
	}

	const byFileAndKind = entities.filter(
		(entity) => entity.filePath === path && entity.kind === kind,
	);
	if (byFileAndKind.length === 0) {
		return undefined;
	}

	const nameMatch = byFileAndKind.find(
		(entity) => entity.name === change.entityName,
	);
	if (nameMatch) {
		return nameMatch;
	}

	return matchSemEntityByContent(
		side === "old" ? change.beforeContent : change.afterContent,
		byFileAndKind,
	);
}

function mapSemChangeKinds(changeType: string): readonly EntityChangeKind[] {
	switch (changeType) {
		case "added":
			return ["added"];
		case "deleted":
			return ["deleted"];
		case "modified":
			return ["modified"];
		case "moved":
			return ["moved"];
		case "renamed":
			return ["renamed"];
		default:
			throw new Error(`Unsupported sem change type: ${changeType}`);
	}
}

function runSemGraphEntities(
	semCommand: string,
	tempDir: string,
	filesByPath: ReadonlyMap<string, string>,
) {
	if (filesByPath.size === 0) {
		return [] as ParsedSemGraphEntity[];
	}
	const output = execWithAllowedExitCodes(
		semCommand,
		["graph", ...filesByPath.keys()],
		{
			cwd: tempDir,
			allowedExitCodes: [0],
		},
	);
	return parseSemGraphEntities(output, filesByPath);
}

function semFileStatus(file: BenchmarkCaseFile) {
	switch (file.status) {
		case "added":
			return "added";
		case "deleted":
			return "deleted";
		case "renamed":
			return "renamed";
		default:
			return "modified";
	}
}

function runSemCase(benchmarkCase: BenchmarkCase): BenchmarkToolResult {
	const semCommand = resolveSemCommand();
	const toolVersion = commandVersion(semCommand, ["--version"]);
	const tempDir = mkdtempSync(join(tmpdir(), "benchmark-sem-"));
	let durationMs = 0;

	try {
		const oldRoot = join(tempDir, "old");
		const newRoot = join(tempDir, "new");
		const oldFiles = writeSnapshotFiles(benchmarkCase, oldRoot, "old");
		const newFiles = writeSnapshotFiles(benchmarkCase, newRoot, "new");

		const startedAt = performance.now();
		const diffOutput = execWithAllowedExitCodes(
			semCommand,
			["diff", "--stdin", "--format", "json"],
			{
				input: JSON.stringify(
					benchmarkCase.files.map((file) => ({
						filePath: file.newPath ?? file.oldPath ?? file.id,
						status: semFileStatus(file),
						...(file.oldPath && file.oldPath !== file.newPath
							? { oldFilePath: file.oldPath }
							: {}),
						...(file.oldPath ? { beforeContent: file.before } : {}),
						...(file.newPath ? { afterContent: file.after } : {}),
					})),
				),
				allowedExitCodes: [0],
			},
		);
		const oldEntities = runSemGraphEntities(semCommand, oldRoot, oldFiles);
		const newEntities = runSemGraphEntities(semCommand, newRoot, newFiles);
		durationMs = performance.now() - startedAt;

		const parsed = JSON.parse(diffOutput) as SemDiffJsonResult;
		const projectedOldEntities = buildSemProjectedEntities(
			benchmarkCase,
			"old",
			oldEntities,
		);
		const projectedNewEntities = buildSemProjectedEntities(
			benchmarkCase,
			"new",
			newEntities,
		);
		const entityChanges = (parsed.changes ?? []).flatMap((change, index) => {
			const kind = mapSemEntityKind(change.entityType);
			if (!kind) {
				return [];
			}
			const beforeEntity = findSemEntityForChange(change, "old", oldEntities);
			const afterEntity = findSemEntityForChange(change, "new", newEntities);
			return [
				{
					id: `sem-change-${index + 1}`,
					kind,
					...(beforeEntity
						? {
								before: {
									id: `sem:old:${beforeEntity.filePath}:${beforeEntity.kind}:${beforeEntity.name}:${beforeEntity.range.startLine}:${beforeEntity.range.endLine}`,
									fileId: resolveBenchmarkEntityFileId(
										benchmarkCase,
										"old",
										beforeEntity.filePath,
									),
									kind: beforeEntity.kind,
									name: beforeEntity.name,
									range: beforeEntity.range,
									path: beforeEntity.filePath,
									exported: beforeEntity.exported,
								} satisfies ProjectedEntity,
							}
						: {}),
					...(afterEntity
						? {
								after: {
									id: `sem:new:${afterEntity.filePath}:${afterEntity.kind}:${afterEntity.name}:${afterEntity.range.startLine}:${afterEntity.range.endLine}`,
									fileId: resolveBenchmarkEntityFileId(
										benchmarkCase,
										"new",
										afterEntity.filePath,
									),
									kind: afterEntity.kind,
									name: afterEntity.name,
									range: afterEntity.range,
									path: afterEntity.filePath,
									exported: afterEntity.exported,
								} satisfies ProjectedEntity,
							}
						: {}),
					changeKinds: mapSemChangeKinds(change.changeType),
					confidence: 1,
					linkedOperationIds: [],
				} satisfies ProjectedEntityChange,
			];
		});

		return buildEntityOnlyResult({
			tool: "sem",
			toolVersion,
			benchmarkCase,
			durationMs,
			oldEntities: projectedOldEntities,
			newEntities: projectedNewEntities,
			entityChanges,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

interface SemanticDiffManifestEntry {
	readonly tracking_name?: string | undefined;
	readonly file?: string | undefined;
}

interface SemanticDiffDiffRow {
	readonly line?: number | null | undefined;
	readonly content?: string | undefined;
	readonly change?: number | null | undefined;
}

interface SemanticDiffDiffBlock {
	readonly old_column?: readonly SemanticDiffDiffRow[] | undefined;
	readonly new_column?: readonly SemanticDiffDiffRow[] | undefined;
}

interface SemanticDiffDiffPayload {
	readonly type?: string | undefined;
	readonly blocks?: readonly SemanticDiffDiffBlock[] | undefined;
	readonly error?: unknown;
}

function isSemanticDiffChanged(
	oldEntry: SemanticDiffDiffRow | undefined,
	newEntry: SemanticDiffDiffRow | undefined,
	oldText: string,
	newText: string,
) {
	return (
		(oldEntry?.change ?? 0) !== 0 ||
		(newEntry?.change ?? 0) !== 0 ||
		oldText !== newText
	);
}

function toSemanticDiffReviewRow(params: {
	fileId: string;
	oldEntry: SemanticDiffDiffRow | undefined;
	newEntry: SemanticDiffDiffRow | undefined;
	oldText: string;
	newText: string;
}): BenchmarkReviewRow | undefined {
	const oldLine = params.oldEntry?.line ?? null;
	const newLine = params.newEntry?.line ?? null;
	if (oldLine != null && newLine != null) {
		return {
			fileId: params.fileId,
			type: "replace",
			oldLine,
			newLine,
			oldText: params.oldText,
			newText: params.newText,
		};
	}
	if (oldLine != null) {
		return {
			fileId: params.fileId,
			type: "delete",
			oldLine,
			oldText: params.oldText,
		};
	}
	if (newLine != null) {
		return {
			fileId: params.fileId,
			type: "insert",
			newLine,
			newText: params.newText,
		};
	}
	return undefined;
}

function parseSemanticDiffBlockRows(
	fileId: string,
	block: SemanticDiffDiffBlock,
): BenchmarkReviewRow[] {
	const oldColumn = block.old_column ?? [];
	const newColumn = block.new_column ?? [];
	const rowCount = Math.max(oldColumn.length, newColumn.length);
	const rows: BenchmarkReviewRow[] = [];

	for (let index = 0; index < rowCount; index += 1) {
		const oldEntry = oldColumn[index];
		const newEntry = newColumn[index];
		const oldText = oldEntry?.content ?? "";
		const newText = newEntry?.content ?? "";
		if (!isSemanticDiffChanged(oldEntry, newEntry, oldText, newText)) {
			continue;
		}
		const row = toSemanticDiffReviewRow({
			fileId,
			oldEntry,
			newEntry,
			oldText,
			newText,
		});
		if (row) {
			rows.push(row);
		}
	}

	return rows;
}

function parseSemanticDiffRows(
	fileId: string,
	payload: SemanticDiffDiffPayload,
): BenchmarkReviewRow[] {
	if (payload.type === "error") {
		throw new Error(
			`SemanticDiff cache contains an error payload for ${fileId}: ${JSON.stringify(payload.error)}`,
		);
	}
	if (!Array.isArray(payload.blocks)) {
		return [];
	}

	return payload.blocks.flatMap((block) =>
		parseSemanticDiffBlockRows(fileId, block),
	);
}

function runSemanticDiffCase(
	benchmarkCase: BenchmarkCase,
): BenchmarkToolResult {
	const cacheDirectory = join(
		dirname(benchmarkCase.sourcePath),
		"semanticdiff",
	);
	const manifestPath = join(cacheDirectory, "manifest.json");
	if (!existsSync(manifestPath)) {
		throw new Error(
			`Missing SemanticDiff cache for ${benchmarkCase.id}. Run pnpm benchmark:real:refresh to hydrate it.`,
		);
	}

	const manifest = readJsonFile(
		manifestPath,
	) as readonly SemanticDiffManifestEntry[];
	const diffEntriesByTrackingPath = new Map<
		string,
		SemanticDiffManifestEntry[]
	>();
	for (const entry of manifest) {
		if (!(entry.tracking_name && entry.file)) {
			continue;
		}
		const group = diffEntriesByTrackingPath.get(entry.tracking_name) ?? [];
		group.push(entry);
		diffEntriesByTrackingPath.set(entry.tracking_name, group);
	}

	const startedAt = performance.now();
	const reviewRows: BenchmarkReviewRow[] = [];
	for (const file of benchmarkCase.files) {
		const trackingPath = file.newPath ?? file.oldPath ?? file.id;
		const entries = diffEntriesByTrackingPath.get(trackingPath) ?? [];
		if (entries.length === 0) {
			throw new Error(
				`Missing SemanticDiff diff cache for ${benchmarkCase.id}:${trackingPath}`,
			);
		}
		for (const entry of entries) {
			if (!entry.file) {
				continue;
			}
			const payload = readJsonFile(join(cacheDirectory, entry.file));
			reviewRows.push(
				...parseSemanticDiffRows(file.id, payload as SemanticDiffDiffPayload),
			);
		}
	}

	return buildReviewOnlyResult({
		tool: "semanticdiff",
		toolVersion: "cached-web",
		benchmarkCase,
		durationMs: performance.now() - startedAt,
		reviewRows,
	});
}

interface MoveRowProjectionGroup {
	readonly fileId: string;
	readonly oldRange: BenchmarkLineRange;
	readonly newRange: BenchmarkLineRange;
	readonly delta: number;
}

function expandMoveGroup(
	group: MoveRowProjectionGroup,
	oldLine: number,
	newLine: number,
): MoveRowProjectionGroup {
	return {
		...group,
		oldRange: {
			startLine: Math.min(group.oldRange.startLine, oldLine),
			endLine: Math.max(group.oldRange.endLine, oldLine),
		},
		newRange: {
			startLine: Math.min(group.newRange.startLine, newLine),
			endLine: Math.max(group.newRange.endLine, newLine),
		},
	};
}

function buildProjectedMovesFromReviewRows(
	reviewRows: readonly BenchmarkReviewRow[],
): ProjectedMove[] {
	const moveRows = reviewRows
		.filter(
			(row) =>
				row.type === "move" &&
				row.oldLine != null &&
				row.newLine != null &&
				(row.oldText ?? row.newText ?? row.text ?? "").trim().length > 0,
		)
		.sort((left, right) => {
			if (left.fileId !== right.fileId) {
				return left.fileId.localeCompare(right.fileId);
			}
			if ((left.oldLine ?? 0) !== (right.oldLine ?? 0)) {
				return (left.oldLine ?? 0) - (right.oldLine ?? 0);
			}
			return (left.newLine ?? 0) - (right.newLine ?? 0);
		});

	const groups: MoveRowProjectionGroup[] = [];
	let currentGroup: MoveRowProjectionGroup | undefined;

	for (const row of moveRows) {
		const oldLine = row.oldLine ?? 0;
		const newLine = row.newLine ?? 0;
		const delta = newLine - oldLine;

		if (
			currentGroup &&
			currentGroup.fileId === row.fileId &&
			currentGroup.delta === delta &&
			oldLine <= currentGroup.oldRange.endLine + 2 &&
			newLine <= currentGroup.newRange.endLine + 2
		) {
			currentGroup = expandMoveGroup(currentGroup, oldLine, newLine);
			groups[groups.length - 1] = currentGroup;
			continue;
		}

		currentGroup = {
			fileId: row.fileId,
			oldRange: {
				startLine: oldLine,
				endLine: oldLine,
			},
			newRange: {
				startLine: newLine,
				endLine: newLine,
			},
			delta,
		};
		groups.push(currentGroup);
	}

	return groups.map((group, index) => ({
		fileId: group.fileId,
		oldRange: group.oldRange,
		newRange: group.newRange,
		confidence: 0.5,
		operationIds: [`external-move-${index + 1}`],
	}));
}

function parseUnifiedDiff(
	fileId: string,
	diffText: string,
): BenchmarkReviewRow[] {
	return parseGitDiffRows(fileId, diffText, {
		detectColorMoved: false,
	});
}

interface ParsedGitDiffChange {
	readonly kind: "delete" | "insert";
	readonly line: number;
	readonly text: string;
	readonly moved: boolean;
	readonly index: number;
}

interface IndexedReviewRow {
	readonly sortIndex: number;
	readonly row: BenchmarkReviewRow;
}

function stripAnsi(text: string) {
	return text.replace(ANSI_RE, "");
}

interface GitDiffParseState {
	oldLine: number;
	newLine: number;
	inHunk: boolean;
	changeIndex: number;
}

function isSkippedGitDiffLine(state: GitDiffParseState, line: string) {
	return !state.inHunk || line.length === 0 || line.startsWith("\\");
}

function parseGitDiffChangeLine(
	rawLine: string,
	state: GitDiffParseState,
	detectColorMoved: boolean,
): ParsedGitDiffChange | undefined {
	const line = stripAnsi(rawLine);
	const header = line.match(HUNK_HEADER_RE);
	if (header) {
		state.inHunk = true;
		state.oldLine = Number.parseInt(header[1] ?? "0", 10);
		state.newLine = Number.parseInt(header[3] ?? "0", 10);
		return undefined;
	}

	if (isSkippedGitDiffLine(state, line)) {
		return undefined;
	}

	const prefix = line[0];
	if (prefix === " ") {
		state.oldLine += 1;
		state.newLine += 1;
		return undefined;
	}

	const isDeletion = prefix === "-";
	const isInsertion = prefix === "+";
	if (!(isDeletion || isInsertion)) {
		return undefined;
	}

	const change: ParsedGitDiffChange = {
		kind: isDeletion ? "delete" : "insert",
		line: isDeletion ? state.oldLine : state.newLine,
		text: line.slice(1),
		moved:
			detectColorMoved &&
			(isDeletion
				? GIT_COLOR_MOVED_DELETE_RE.test(rawLine)
				: GIT_COLOR_MOVED_INSERT_RE.test(rawLine)),
		index: state.changeIndex,
	};
	state.changeIndex += 1;

	if (isDeletion) {
		state.oldLine += 1;
	} else {
		state.newLine += 1;
	}

	return change;
}

function parseGitDiffChanges(
	diffText: string,
	detectColorMoved: boolean,
): {
	deletes: ParsedGitDiffChange[];
	inserts: ParsedGitDiffChange[];
} {
	const deletes: ParsedGitDiffChange[] = [];
	const inserts: ParsedGitDiffChange[] = [];
	const state: GitDiffParseState = {
		oldLine: 0,
		newLine: 0,
		inHunk: false,
		changeIndex: 0,
	};

	for (const rawLine of diffText.split(LINE_SPLIT_RE)) {
		const change = parseGitDiffChangeLine(rawLine, state, detectColorMoved);
		if (!change) {
			continue;
		}
		if (change.kind === "delete") {
			deletes.push(change);
		} else {
			inserts.push(change);
		}
	}

	return { deletes, inserts };
}

function parseGitDiffRows(
	fileId: string,
	diffText: string,
	options: {
		detectColorMoved: boolean;
	},
): BenchmarkReviewRow[] {
	const { deletes, inserts } = parseGitDiffChanges(
		diffText,
		options.detectColorMoved,
	);

	const movedInsertionsByText = new Map<string, ParsedGitDiffChange[]>();
	for (const insert of inserts) {
		if (!insert.moved) {
			continue;
		}
		const queue = movedInsertionsByText.get(insert.text) ?? [];
		queue.push(insert);
		movedInsertionsByText.set(insert.text, queue);
	}

	const pairedInsertions = new Set<ParsedGitDiffChange>();
	const rows: IndexedReviewRow[] = [];

	for (const deletion of deletes) {
		if (deletion.moved) {
			const queue = movedInsertionsByText.get(deletion.text);
			const insertion = queue?.shift();
			if (insertion) {
				pairedInsertions.add(insertion);
				rows.push({
					sortIndex: deletion.index,
					row: {
						fileId,
						type: "move",
						oldLine: deletion.line,
						newLine: insertion.line,
						oldText: deletion.text,
						newText: insertion.text,
					},
				});
				continue;
			}
		}

		rows.push({
			sortIndex: deletion.index,
			row: {
				fileId,
				type: "delete",
				oldLine: deletion.line,
				oldText: deletion.text,
			},
		});
	}

	for (const insertion of inserts) {
		if (pairedInsertions.has(insertion)) {
			continue;
		}
		rows.push({
			sortIndex: insertion.index,
			row: {
				fileId,
				type: "insert",
				newLine: insertion.line,
				newText: insertion.text,
			},
		});
	}

	return rows
		.sort((left, right) => left.sortIndex - right.sortIndex)
		.map((entry) => entry.row);
}

interface DifftasticJsonChange {
	readonly content: string;
}

interface DifftasticJsonSide {
	readonly line_number: number;
	readonly changes: readonly DifftasticJsonChange[];
}

interface DifftasticJsonRow {
	readonly lhs?: DifftasticJsonSide | undefined;
	readonly rhs?: DifftasticJsonSide | undefined;
}

function lineText(side: DifftasticJsonSide | undefined) {
	return side?.changes.map((change) => change.content).join("") ?? "";
}

function parseDifftasticRows(
	fileId: string,
	rawOutput: string,
): BenchmarkReviewRow[] {
	const trimmed = rawOutput.trim();
	if (!trimmed) {
		return [];
	}
	const parsed = JSON.parse(trimmed) as
		| { chunks?: readonly (readonly DifftasticJsonRow[])[] }
		| readonly { chunks?: readonly (readonly DifftasticJsonRow[])[] }[];
	const result = Array.isArray(parsed) ? parsed[0] : parsed;
	if (!(result && Array.isArray(result.chunks))) {
		return [];
	}
	return result.chunks.flatMap((chunk: readonly DifftasticJsonRow[]) =>
		chunk.flatMap((row: DifftasticJsonRow): BenchmarkReviewRow[] => {
			if (row.lhs && row.rhs) {
				return [
					{
						fileId,
						type: "replace",
						oldLine: row.lhs.line_number + 1,
						newLine: row.rhs.line_number + 1,
						oldText: lineText(row.lhs),
						newText: lineText(row.rhs),
					},
				];
			}
			if (row.lhs) {
				return [
					{
						fileId,
						type: "delete",
						oldLine: row.lhs.line_number + 1,
						oldText: lineText(row.lhs),
					},
				];
			}
			if (row.rhs) {
				return [
					{
						fileId,
						type: "insert",
						newLine: row.rhs.line_number + 1,
						newText: lineText(row.rhs),
					},
				];
			}
			return [];
		}),
	);
}

function runExternalReviewAdapter(params: {
	benchmarkCase: BenchmarkCase;
	tool: string;
	toolVersion: string;
	renderFile: (
		file: BenchmarkCaseFile,
		oldPath: string,
		newPath: string,
	) => string;
	parseRows: (fileId: string, output: string) => BenchmarkReviewRow[];
}): BenchmarkToolResult {
	const tempDir = mkdtempSync(join(tmpdir(), `benchmark-${params.tool}-`));
	let durationMs = 0;
	const reviewRows: BenchmarkReviewRow[] = [];

	try {
		for (const file of params.benchmarkCase.files) {
			const oldPath = writeFixtureFile(
				tempDir,
				join("old", resolveRelativePath(file, "old")),
				file.before,
			);
			const newPath = writeFixtureFile(
				tempDir,
				join("new", resolveRelativePath(file, "new")),
				file.after,
			);
			const startedAt = performance.now();
			const output = params.renderFile(file, oldPath, newPath);
			durationMs += performance.now() - startedAt;
			reviewRows.push(...params.parseRows(file.id, output));
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}

	return buildReviewOnlyResult({
		tool: params.tool,
		toolVersion: params.toolVersion,
		benchmarkCase: params.benchmarkCase,
		durationMs,
		reviewRows,
	});
}

function runGitDiffCase(benchmarkCase: BenchmarkCase): BenchmarkToolResult {
	const toolVersion = commandVersion("git", ["--version"]);
	return runExternalReviewAdapter({
		benchmarkCase,
		tool: "git-diff",
		toolVersion,
		renderFile: (_file, oldPath, newPath) =>
			execWithDiffExitCode("git", [
				"--no-pager",
				"diff",
				"--no-index",
				"--unified=0",
				"--no-color",
				oldPath,
				newPath,
			]),
		parseRows: parseUnifiedDiff,
	});
}

function runGitDiffColorMovedCase(
	benchmarkCase: BenchmarkCase,
): BenchmarkToolResult {
	const toolVersion = `${commandVersion("git", ["--version"])} (+color-moved)`;
	return runExternalReviewAdapter({
		benchmarkCase,
		tool: "git-diff-color-moved",
		toolVersion,
		renderFile: (_file, oldPath, newPath) =>
			execWithDiffExitCode("git", [
				"--no-pager",
				"diff",
				"--no-index",
				"--unified=0",
				"--color=always",
				"--color-moved=plain",
				oldPath,
				newPath,
			]),
		parseRows: (fileId, output) =>
			parseGitDiffRows(fileId, output, {
				detectColorMoved: true,
			}),
	});
}

function runDifftasticCase(benchmarkCase: BenchmarkCase): BenchmarkToolResult {
	const toolVersion = commandVersion("difft", ["--version"]);
	return runExternalReviewAdapter({
		benchmarkCase,
		tool: "difftastic",
		toolVersion,
		renderFile: (_file, oldPath, newPath) =>
			execWithDiffExitCode(
				"difft",
				[
					"--display",
					"json",
					"--context",
					"0",
					"--color",
					"never",
					oldPath,
					newPath,
				],
				{
					env: {
						...process.env,
						DFT_UNSTABLE: "yes",
					},
				},
			),
		parseRows: parseDifftasticRows,
	});
}

export function resolveBenchmarkAdapter(tool: string): BenchmarkAdapter {
	switch (tool) {
		case "semadiff":
			return {
				tool,
				runCase: runSemadiffCase,
			};
		case "sem":
			return {
				tool: "sem",
				runCase: runSemCase,
			};
		case "git-diff":
			return {
				tool,
				runCase: runGitDiffCase,
			};
		case "git-diff-color-moved":
		case "git-diff-moved":
			return {
				tool: "git-diff-color-moved",
				runCase: runGitDiffColorMovedCase,
			};
		case "difftastic":
		case "difft":
			return {
				tool: "difftastic",
				runCase: runDifftasticCase,
			};
		case "semanticdiff":
			return {
				tool: "semanticdiff",
				runCase: runSemanticDiffCase,
			};
		default:
			throw new Error(`Unknown benchmark tool: ${tool}`);
	}
}

export function resolveBenchmarkAdapters(tools: readonly string[]) {
	return tools.map((tool) => resolveBenchmarkAdapter(tool));
}
