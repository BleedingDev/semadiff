import type { DiffOperation, NormalizerLanguage } from "@semadiff/core";
import type {
  EntityChangeKind,
  SemanticEntityKind,
} from "@semadiff/entity-core";

export type BenchmarkKind = "micro" | "real" | "research";

export type BenchmarkFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface BenchmarkCapabilities {
  review: boolean;
  entity: boolean;
  graph: boolean;
}

export interface BenchmarkLineRange {
  startLine: number;
  endLine: number;
}

export interface BenchmarkOperationTruth {
  fileId?: string | undefined;
  type: DiffOperation["type"];
  oldRange?: BenchmarkLineRange | undefined;
  newRange?: BenchmarkLineRange | undefined;
}

export interface BenchmarkMoveTruth {
  fileId?: string | undefined;
  oldRange: BenchmarkLineRange;
  newRange: BenchmarkLineRange;
}

export interface BenchmarkRenameTruth {
  from: string;
  to: string;
  occurrences?: number | undefined;
}

export interface BenchmarkEntityEndpointTruth {
  fileId?: string | undefined;
  kind: SemanticEntityKind;
  name: string;
  range: BenchmarkLineRange;
  parentName?: string | undefined;
  exported: boolean;
}

export interface BenchmarkEntityTruth extends BenchmarkEntityEndpointTruth {
  side: "old" | "new";
}

export interface BenchmarkEntityChangeTruth {
  kind: SemanticEntityKind;
  before?: BenchmarkEntityEndpointTruth | undefined;
  after?: BenchmarkEntityEndpointTruth | undefined;
  changeKinds: readonly EntityChangeKind[];
}

export interface BenchmarkTruth {
  operations: readonly BenchmarkOperationTruth[];
  moves: readonly BenchmarkMoveTruth[];
  renames: readonly BenchmarkRenameTruth[];
  entities: readonly BenchmarkEntityTruth[];
  entityChanges: readonly BenchmarkEntityChangeTruth[];
  graphEdges: readonly unknown[];
  impact: readonly unknown[];
}

export interface BenchmarkCaseFile {
  id: string;
  oldPath: string | null;
  newPath: string | null;
  status: BenchmarkFileStatus;
  language: NormalizerLanguage;
  before: string;
  after: string;
}

export interface BenchmarkCaseSource {
  kind: "github-pr";
  repository: string;
  prNumber: number;
  prUrl: string;
  baseSha: string;
  headSha: string;
  selectedFiles: readonly string[];
  collectedAt?: string | undefined;
  searchTerm?: string | undefined;
}

export interface BenchmarkCase {
  id: string;
  language: NormalizerLanguage;
  kind: BenchmarkKind;
  description: string;
  files: readonly BenchmarkCaseFile[];
  truth: BenchmarkTruth;
  capabilities: BenchmarkCapabilities;
  sourcePath: string;
  source?: BenchmarkCaseSource | undefined;
}

export interface BenchmarkReviewRow {
  fileId: string;
  type: "equal" | "insert" | "delete" | "replace" | "gap" | "hunk" | "move";
  oldLine?: number | null | undefined;
  newLine?: number | null | undefined;
  text?: string | undefined;
  hidden?: number | undefined;
  oldText?: string | undefined;
  newText?: string | undefined;
  header?: string | undefined;
}

export interface ProjectedDiffOperation {
  fileId: string;
  type: DiffOperation["type"];
  oldRange?: BenchmarkLineRange | undefined;
  newRange?: BenchmarkLineRange | undefined;
  moveId?: string | undefined;
  renameGroupId?: string | undefined;
}

export interface ProjectedMove {
  fileId: string;
  oldRange: BenchmarkLineRange;
  newRange: BenchmarkLineRange;
  confidence: number;
  operationIds: readonly string[];
}

export interface ProjectedRename {
  from: string;
  to: string;
  occurrences: number;
  confidence: number;
}

export interface ProjectedEntity {
  id: string;
  fileId: string;
  kind: SemanticEntityKind;
  name: string;
  range: BenchmarkLineRange;
  parentName?: string | undefined;
  path?: string | undefined;
  exported: boolean;
}

export interface ProjectedEntityChange {
  id: string;
  kind: SemanticEntityKind;
  before?: ProjectedEntity | undefined;
  after?: ProjectedEntity | undefined;
  changeKinds: readonly EntityChangeKind[];
  confidence: number;
  linkedOperationIds: readonly string[];
}

