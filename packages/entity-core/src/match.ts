import type { DiffDocument, DiffOperation, Range } from "@semadiff/core";

import {
	type ExtractedEntityRecord,
	extractEntityRecordsFromRoot,
} from "./extract.js";
import type {
	EntityChange,
	EntityChangeKind,
	EntityDocument,
	HybridDiffDocument,
	SemanticEntity,
} from "./types.js";

export interface EntitySourceInput {
	oldText: string;
	newText: string;
	language?: string | undefined;
	oldRoot?: unknown;
	newRoot?: unknown;
	oldPath?: string | undefined;
	newPath?: string | undefined;
	diff?: DiffDocument | undefined;
}

function toPublicEntity(entity: ExtractedEntityRecord): SemanticEntity {
	return {
		id: entity.id,
		kind: entity.kind,
		name: entity.name,
		range: entity.range,
		...(entity.path ? { path: entity.path } : {}),
		...(entity.parentName ? { parentName: entity.parentName } : {}),
		exported: entity.exported,
	};
}

function exactKey(entity: ExtractedEntityRecord) {
	return `${entity.kind}:${entity.parentName ?? ""}:${entity.name}`;
}

function canonicalKey(entity: ExtractedEntityRecord) {
	return `${entity.kind}:${entity.parentName ?? ""}:${entity.canonicalHash}`;
}

function bodyKey(entity: ExtractedEntityRecord) {
	return `${entity.kind}:${entity.parentName ?? ""}:${entity.bodyHash}`;
}

function takeMatch(
	remaining: ExtractedEntityRecord[],
	matcher: (candidate: ExtractedEntityRecord) => boolean,
) {
	const index = remaining.findIndex(matcher);
	if (index === -1) {
		return undefined;
	}
	return remaining.splice(index, 1)[0];
}

function takePrioritizedMatch(
	remaining: ExtractedEntityRecord[],
	entity: ExtractedEntityRecord,
	key: (candidate: ExtractedEntityRecord) => string,
) {
	return (
		takeMatch(
			remaining,
			(candidate) =>
				key(candidate) === key(entity) && candidate.path === entity.path,
		) ?? takeMatch(remaining, (candidate) => key(candidate) === key(entity))
	);
}

function linkedOperationsFromDiff(
	diff: DiffDocument | undefined,
	before: ExtractedEntityRecord | undefined,
	after: ExtractedEntityRecord | undefined,
) {
	if (!diff) {
		return [] satisfies DiffOperation[];
	}
	const overlapRatio = (
		entityRange: Range | undefined,
		operationRange: Range | undefined,
	) => {
		if (!(entityRange && operationRange)) {
			return 0;
		}
		const overlapStart = Math.max(
			entityRange.start.line,
			operationRange.start.line,
		);
		const overlapEnd = Math.min(entityRange.end.line, operationRange.end.line);
		if (overlapEnd < overlapStart) {
			return 0;
		}
		const entitySpan = Math.max(
			1,
			entityRange.end.line - entityRange.start.line + 1,
		);
		return (overlapEnd - overlapStart + 1) / entitySpan;
	};
	return diff.operations.filter((operation) => {
		const oldRatio = overlapRatio(before?.range, operation.oldRange);
		const newRatio = overlapRatio(after?.range, operation.newRange);
		if (operation.type === "move") {
			return oldRatio >= 0.5 || newRatio >= 0.5;
		}
		return oldRatio > 0 || newRatio > 0;
	});
}

function transitionKey(
	oldPath?: string | undefined,
	newPath?: string | undefined,
) {
	return `${oldPath ?? ""}->${newPath ?? ""}`;
}

function findDiffForPair(
	diffByTransition: ReadonlyMap<string, DiffDocument>,
	before: ExtractedEntityRecord | undefined,
	after: ExtractedEntityRecord | undefined,
) {
	const keys = [
		transitionKey(before?.path, after?.path),
		transitionKey(before?.path, undefined),
		transitionKey(undefined, after?.path),
	];
	for (const key of keys) {
		const diff = diffByTransition.get(key);
		if (diff) {
			return diff;
		}
	}
	return undefined;
}

interface EntityOperationLookup {
	resolve: (
		before: ExtractedEntityRecord | undefined,
		after: ExtractedEntityRecord | undefined,
	) => {
		diff?: DiffDocument | undefined;
		operations: readonly DiffOperation[];
	};
}

