import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { NormalizerLanguage } from "@semadiff/core";
import type {
  EntityChangeKind,
  SemanticEntityKind,
} from "@semadiff/entity-core";
import type {
  BenchmarkCapabilities,
  BenchmarkCase,
  BenchmarkCaseFile,
  BenchmarkCaseSource,
  BenchmarkEntityChangeTruth,
  BenchmarkEntityEndpointTruth,
  BenchmarkEntityTruth,
  BenchmarkFileStatus,
  BenchmarkKind,
  BenchmarkLineRange,
  BenchmarkMoveTruth,
  BenchmarkOperationTruth,
  BenchmarkRenameTruth,
  BenchmarkReviewGuideExpectations,
  BenchmarkReviewGuideFileExpectation,
  BenchmarkTruth,
} from "./types.js";

const entityKinds = [
  "function",
  "class",
  "method",
  "interface",
  "typeAlias",
  "variable",
] as const satisfies readonly SemanticEntityKind[];
const entityChangeKinds = [
  "added",
  "deleted",
  "modified",
  "moved",
  "renamed",
] as const satisfies readonly EntityChangeKind[];
const reviewPriorities = [
  "review_first",
  "review_next",
  "skim",
  "deprioritized",
  "manual_review",
] as const;
const reviewCategories = [
  "source",
  "test",
  "docs",
  "config",
  "generated",
  "lockfile",
  "vendored",
  "binary",
  "oversized",
  "parser_fallback",
  "unknown",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  input: Record<string, unknown>,
  key: string,
  location: string
): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${location}.${key} to be a non-empty string.`);
  }
  return value;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${key} to be a non-empty string when provided.`);
  }
  return value;
}

function readNullableString(
  input: Record<string, unknown>,
  key: string,
  location: string
): string | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${location}.${key} to be a non-empty string.`);
  }
  return value;
}

function readBoolean(
  input: Record<string, unknown>,
  key: string,
  location: string
): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${location}.${key} to be a boolean.`);
  }
  return value;
}

function readInteger(
  input: Record<string, unknown>,
  key: string,
  location: string
): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Expected ${location}.${key} to be an integer.`);
  }
  return value;
}

function readOptionalBoolean(
  input: Record<string, unknown>,
  key: string,
  location: string
) {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${location}.${key} to be a boolean.`);
  }
  return value;
}

function readLineRange(
  value: unknown,
  location: string
): BenchmarkLineRange | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  const startLineValue = value.startLine;
  const endLineValue = value.endLine;
  if (
    typeof startLineValue !== "number" ||
    !Number.isInteger(startLineValue) ||
    startLineValue <= 0
  ) {
    throw new Error(`Expected ${location}.startLine to be a positive integer.`);
  }
  if (
    typeof endLineValue !== "number" ||
    !Number.isInteger(endLineValue) ||
    endLineValue < startLineValue
  ) {
    throw new Error(
      `Expected ${location}.endLine to be an integer >= startLine.`
    );
  }
  return {
    startLine: startLineValue,
    endLine: endLineValue,
  };
}

function resolveFileContent(options: {
  caseDirectory: string;
  inline?: string | undefined;
  relativePath?: string | undefined;
  fallback: string;
}) {
  const { caseDirectory, inline, relativePath, fallback } = options;
  if (inline !== undefined) {
    return inline;
  }
  if (relativePath !== undefined) {
    const absolutePath = resolve(caseDirectory, relativePath);
    return readFileSync(absolutePath, "utf8");
  }
  return fallback;
}

function parseCapabilities(
  value: unknown,
  location: string
): BenchmarkCapabilities {
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  return {
    review: readBoolean(value, "review", location),
    entity: readBoolean(value, "entity", location),
    graph: readBoolean(value, "graph", location),
  };
}

function parseStringArray(
  value: unknown,
  location: string
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(
        `Expected ${location}[${index}] to be a non-empty string.`
      );
    }
    return entry;
  });
}

