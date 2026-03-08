import type { DiffDocument, Range } from "@semadiff/core";

export const ENTITY_LANGUAGES = ["ts", "tsx", "js", "jsx"] as const;
export type EntityLanguage = (typeof ENTITY_LANGUAGES)[number];

export const SEMANTIC_ENTITY_KINDS = [
  "function",
  "class",
  "method",
  "interface",
  "typeAlias",
  "variable",
] as const;
export type SemanticEntityKind = (typeof SEMANTIC_ENTITY_KINDS)[number];

export const ENTITY_CHANGE_KINDS = [
  "added",
  "deleted",
  "modified",
  "moved",
  "renamed",
] as const;
export type EntityChangeKind = (typeof ENTITY_CHANGE_KINDS)[number];

export interface SemanticEntity {
  id: string;
  kind: SemanticEntityKind;
  name: string;
  range: Range;
  path?: string | undefined;
  parentName?: string | undefined;
  exported: boolean;
}

export interface EntityChange {
  id: string;
  kind: SemanticEntityKind;
  before?: SemanticEntity | undefined;
  after?: SemanticEntity | undefined;
  changeKinds: readonly EntityChangeKind[];
  confidence: number;
  linkedOperationIds: readonly string[];
}

export interface EntityDocument {
  old: readonly SemanticEntity[];
  new: readonly SemanticEntity[];
  changes: readonly EntityChange[];
}

export interface HybridDiffDocument {
  diff: DiffDocument;
  entities?: EntityDocument | undefined;
}