function fixedLookup(diff?: DiffDocument | undefined): EntityOperationLookup {
	return {
		resolve: (before, after) => ({
			diff,
			operations: linkedOperationsFromDiff(diff, before, after),
		}),
	};
}

function mappedLookup(
	diffByTransition: ReadonlyMap<string, DiffDocument>,
): EntityOperationLookup {
	return {
		resolve: (before, after) => {
			const diff = findDiffForPair(diffByTransition, before, after);
			return {
				diff,
				operations: linkedOperationsFromDiff(diff, before, after),
			};
		},
	};
}

function uniqueChangeKinds(kinds: readonly EntityChangeKind[]) {
	const order: readonly EntityChangeKind[] = [
		"added",
		"deleted",
		"renamed",
		"moved",
		"modified",
	];
	return order.filter((kind) => kinds.includes(kind));
}

function buildPairedChangeKinds(params: {
	before: ExtractedEntityRecord;
	after: ExtractedEntityRecord;
	operations: readonly DiffOperation[];
	diff?: DiffDocument | undefined;
}) {
	const { before, after, operations, diff } = params;
	const kinds: EntityChangeKind[] = [];
	const renamed = before.name !== after.name;
	const moved =
		before.path !== after.path ||
		operations.some((operation) => operation.type === "move");
	const hasNonMoveOperation = operations.some(
		(operation) => operation.type !== "move",
	);
	if (renamed) {
		kinds.push("renamed");
	}
	if (moved) {
		kinds.push("moved");
	}

	const renameOnly =
		renamed &&
		!moved &&
		before.bodyHash === after.bodyHash &&
		before.parentName === after.parentName;
	const contentChanged =
		before.bodyHash !== after.bodyHash ||
		before.canonicalHash !== after.canonicalHash;

	if (!diff) {
		if (contentChanged && !renameOnly) {
			kinds.push("modified");
		}
		return uniqueChangeKinds(kinds);
	}

	if (hasNonMoveOperation && contentChanged && !renameOnly) {
		kinds.push("modified");
	}
	return uniqueChangeKinds(kinds);
}

function buildAddedOrDeletedChange(params: {
	entity: ExtractedEntityRecord;
	type: "added" | "deleted";
	operations: readonly DiffOperation[];
	index: number;
}): EntityChange {
	return {
		id: `entity-change-${params.index}`,
		kind: params.entity.kind,
		...(params.type === "added"
			? { after: toPublicEntity(params.entity) }
			: { before: toPublicEntity(params.entity) }),
		changeKinds: [params.type],
		confidence: 1,
		linkedOperationIds: params.operations.map((operation) => operation.id),
	};
}

function buildPairedChange(params: {
	before: ExtractedEntityRecord;
	after: ExtractedEntityRecord;
	operations: readonly DiffOperation[];
	confidence: number;
	index: number;
	diff?: DiffDocument | undefined;
}) {
	const changeKinds = buildPairedChangeKinds({
		before: params.before,
		after: params.after,
		operations: params.operations,
		diff: params.diff,
	});
	if (changeKinds.length === 0) {
		return undefined;
	}
	return {
		id: `entity-change-${params.index}`,
		kind: params.after.kind,
		before: toPublicEntity(params.before),
		after: toPublicEntity(params.after),
		changeKinds,
		confidence: params.confidence,
		linkedOperationIds: params.operations.map((operation) => operation.id),
	} satisfies EntityChange;
}

function matchPairs(
	oldEntities: readonly ExtractedEntityRecord[],
	newEntities: readonly ExtractedEntityRecord[],
) {
	const remainingNew = [...newEntities];
	const pairs: Array<{
		before: ExtractedEntityRecord;
		after: ExtractedEntityRecord;
		confidence: number;
	}> = [];
	const unmatchedOld: ExtractedEntityRecord[] = [];

	for (const entity of oldEntities) {
		const exact = takePrioritizedMatch(remainingNew, entity, exactKey);
		if (exact) {
			pairs.push({ before: entity, after: exact, confidence: 1 });
			continue;
		}
		unmatchedOld.push(entity);
	}

	const stillUnmatchedOld: ExtractedEntityRecord[] = [];
	for (const entity of unmatchedOld) {
		const canonical = takePrioritizedMatch(remainingNew, entity, canonicalKey);
		if (canonical) {
			pairs.push({ before: entity, after: canonical, confidence: 0.95 });
			continue;
		}
		stillUnmatchedOld.push(entity);
	}

	const finalUnmatchedOld: ExtractedEntityRecord[] = [];
	for (const entity of stillUnmatchedOld) {
		const body = takePrioritizedMatch(remainingNew, entity, bodyKey);
		if (body) {
			pairs.push({ before: entity, after: body, confidence: 0.8 });
			continue;
		}
		finalUnmatchedOld.push(entity);
	}

	return {
		pairs,
		unmatchedOld: finalUnmatchedOld,
		unmatchedNew: remainingNew,
	};
}

