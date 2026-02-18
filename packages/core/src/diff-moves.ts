import type { UnitBlock } from "./diff-blocks.js";
import { isCosmeticLanguage, normalizeCosmeticBlock } from "./diff-cosmetic.js";
import {
  getComparableText,
  moveUnitTextLength,
  normalizeMoveUnits,
  similarityRatio,
} from "./diff-move-math.js";
import type { Range } from "./diff-range.js";
import type { DiffToken } from "./diff-tokenize.js";
import { rangeForTokens, textForTokens } from "./diff-tokenize.js";
import type { NormalizerLanguage } from "./normalizers.js";

export interface MoveMeta {
  confidence?: number;
  moveId?: string;
  renameGroupId?: string;
}

export interface MoveOperation {
  id: string;
  type: "move" | "update";
  oldRange: Range;
  newRange: Range;
  oldText: string;
  newText: string;
  meta?: MoveMeta;
}

export interface MoveGroup {
  id: string;
  oldRange: Range;
  newRange: Range;
  confidence: number;
  operations: string[];
}

export interface MoveDetection {
  moves: MoveGroup[];
  moveOps: MoveOperation[];
  nestedOps: MoveOperation[];
  usedDeletes: Set<number>;
  usedInserts: Set<number>;
}

interface MoveMetaInput {
  confidence?: number;
  moveId?: string;
  renameGroupId?: string;
}

function buildMoveMeta(input: MoveMetaInput): MoveMeta | undefined {
  const meta: MoveMeta = {};
  if (input.confidence !== undefined) {
    meta.confidence = input.confidence;
  }
  if (input.moveId !== undefined) {
    meta.moveId = input.moveId;
  }
  if (input.renameGroupId !== undefined) {
    meta.renameGroupId = input.renameGroupId;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: move detection requires branching on match confidence.
export function detectMoves(
  blocks: UnitBlock[],
  oldTokens: DiffToken[],
  newTokens: DiffToken[],
  oldText: string,
  newText: string,
  renameGroupId?: string,
  language?: NormalizerLanguage
): MoveDetection {
  const deleteBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "delete");
  const insertBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "insert");

  const usedDeletes = new Set<number>();
  const usedInserts = new Set<number>();
  const moves: MoveGroup[] = [];
  const moveOps: MoveOperation[] = [];
  const nestedOps: MoveOperation[] = [];

  let moveCounter = 1;
  let opCounter = 1;

  for (const delEntry of deleteBlocks) {
    if (usedDeletes.has(delEntry.index)) {
      continue;
    }
    const deleteUnits = normalizeMoveUnits(delEntry.block.units);
    if (deleteUnits.length === 0) {
      continue;
    }
    let bestIndex = -1;
    let bestScore = 0;
    let bestUnits: DiffToken[] | null = null;
    for (const insEntry of insertBlocks) {
      if (usedInserts.has(insEntry.index)) {
        continue;
      }
      const insertUnits = normalizeMoveUnits(insEntry.block.units);
      if (insertUnits.length === 0) {
        continue;
      }
      const score = similarityRatio(
        deleteUnits.map((unit) => getComparableText(unit)),
        insertUnits.map((unit) => getComparableText(unit))
      );
      if (score > bestScore) {
        bestScore = score;
        bestIndex = insEntry.index;
        bestUnits = insertUnits;
      }
    }

    const insertMatch = insertBlocks.find((entry) => entry.index === bestIndex);
    if (!(insertMatch && bestUnits)) {
      continue;
    }

    const tokenCount = Math.min(deleteUnits.length, bestUnits.length);
    const minContentLength = Math.min(
      moveUnitTextLength(deleteUnits),
      moveUnitTextLength(bestUnits)
    );
    if (tokenCount < 2 && minContentLength < 3) {
      continue;
    }
    if (bestScore < 0.6) {
      continue;
    }

    usedDeletes.add(delEntry.index);
    usedInserts.add(insertMatch.index);

    const moveId = `move-${moveCounter++}`;
    const confidence = bestScore;
    const meta = buildMoveMeta({
      confidence,
      moveId,
      ...(renameGroupId ? { renameGroupId } : {}),
    });
    const moveGroup: MoveGroup = {
      id: moveId,
      oldRange: rangeForTokens(
        oldTokens,
        delEntry.block.start,
        delEntry.block.units.length
      ),
      newRange: rangeForTokens(
        newTokens,
        insertMatch.block.start,
        insertMatch.block.units.length
      ),
      confidence,
      operations: [moveId],
    };

    const oldSlice = textForTokens(
      oldText,
      oldTokens,
      delEntry.block.start,
      delEntry.block.units.length
    );
    const newSlice = textForTokens(
      newText,
      newTokens,
      insertMatch.block.start,
      insertMatch.block.units.length
    );

    moveOps.push({
      id: moveId,
      type: "move",
      oldRange: moveGroup.oldRange,
      newRange: moveGroup.newRange,
      oldText: oldSlice,
      newText: newSlice,
      ...(meta ? { meta } : {}),
    });

    const comparableOld = isCosmeticLanguage(language)
      ? normalizeCosmeticBlock(oldSlice)
      : oldSlice;
    const comparableNew = isCosmeticLanguage(language)
      ? normalizeCosmeticBlock(newSlice)
      : newSlice;
    if (comparableOld !== comparableNew) {
      const updateId = `${moveId}-update-${opCounter++}`;
      moveGroup.operations.push(updateId);
      const updateMeta = buildMoveMeta({
        confidence,
        moveId,
        ...(renameGroupId ? { renameGroupId } : {}),
      });
      nestedOps.push({
        id: updateId,
        type: "update",
        oldRange: moveGroup.oldRange,
        newRange: moveGroup.newRange,
        oldText: oldSlice,
        newText: newSlice,
        ...(updateMeta ? { meta: updateMeta } : {}),
      });
    }

    moves.push(moveGroup);
  }

  return { moves, moveOps, nestedOps, usedDeletes, usedInserts };
}