export interface BenchmarkToolResult {
  tool: string;
  toolVersion: string;
  caseId: string;
  capabilities: BenchmarkCapabilities;
  result: {
    durationMs: number;
    operations: readonly ProjectedDiffOperation[];
    moves: readonly ProjectedMove[];
    renames: readonly ProjectedRename[];
    reviewRows: readonly BenchmarkReviewRow[];
    entities: {
      old: readonly ProjectedEntity[];
      new: readonly ProjectedEntity[];
    };
    entityChanges: readonly ProjectedEntityChange[];
  };
}

export interface SemadiffBenchmarkResult extends BenchmarkToolResult {
  tool: "semadiff";
}

export interface BenchmarkUnsupportedLane {
  status: "unsupported";
  reason: string;
}

export interface BenchmarkReviewScore {
  status: "scored";
  expectedChangedLines: number;
  actualChangedLines: number;
  matchedChangedLines: number;
  changedLinePrecision: number;
  changedLineRecall: number;
  expectedMoves: number;
  actualMoves: number;
  matchedMoves: number;
  moveRecall: number | null;
  expectedRenames: number;
  actualRenames: number;
  matchedRenames: number;
  renameRecall: number | null;
}

export interface BenchmarkPerformanceScore {
  status: "scored";
  runtimeMs: number;
  operationCount: number;
  moveCount: number;
  renameCount: number;
}

export interface BenchmarkEntityScore {
  status: "scored";
  expectedEntities: number;
  actualEntities: number;
  matchedEntities: number;
  entityPrecision: number;
  entityRecall: number;
  entityF1: number;
  expectedChanges: number;
  actualChanges: number;
  matchedChanges: number;
  changePrecision: number;
  changeRecall: number;
  changeF1: number;
}

export interface BenchmarkCaseEvaluation {
  review: BenchmarkReviewScore | BenchmarkUnsupportedLane;
  entity: BenchmarkEntityScore | BenchmarkUnsupportedLane;
  graph: BenchmarkUnsupportedLane;
  performance: BenchmarkPerformanceScore;
}

export interface BenchmarkCaseReport {
  caseId: string;
  description: string;
  kind: BenchmarkKind;
  capabilities: BenchmarkCapabilities;
  source?: BenchmarkCaseSource | undefined;
  evaluation: BenchmarkCaseEvaluation;
  output: BenchmarkToolResult;
}

export interface BenchmarkReportSummary {
  review: {
    cases: number;
    averagePrecision: number | null;
    averageRecall: number | null;
    averageMoveRecall: number | null;
    averageRenameRecall: number | null;
  };
  performance: {
    cases: number;
    totalRuntimeMs: number;
    medianRuntimeMs: number | null;
    p95RuntimeMs: number | null;
  };
  entity: {
    supportedCases: number;
    unsupportedCases: number;
    averagePrecision: number | null;
    averageRecall: number | null;
    averageF1: number | null;
    averageChangePrecision: number | null;
    averageChangeRecall: number | null;
    averageChangeF1: number | null;
  };
  graph: {
    supportedCases: number;
    unsupportedCases: number;
  };
}

export interface BenchmarkReport {
  version: "0.1.0";
  tool: "semadiff";
  caseRoot: string;
  generatedAt: string;
  cases: readonly BenchmarkCaseReport[];
  summary: BenchmarkReportSummary;
}

export interface BenchmarkComparisonCaseToolReport {
  tool: string;
  toolVersion: string;
  evaluation: BenchmarkCaseEvaluation;
  output: BenchmarkToolResult;
}

export interface BenchmarkComparisonCaseReport {
  caseId: string;
  description: string;
  kind: BenchmarkKind;
  capabilities: BenchmarkCapabilities;
  source?: BenchmarkCaseSource | undefined;
  results: readonly BenchmarkComparisonCaseToolReport[];
}

export interface BenchmarkComparisonToolSummary {
  tool: string;
  toolVersion: string;
  summary: BenchmarkReportSummary;
}

export interface BenchmarkComparisonReport {
  version: "0.1.0";
  caseRoot: string;
  generatedAt: string;
  cases: readonly BenchmarkComparisonCaseReport[];
  tools: readonly BenchmarkComparisonToolSummary[];
}