function parseReviewGuideFileExpectation(
  value: unknown,
  location: string
): BenchmarkReviewGuideFileExpectation {
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  const fileId = readOptionalString(value, "fileId");
  const path = readOptionalString(value, "path");
  const expectedPriority = readOptionalString(value, "expectedPriority");
  const expectedCategory = readOptionalString(value, "expectedCategory");
  if (
    expectedPriority &&
    !reviewPriorities.includes(
      expectedPriority as (typeof reviewPriorities)[number]
    )
  ) {
    throw new Error(
      `Expected ${location}.expectedPriority to be one of ${reviewPriorities.join(", ")}.`
    );
  }
  if (
    expectedCategory &&
    !reviewCategories.includes(
      expectedCategory as (typeof reviewCategories)[number]
    )
  ) {
    throw new Error(
      `Expected ${location}.expectedCategory to be one of ${reviewCategories.join(", ")}.`
    );
  }
  return {
    ...(fileId ? { fileId } : {}),
    ...(path ? { path } : {}),
    ...(expectedPriority
      ? {
          expectedPriority:
            expectedPriority as BenchmarkReviewGuideFileExpectation["expectedPriority"],
        }
      : {}),
    ...(expectedCategory
      ? {
          expectedCategory:
            expectedCategory as BenchmarkReviewGuideFileExpectation["expectedCategory"],
        }
      : {}),
    ...(parseStringArray(
      value.requiredQuestionRuleIds,
      `${location}.requiredQuestionRuleIds`
    )
      ? {
          requiredQuestionRuleIds: parseStringArray(
            value.requiredQuestionRuleIds,
            `${location}.requiredQuestionRuleIds`
          ),
        }
      : {}),
    ...(parseStringArray(
      value.requiredReasonRuleIds,
      `${location}.requiredReasonRuleIds`
    )
      ? {
          requiredReasonRuleIds: parseStringArray(
            value.requiredReasonRuleIds,
            `${location}.requiredReasonRuleIds`
          ),
        }
      : {}),
    ...(parseStringArray(value.requiredWarnings, `${location}.requiredWarnings`)
      ? {
          requiredWarnings: parseStringArray(
            value.requiredWarnings,
            `${location}.requiredWarnings`
          ),
        }
      : {}),
  };
}

function parseReviewGuideExpectations(
  value: unknown,
  location: string
): BenchmarkReviewGuideExpectations | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  const reviewFirst = parseStringArray(
    value.reviewFirst,
    `${location}.reviewFirst`
  );
  const reviewNext = parseStringArray(
    value.reviewNext,
    `${location}.reviewNext`
  );
  const deprioritized = parseStringArray(
    value.deprioritized,
    `${location}.deprioritized`
  );
  const manualReview = parseStringArray(
    value.manualReview,
    `${location}.manualReview`
  );
  const fileChecks = Array.isArray(value.fileChecks)
    ? value.fileChecks.map((entry, index) =>
        parseReviewGuideFileExpectation(
          entry,
          `${location}.fileChecks[${index}]`
        )
      )
    : undefined;
  return {
    ...(reviewFirst ? { reviewFirst } : {}),
    ...(reviewNext ? { reviewNext } : {}),
    ...(deprioritized ? { deprioritized } : {}),
    ...(manualReview ? { manualReview } : {}),
    ...(fileChecks ? { fileChecks } : {}),
  };
}

function parseCaseSource(
  value: unknown,
  location: string
): BenchmarkCaseSource | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  const kind = readString(value, "kind", location);
  if (kind !== "github-pr") {
    throw new Error(`Expected ${location}.kind to be github-pr.`);
  }
  const collectedAt = readOptionalString(value, "collectedAt");
  const searchTerm = readOptionalString(value, "searchTerm");
  return {
    kind,
    repository: readString(value, "repository", location),
    prNumber: readInteger(value, "prNumber", location),
    prUrl: readString(value, "prUrl", location),
    baseSha: readString(value, "baseSha", location),
    headSha: readString(value, "headSha", location),
    selectedFiles:
      parseStringArray(value.selectedFiles, `${location}.selectedFiles`) ?? [],
    ...(collectedAt ? { collectedAt } : {}),
    ...(searchTerm ? { searchTerm } : {}),
  };
}

