import {
  isSideEffectImportLine,
  normalizeCosmeticBlock,
  normalizeCosmeticText,
} from "./diff-cosmetic.js";

const PROP_ASSIGN_RE = /^[A-Za-z_$][\w$-]*\s*=/;
const IMPORT_WORD_RE = /\bimport\b/;
const FROM_WORD_RE = /\bfrom\b/;
const LINE_SPLIT_RE = /\r?\n/;
const MOVE_SIGNATURE_CLEAN_RE = /[^A-Za-z0-9_@./-]+/g;

export interface MoveLikeOperation {
  type: string;
  oldText?: string | undefined;
  newText?: string | undefined;
}

function normalizeMoveSignature(text: string) {
  return normalizeCosmeticText(text)
    .replace(MOVE_SIGNATURE_CLEAN_RE, " ")
    .trim();
}

function hasPropAssignment(text: string) {
  return PROP_ASSIGN_RE.test(text);
}

function isCosmeticMoveLine(line: string) {
  if (!line) {
    return false;
  }
  const trimmed = normalizeCosmeticText(line).trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === '"use client"') {
    return true;
  }
  if (trimmed.startsWith("import ")) {
    return !isSideEffectImportLine(trimmed);
  }
  return PROP_ASSIGN_RE.test(trimmed);
}

export function isCosmeticMove(oldText: string, newText: string) {
  const oldNormalized = normalizeCosmeticBlock(oldText);
  const newNormalized = normalizeCosmeticBlock(newText);
  if (oldNormalized === newNormalized) {
    if (oldNormalized.trim().length > 160) {
      return false;
    }
    const lines = oldNormalized
      .split(LINE_SPLIT_RE)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return true;
    }
    if (lines.length === 1 && isCosmeticMoveLine(lines[0] ?? "")) {
      return true;
    }
    const joined = lines.join(" ");
    return IMPORT_WORD_RE.test(joined) || FROM_WORD_RE.test(joined);
  }
  const oldSignature = normalizeMoveSignature(oldText);
  const newSignature = normalizeMoveSignature(newText);
  if (!oldSignature || oldSignature !== newSignature) {
    return false;
  }
  const isImportMove =
    IMPORT_WORD_RE.test(oldSignature) || FROM_WORD_RE.test(oldSignature);
  const maxLength = isImportMove ? 160 : 80;
  if (oldSignature.length > maxLength) {
    return false;
  }
  if (isImportMove) {
    return true;
  }
  return hasPropAssignment(oldText) || hasPropAssignment(newText);
}

export function suppressCosmeticMoves<T extends MoveLikeOperation>(
  operations: T[]
) {
  return operations.filter((op) => {
    if (op.type !== "move") {
      return true;
    }
    if (!(op.oldText && op.newText)) {
      return true;
    }
    return !isCosmeticMove(op.oldText, op.newText);
  });
}
