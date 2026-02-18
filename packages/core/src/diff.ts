import type { NormalizerSettings } from "./config.js";
import { defaultConfig } from "./config.js";
import type { UnitBlock } from "./diff-blocks.js";
import { diffUnits } from "./diff-blocks.js";
import { isCosmeticLanguage, shouldPairDeleteInsert } from "./diff-cosmetic.js";
import { suppressCosmeticMoves } from "./diff-cosmetic-moves.js";
import type { MoveGroup } from "./diff-moves.js";
import { detectMoves } from "./diff-moves.js";
import {
  coalesceOperations,
  suppressCosmeticLineMoves,
  suppressCosmeticUpdates,
  suppressMovedLineOps,
} from "./diff-operations.js";
import type { Range } from "./diff-range.js";
import { rangeForText } from "./diff-range.js";
import type { RenameGroup } from "./diff-rename.js";
import { detectRenames } from "./diff-rename.js";
import type { TokenRange } from "./diff-tokenize.js";
import { rangeForTokens, textForTokens, tokenize } from "./diff-tokenize.js";
import type { NormalizerLanguage } from "./normalizers.js";
import { normalizeTextForLanguage } from "./normalizers.js";

export type { MoveGroup } from "./diff-moves.js";
export type { Position, Range } from "./diff-range.js";
export type { RenameGroup } from "./diff-rename.js";

export interface DiffOperation {
  id: string;
  type: "insert" | "delete" | "update" | "move";
  oldRange?: Range | undefined;
  newRange?: Range | undefined;
  oldText?: string | undefined;
  newText?: string | undefined;
  meta?:
    | {
        confidence?: number | undefined;
        moveId?: string | undefined;
        renameGroupId?: string | undefined;
      }
    | undefined;
}

export interface DiffDocument {
  version: "0.1.0";
  operations: DiffOperation[];
  moves: MoveGroup[];
  renames: RenameGroup[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: structural diff pipeline trades complexity for clarity.
export function structuralDiff(
  oldText: string,
  newText: string,
  options?: {
    normalizers?: NormalizerSettings;
    language?: NormalizerLanguage;
    oldRoot?: unknown;
    newRoot?: unknown;
    oldTokens?: readonly TokenRange[];
    newTokens?: readonly TokenRange[];
    detectMoves?: boolean;
  }
): DiffDocument {
  const settings = options?.normalizers ?? defaultConfig.normalizers;
  const normalizedOld = normalizeTextForLanguage(
    oldText,
    settings,
    options?.language
  );
  const normalizedNew = normalizeTextForLanguage(
    newText,
    settings,
    options?.language
  );

  if (normalizedOld === normalizedNew) {
    return { version: "0.1.0", operations: [], moves: [], renames: [] };
  }

  if (oldText.length === 0 && newText.length > 0) {
    return {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "insert",
          newRange: rangeForText(newText),
          newText,
        },
      ],
      moves: [],
      renames: [],
    };
  }

  if (newText.length === 0 && oldText.length > 0) {
    return {
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "delete",
          oldRange: rangeForText(oldText),
          oldText,
        },
      ],
      moves: [],
      renames: [],
    };
  }

  const oldTokens = tokenize(
    oldText,
    options?.oldRoot,
    options?.oldTokens,
    options?.language
  );
  const newTokens = tokenize(
    newText,
    options?.newRoot,
    options?.newTokens,
    options?.language
  );
  const blocks = diffUnits(oldTokens, newTokens);
  const renames = detectRenames(oldText, newText);
  const renameGroupId = renames[0]?.id;
  const renameMeta = renameGroupId ? { renameGroupId } : undefined;

  const hasStructuralTokens = Boolean(
    options?.oldRoot ||
      options?.newRoot ||
      (options?.oldTokens?.length ?? 0) > 0 ||
      (options?.newTokens?.length ?? 0) > 0
  );
  const useStructuralTokens =
    hasStructuralTokens && options?.language !== "json";
  const shouldDetectMoves =
    options?.detectMoves !== false && options?.language !== "json";
  const moveDetection = shouldDetectMoves
    ? detectMoves(
        blocks,
        oldTokens,
        newTokens,
        oldText,
        newText,
        renameGroupId,
        options?.language
      )
    : ({
        moves: [],
        moveOps: [],
        nestedOps: [],
        usedDeletes: new Set<number>(),
        usedInserts: new Set<number>(),
      } satisfies ReturnType<typeof detectMoves>);

  let opCounter = 1;
  const operations: DiffOperation[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] as UnitBlock;
    if (block.type === "delete" && moveDetection.usedDeletes.has(index)) {
      continue;
    }
    if (block.type === "insert" && moveDetection.usedInserts.has(index)) {
      continue;
    }

    if (block.type === "delete") {
      const next = blocks[index + 1];
      if (
        next &&
        next.type === "insert" &&
        !moveDetection.usedInserts.has(index + 1)
      ) {
        const blockOldText = textForTokens(
          oldText,
          oldTokens,
          block.start,
          block.units.length
        );
        const blockNewText = textForTokens(
          newText,
          newTokens,
          next.start,
          next.units.length
        );
        if (
          !shouldPairDeleteInsert(blockOldText, blockNewText, options?.language)
        ) {
          operations.push({
            id: `op-${opCounter++}`,
            type: "delete",
            oldRange: rangeForTokens(
              oldTokens,
              block.start,
              block.units.length
            ),
            oldText: blockOldText,
            ...(renameMeta ? { meta: renameMeta } : {}),
          });
          continue;
        }
        operations.push({
          id: `op-${opCounter++}`,
          type: "update",
          oldRange: rangeForTokens(oldTokens, block.start, block.units.length),
          newRange: rangeForTokens(newTokens, next.start, next.units.length),
          oldText: blockOldText,
          newText: blockNewText,
          ...(renameMeta ? { meta: renameMeta } : {}),
        });
        index += 1;
        continue;
      }

      operations.push({
        id: `op-${opCounter++}`,
        type: "delete",
        oldRange: rangeForTokens(oldTokens, block.start, block.units.length),
        oldText: textForTokens(
          oldText,
          oldTokens,
          block.start,
          block.units.length
        ),
        ...(renameMeta ? { meta: renameMeta } : {}),
      });
      continue;
    }

    operations.push({
      id: `op-${opCounter++}`,
      type: "insert",
      newRange: rangeForTokens(newTokens, block.start, block.units.length),
      newText: textForTokens(
        newText,
        newTokens,
        block.start,
        block.units.length
      ),
      ...(renameMeta ? { meta: renameMeta } : {}),
    });
  }

  const coalesced = coalesceOperations(operations, oldText, newText);
  const baseOps = useStructuralTokens
    ? coalesced
    : suppressMovedLineOps(coalesced, oldText, newText);
  const combinedOps = baseOps.concat(
    moveDetection.moveOps,
    moveDetection.nestedOps
  );
  const sanitizedOps = isCosmeticLanguage(options?.language)
    ? suppressCosmeticLineMoves(
        suppressCosmeticMoves(suppressCosmeticUpdates(combinedOps)),
        oldText,
        newText
      )
    : combinedOps;
  return {
    version: "0.1.0",
    operations: sanitizedOps,
    moves: moveDetection.moves,
    renames,
  };
}