function parseOperations(
  value: unknown,
  location: string
): readonly BenchmarkOperationTruth[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${location}[${index}] to be an object.`);
    }
    const type = entry.type;
    if (
      type !== "insert" &&
      type !== "delete" &&
      type !== "update" &&
      type !== "move"
    ) {
      throw new Error(
        `Expected ${location}[${index}].type to be an allowed operation type.`
      );
    }
    const fileId = readOptionalString(entry, "fileId");
    const oldRange = readLineRange(
      entry.oldRange,
      `${location}[${index}].oldRange`
    );
    const newRange = readLineRange(
      entry.newRange,
      `${location}[${index}].newRange`
    );
    return {
      type,
      ...(fileId ? { fileId } : {}),
      ...(oldRange ? { oldRange } : {}),
      ...(newRange ? { newRange } : {}),
    };
  });
}

function parseMoves(
  value: unknown,
  location: string
): readonly BenchmarkMoveTruth[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${location}[${index}] to be an object.`);
    }
    const oldRange = readLineRange(
      entry.oldRange,
      `${location}[${index}].oldRange`
    );
    const newRange = readLineRange(
      entry.newRange,
      `${location}[${index}].newRange`
    );
    if (!(oldRange && newRange)) {
      throw new Error(`Expected ${location}[${index}] to include both ranges.`);
    }
    const fileId = readOptionalString(entry, "fileId");
    return {
      ...(fileId ? { fileId } : {}),
      oldRange,
      newRange,
    };
  });
}

function parseRenames(
  value: unknown,
  location: string
): readonly BenchmarkRenameTruth[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${location}[${index}] to be an object.`);
    }
    const rawOccurrences = entry.occurrences;
    if (
      rawOccurrences !== undefined &&
      (typeof rawOccurrences !== "number" ||
        !Number.isInteger(rawOccurrences) ||
        rawOccurrences <= 0)
    ) {
      throw new Error(
        `Expected ${location}[${index}].occurrences to be a positive integer.`
      );
    }
    const occurrences =
      typeof rawOccurrences === "number" ? rawOccurrences : undefined;
    return {
      from: readString(entry, "from", `${location}[${index}]`),
      to: readString(entry, "to", `${location}[${index}]`),
      ...(occurrences === undefined ? {} : { occurrences }),
    };
  });
}

function parseEntityKind(value: unknown, location: string): SemanticEntityKind {
  if (
    value !== "function" &&
    value !== "class" &&
    value !== "method" &&
    value !== "interface" &&
    value !== "typeAlias" &&
    value !== "variable"
  ) {
    throw new Error(
      `Expected ${location} to be one of ${entityKinds.join(", ")}.`
    );
  }
  return value;
}

function parseEntityChangeKind(
  value: unknown,
  location: string
): EntityChangeKind {
  if (
    value !== "added" &&
    value !== "deleted" &&
    value !== "modified" &&
    value !== "moved" &&
    value !== "renamed"
  ) {
    throw new Error(
      `Expected ${location} to be one of ${entityChangeKinds.join(", ")}.`
    );
  }
  return value;
}

function parseEntityEndpoint(
  value: unknown,
  location: string
): BenchmarkEntityEndpointTruth {
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  const range = readLineRange(value.range, `${location}.range`);
  if (!range) {
    throw new Error(`Expected ${location}.range to be present.`);
  }
  const fileId = readOptionalString(value, "fileId");
  const parentName = readOptionalString(value, "parentName");
  return {
    ...(fileId ? { fileId } : {}),
    kind: parseEntityKind(value.kind, `${location}.kind`),
    name: readString(value, "name", location),
    range,
    ...(parentName ? { parentName } : {}),
    exported: readOptionalBoolean(value, "exported", location) ?? false,
  };
}

function parseEntities(
  value: unknown,
  location: string
): readonly BenchmarkEntityTruth[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${location}[${index}] to be an object.`);
    }
    const side = entry.side;
    if (side !== "old" && side !== "new") {
      throw new Error(`Expected ${location}[${index}].side to be old or new.`);
    }
    return {
      ...parseEntityEndpoint(entry, `${location}[${index}]`),
      side,
    };
  });
}