function buildEntityDocumentFromRecords(
	oldEntities: readonly ExtractedEntityRecord[],
	newEntities: readonly ExtractedEntityRecord[],
	lookup: EntityOperationLookup,
): EntityDocument | undefined {
	if (oldEntities.length === 0 && newEntities.length === 0) {
		return undefined;
	}

	const { pairs, unmatchedOld, unmatchedNew } = matchPairs(
		oldEntities,
		newEntities,
	);
	const changes: EntityChange[] = [];
	let changeIndex = 1;

	for (const pair of pairs) {
		const operationContext = lookup.resolve(pair.before, pair.after);
		const change = buildPairedChange({
			before: pair.before,
			after: pair.after,
			operations: operationContext.operations,
			confidence: pair.confidence,
			index: changeIndex,
			diff: operationContext.diff,
		});
		if (!change) {
			continue;
		}
		changes.push(change);
		changeIndex += 1;
	}

	for (const entity of unmatchedOld) {
		const operationContext = lookup.resolve(entity, undefined);
		changes.push(
			buildAddedOrDeletedChange({
				entity,
				type: "deleted",
				operations: operationContext.operations,
				index: changeIndex,
			}),
		);
		changeIndex += 1;
	}

	for (const entity of unmatchedNew) {
		const operationContext = lookup.resolve(undefined, entity);
		changes.push(
			buildAddedOrDeletedChange({
				entity,
				type: "added",
				operations: operationContext.operations,
				index: changeIndex,
			}),
		);
		changeIndex += 1;
	}

	return {
		old: oldEntities.map(toPublicEntity),
		new: newEntities.map(toPublicEntity),
		changes,
	};
}

export function buildEntityDocument(params: {
	oldText: string;
	newText: string;
	language?: string | undefined;
	oldRoot?: unknown;
	newRoot?: unknown;
	oldPath?: string | undefined;
	newPath?: string | undefined;
	diff?: DiffDocument | undefined;
}): EntityDocument | undefined {
	const oldEntities = extractEntityRecordsFromRoot({
		root: params.oldRoot,
		text: params.oldText,
		language: params.language,
		path: params.oldPath,
	});
	const newEntities = extractEntityRecordsFromRoot({
		root: params.newRoot,
		text: params.newText,
		language: params.language,
		path: params.newPath,
	});
	return buildEntityDocumentFromRecords(
		oldEntities,
		newEntities,
		fixedLookup(params.diff),
	);
}

export function buildEntityDocumentFromSources(params: {
	sources: readonly EntitySourceInput[];
}): EntityDocument | undefined {
	const diffByTransition = new Map<string, DiffDocument>();
	const oldEntities: ExtractedEntityRecord[] = [];
	const newEntities: ExtractedEntityRecord[] = [];

	for (const source of params.sources) {
		oldEntities.push(
			...extractEntityRecordsFromRoot({
				root: source.oldRoot,
				text: source.oldText,
				language: source.language,
				path: source.oldPath,
			}),
		);
		newEntities.push(
			...extractEntityRecordsFromRoot({
				root: source.newRoot,
				text: source.newText,
				language: source.language,
				path: source.newPath,
			}),
		);
		if (source.diff) {
			diffByTransition.set(
				transitionKey(source.oldPath, source.newPath),
				source.diff,
			);
		}
	}

	return buildEntityDocumentFromRecords(
		oldEntities,
		newEntities,
		mappedLookup(diffByTransition),
	);
}

export function buildHybridDiffDocument(params: {
	diff: DiffDocument;
	oldText: string;
	newText: string;
	language?: string | undefined;
	oldRoot?: unknown;
	newRoot?: unknown;
	oldPath?: string | undefined;
	newPath?: string | undefined;
}): HybridDiffDocument {
	const entities = buildEntityDocument({
		diff: params.diff,
		oldText: params.oldText,
		newText: params.newText,
		language: params.language,
		oldRoot: params.oldRoot,
		newRoot: params.newRoot,
		oldPath: params.oldPath,
		newPath: params.newPath,
	});
	return entities ? { diff: params.diff, entities } : { diff: params.diff };
}