function parseEntityChanges(
  value: unknown,
  location: string
): readonly BenchmarkEntityChangeTruth[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${location} to be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Expected ${location}[${index}] to be an object.`);
    }
    const before =
      entry.before === undefined
        ? undefined
        : parseEntityEndpoint(entry.before, `${location}[${index}].before`);
    const after =
      entry.after === undefined
        ? undefined
        : parseEntityEndpoint(entry.after, `${location}[${index}].after`);
    if (!(before || after)) {
      throw new Error(
        `Expected ${location}[${index}] to define before, after, or both.`
      );
    }
    const rawChangeKinds = entry.changeKinds;
    if (!Array.isArray(rawChangeKinds) || rawChangeKinds.length === 0) {
      throw new Error(
        `Expected ${location}[${index}].changeKinds to be a non-empty array.`
      );
    }
    return {
      kind: parseEntityKind(entry.kind, `${location}[${index}].kind`),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      changeKinds: rawChangeKinds.map((kind, changeIndex) =>
        parseEntityChangeKind(
          kind,
          `${location}[${index}].changeKinds[${changeIndex}]`
        )
      ),
    };
  });
}

function parseTruth(value: unknown, location: string): BenchmarkTruth {
  if (!isRecord(value)) {
    throw new Error(`Expected ${location} to be an object.`);
  }
  return {
    operations: parseOperations(value.operations, `${location}.operations`),
    moves: parseMoves(value.moves ?? [], `${location}.moves`),
    renames: parseRenames(value.renames ?? [], `${location}.renames`),
    entities: parseEntities(value.entities ?? [], `${location}.entities`),
    entityChanges: parseEntityChanges(
      value.entityChanges ?? [],
      `${location}.entityChanges`
    ),
    graphEdges: Array.isArray(value.graphEdges) ? value.graphEdges : [],
    impact: Array.isArray(value.impact) ? value.impact : [],
  };
}

function parseLanguage(
  value: unknown,
  location: string
): NormalizerLanguage | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${location} to be a non-empty string.`);
  }
  return value as NormalizerLanguage;
}

function parseFileEntry(
  value: unknown,
  index: number,
  caseDirectory: string,
  benchmarkLanguage: NormalizerLanguage,
  location: string
): BenchmarkCaseFile {
  if (!isRecord(value)) {
    throw new Error(`Expected ${location}[${index}] to be an object.`);
  }
  const status = value.status;
  if (
    status !== "added" &&
    status !== "modified" &&
    status !== "deleted" &&
    status !== "renamed"
  ) {
    throw new Error(
      `Expected ${location}[${index}].status to be an allowed file status.`
    );
  }

  const oldPath = readNullableString(value, "oldPath", `${location}[${index}]`);
  const newPath = readNullableString(value, "newPath", `${location}[${index}]`);
  if (!(oldPath || newPath)) {
    throw new Error(
      `Expected ${location}[${index}] to define oldPath, newPath, or both.`
    );
  }

  const inlineBefore = readOptionalString(value, "before");
  const inlineAfter = readOptionalString(value, "after");
  const beforePath = readOptionalString(value, "beforePath");
  const afterPath = readOptionalString(value, "afterPath");
  if (
    status !== "added" &&
    inlineBefore === undefined &&
    beforePath === undefined
  ) {
    throw new Error(
      `Expected ${location}[${index}] to define before or beforePath.`
    );
  }
  if (
    status !== "deleted" &&
    inlineAfter === undefined &&
    afterPath === undefined
  ) {
    throw new Error(
      `Expected ${location}[${index}] to define after or afterPath.`
    );
  }

  const defaultId = newPath ?? oldPath ?? `file-${index + 1}`;
  const id = readOptionalString(value, "id") ?? defaultId;
  return {
    id,
    oldPath,
    newPath,
    status: status satisfies BenchmarkFileStatus,
    language:
      parseLanguage(value.language, `${location}[${index}].language`) ??
      benchmarkLanguage,
    before: resolveFileContent({
      caseDirectory,
      inline: inlineBefore,
      relativePath: beforePath,
      fallback: "",
    }),
    after: resolveFileContent({
      caseDirectory,
      inline: inlineAfter,
      relativePath: afterPath,
      fallback: "",
    }),
  };
}

function parseKind(value: unknown, location: string): BenchmarkKind {
  if (value !== "micro" && value !== "real" && value !== "research") {
    throw new Error(`Expected ${location} to be a supported benchmark kind.`);
  }
  return value;
}

function validateTruthReferences(benchmarkCase: BenchmarkCase) {
  const fileIds = new Set(benchmarkCase.files.map((file) => file.id));
  const validateFileId = (fileId: string | undefined, location: string) => {
    if (!fileId) {
      if (benchmarkCase.files.length > 1) {
        throw new Error(
          `${location} must declare fileId when a benchmark case has multiple files.`
        );
      }
      return;
    }
    if (!fileIds.has(fileId)) {
      throw new Error(`${location} references unknown fileId "${fileId}".`);
    }
  };

  benchmarkCase.truth.operations.forEach((operation, index) => {
    validateFileId(
      operation.fileId,
      `${benchmarkCase.id}.truth.operations[${index}]`
    );
  });
  benchmarkCase.truth.moves.forEach((move, index) => {
    validateFileId(move.fileId, `${benchmarkCase.id}.truth.moves[${index}]`);
  });
  benchmarkCase.truth.entities.forEach((entity, index) => {
    validateFileId(
      entity.fileId,
      `${benchmarkCase.id}.truth.entities[${index}]`
    );
  });
  benchmarkCase.truth.entityChanges.forEach((change, index) => {
    validateFileId(
      change.before?.fileId,
      `${benchmarkCase.id}.truth.entityChanges[${index}].before`
    );
    validateFileId(
      change.after?.fileId,
      `${benchmarkCase.id}.truth.entityChanges[${index}].after`
    );
  });
}

function parseCaseFile(caseFilePath: string): BenchmarkCase {
  const raw = JSON.parse(readFileSync(caseFilePath, "utf8")) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`Expected ${caseFilePath} to contain an object.`);
  }
  const caseDirectory = resolve(caseFilePath, "..");
  const language = parseLanguage(raw.language, `${caseFilePath}.language`);
  const source = parseCaseSource(raw.source, `${caseFilePath}.source`);
  const reviewGuide = parseReviewGuideExpectations(
    raw.reviewGuide,
    `${caseFilePath}.reviewGuide`
  );
  if (!language) {
    throw new Error(`Expected ${caseFilePath}.language to be present.`);
  }
  const filesValue = raw.files;
  if (!Array.isArray(filesValue) || filesValue.length === 0) {
    throw new Error(`Expected ${caseFilePath}.files to be a non-empty array.`);
  }
  const benchmarkCase: BenchmarkCase = {
    id: readString(raw, "id", caseFilePath),
    language,
    kind: parseKind(raw.kind, `${caseFilePath}.kind`),
    description: readString(raw, "description", caseFilePath),
    files: filesValue.map((value, index) =>
      parseFileEntry(
        value,
        index,
        caseDirectory,
        language,
        `${caseFilePath}.files`
      )
    ),
    truth: parseTruth(raw.truth, `${caseFilePath}.truth`),
    capabilities: parseCapabilities(
      raw.capabilities,
      `${caseFilePath}.capabilities`
    ),
    sourcePath: caseFilePath,
    ...(source ? { source } : {}),
    ...(reviewGuide ? { reviewGuide } : {}),
  };
  validateTruthReferences(benchmarkCase);
  return benchmarkCase;
}

function listCaseFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name)
  );
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCaseFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name === "case.json") {
      files.push(entryPath);
    }
  }
  return files;
}

export function loadBenchmarkCase(caseFilePath: string) {
  const resolvedPath = resolve(caseFilePath);
  return parseCaseFile(resolvedPath);
}

export function loadBenchmarkCases(caseRoot: string) {
  const resolvedRoot = resolve(caseRoot);
  if (!statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Benchmark case root is not a directory: ${resolvedRoot}`);
  }
  const caseFiles = listCaseFiles(resolvedRoot);
  if (caseFiles.length === 0) {
    throw new Error(`No benchmark cases found under ${resolvedRoot}.`);
  }
  return caseFiles.map((caseFilePath) => parseCaseFile(caseFilePath));
}
