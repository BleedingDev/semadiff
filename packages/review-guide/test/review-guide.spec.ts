import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DiffDocumentSchema, structuralDiff } from "@semadiff/core";
import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildReviewDiagnostics,
  classifyReviewFile,
  composeFileReviewGuide,
  FileReviewGuideComposer,
  formatReviewDiagnosticsText,
  REVIEW_GUIDE_RULE_VERSION,
  REVIEW_GUIDE_SCHEMA_VERSION,
  ReviewClassifier,
  ReviewContextSchema,
  ReviewDiagnosticsFormatter,
  ReviewDiagnosticsSchema,
  ReviewGuideConfigurationError,
  ReviewGuideDecodeError,
  ReviewGuideLive,
  ReviewGuideRuleError,
  ReviewPrioritizationInputSchema,
  ReviewPrioritizer,
  summarizePrReview,
} from "../src/index.js";

const coreFixturesDir = join(import.meta.dirname, "../../core/test/fixtures");

const readCoreFixturePair = (name: string) => ({
  oldText: readFileSync(join(coreFixturesDir, name, "old.ts"), "utf8"),
  newText: readFileSync(join(coreFixturesDir, name, "new.ts"), "utf8"),
});

describe("review-guide schemas", () => {
  it("decodes review context payloads", () => {
    const decoded = Schema.decodeUnknownSync(ReviewContextSchema)({
      title: "Add deterministic review guidance",
      body: "This PR wires the new review package.",
      labels: ["review-guide", "effect-v4"],
      author: "satan",
      baseRef: "main",
      headRef: "feat/review-guide",
      commitHeadlines: ["feat: scaffold review guide package"],
    });

    expect(decoded).toEqual({
      title: "Add deterministic review guidance",
      body: "This PR wires the new review package.",
      labels: ["review-guide", "effect-v4"],
      author: "satan",
      baseRef: "main",
      headRef: "feat/review-guide",
      commitHeadlines: ["feat: scaffold review guide package"],
    });
  });

  it("rejects malformed prioritization payloads", () => {
    expect(() =>
      Schema.decodeUnknownSync(ReviewPrioritizationInputSchema)({
        context: {
          title: "broken",
          labels: [],
          commitHeadlines: [],
        },
        files: [
          {
            filename: "src/index.ts",
            status: "bogus",
          },
        ],
      })
    ).toThrowError();
  });

  it("round-trips diagnostics payloads", () => {
    const diagnostics = {
      version: REVIEW_GUIDE_SCHEMA_VERSION,
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      ruleHits: [
        {
          ruleId: "rule-1",
          stage: "classification",
          summary: "Default classifier fallback.",
          evidence: [
            {
              kind: "file_summary",
              id: "file-1",
              file: "src/index.ts",
              label: "src/index.ts",
            },
          ],
        },
      ],
      scoreBreakdown: [
        {
          id: "score-1",
          file: "src/index.ts",
          label: "baseline",
          score: 0,
        },
      ],
      evidenceIndex: [
        {
          kind: "file_summary",
          id: "file-1",
          file: "src/index.ts",
          label: "src/index.ts",
        },
      ],
      traceSummary: {
        ruleHitCount: 1,
        scoreEntryCount: 1,
        evidenceCount: 1,
      },
      consistency: {
        missingRuleIds: [],
        emptyEvidenceOwners: [],
        warnings: [],
      },
      trustBandCounts: {
        structuralFact: 0,
        deterministicInference: 1,
        contextualHint: 0,
        lowConfidence: 0,
      },
    };

    const encoded = Schema.encodeSync(ReviewDiagnosticsSchema)(diagnostics);
    const decoded = Schema.decodeUnknownSync(ReviewDiagnosticsSchema)(encoded);

    expect(decoded).toEqual(diagnostics);
  });
});

describe("review-guide tagged errors", () => {
  it("preserves decode error fields", () => {
    const error = new ReviewGuideDecodeError({
      schema: "ReviewContextSchema",
      message: "title is required",
    });

    expect(error._tag).toBe("ReviewGuideDecodeError");
    expect(error.schema).toBe("ReviewContextSchema");
    expect(error.message).toContain("title");
  });

  it("preserves rule and configuration error fields", () => {
    const ruleError = new ReviewGuideRuleError({
      ruleId: "rule-unknown",
      message: "Unsupported rule.",
    });
    const configError = new ReviewGuideConfigurationError({
      field: "ruleVersion",
      message: "Missing rule version",
    });

    expect(ruleError.ruleId).toBe("rule-unknown");
    expect(configError.field).toBe("ruleVersion");
  });
});

describe("review-guide diagnostics", () => {
  it("builds evidence indexes and consistency warnings", () => {
    const diagnostics = buildReviewDiagnostics({
      expectedRuleIds: ["guidance:present", "guidance:missing"],
      ruleHits: [
        {
          ruleId: "guidance:present",
          stage: "guidance",
          summary: "Present rule hit.",
          evidence: [
            {
              kind: "operation",
              id: "op-1",
              file: "src/index.ts",
              label: "update op-1",
            },
          ],
        },
      ],
      scoreBreakdown: [
        {
          id: "score-1",
          file: "src/index.ts",
          label: "baseline",
          score: 10,
        },
      ],
      traceCollections: [
        {
          owner: "reason:guidance:present:src/index.ts",
          refs: [
            {
              kind: "operation",
              id: "op-1",
              file: "src/index.ts",
              label: "update op-1",
            },
          ],
        },
        {
          owner: "question:question:empty:src/index.ts",
          refs: [],
        },
      ],
      trustBands: ["deterministic_inference", "low_confidence"],
    });

    expect(diagnostics.evidenceIndex).toEqual([
      {
        kind: "operation",
        id: "op-1",
        file: "src/index.ts",
        label: "update op-1",
      },
    ]);
    expect(diagnostics.traceSummary).toEqual({
      ruleHitCount: 1,
      scoreEntryCount: 1,
      evidenceCount: 1,
    });
    expect(diagnostics.consistency.missingRuleIds).toEqual([
      "guidance:missing",
    ]);
    expect(diagnostics.consistency.emptyEvidenceOwners).toEqual([
      "question:question:empty:src/index.ts",
    ]);
    expect(
      diagnostics.consistency.warnings.some((warning) =>
        warning.includes("guidance:missing")
      )
    ).toBe(true);
  });

  it("formats diagnostics for bug reports and developer inspection", () => {
    const text = formatReviewDiagnosticsText({
      version: REVIEW_GUIDE_SCHEMA_VERSION,
      ruleVersion: REVIEW_GUIDE_RULE_VERSION,
      ruleHits: [
        {
          ruleId: "guidance:test",
          stage: "guidance",
          summary: "Test rule hit.",
          evidence: [
            {
              kind: "warning",
              id: "warning:1",
              file: "src/index.ts",
              label: "NO SEMANTIC PARSER",
            },
          ],
        },
      ],
      scoreBreakdown: [
        {
          id: "score-1",
          file: "src/index.ts",
          label: "baseline",
          score: 4,
        },
      ],
      evidenceIndex: [
        {
          kind: "warning",
          id: "warning:1",
          file: "src/index.ts",
          label: "NO SEMANTIC PARSER",
        },
      ],
      traceSummary: {
        ruleHitCount: 1,
        scoreEntryCount: 1,
        evidenceCount: 1,
      },
      consistency: {
        missingRuleIds: [],
        emptyEvidenceOwners: [],
        warnings: [],
      },
      trustBandCounts: {
        structuralFact: 0,
        deterministicInference: 1,
        contextualHint: 0,
        lowConfidence: 0,
      },
    });

    expect(text).toContain("review-guide diagnostics");
    expect(text).toContain("guidance:test");
    expect(text).toContain("score breakdown:");
    expect(text).toContain("evidence index:");
  });
});

describe("review-guide file classification", () => {
  it("classifies common file categories deterministically", () => {
    expect(
      classifyReviewFile({
        filename: "pnpm-lock.yaml",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "lockfile",
      categories: ["lockfile"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: "src/user/user.spec.ts",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "test",
      categories: ["test"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: "docs/architecture.md",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "docs",
      categories: ["docs"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: ".github/workflows/ci.yml",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "config",
      categories: ["config"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: "vendor/acme/lib/index.ts",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "vendored",
      categories: ["vendored"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: "dist/app.generated.js",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "generated",
      categories: ["generated"],
      trustBand: "deterministic_inference",
    });
  });

  it("applies precedence and confidence rules correctly", () => {
    expect(
      classifyReviewFile({
        filename: "vendor/dist/generated.snap",
        status: "modified",
      })
    ).toMatchObject({
      primaryCategory: "vendored",
      categories: ["vendored"],
      trustBand: "deterministic_inference",
    });

    expect(
      classifyReviewFile({
        filename: "src/parser.ts",
        status: "modified",
        warnings: ["NO SEMANTIC PARSER for parser.ts"],
      })
    ).toMatchObject({
      primaryCategory: "source",
      categories: ["source", "parser_fallback"],
      trustBand: "low_confidence",
    });

    expect(
      classifyReviewFile({
        filename: "assets/logo.png",
        status: "modified",
        binary: true,
      })
    ).toMatchObject({
      primaryCategory: "binary",
      categories: ["binary"],
      trustBand: "structural_fact",
    });

    expect(
      classifyReviewFile({
        filename: "src/huge.ts",
        status: "modified",
        oversized: true,
      })
    ).toMatchObject({
      primaryCategory: "oversized",
      categories: ["oversized"],
      trustBand: "structural_fact",
    });
  });
});

describe("review-guide PR prioritization", () => {
  it("builds a deterministic queue, manual-review bucket, and deprioritized groups", () => {
    const summary = summarizePrReview({
      files: [
        {
          filename: "src/parser.ts",
          status: "modified",
          changes: 8,
          warnings: ["NO SEMANTIC PARSER for parser.ts"],
        },
        {
          filename: "src/core.ts",
          status: "modified",
          changes: 42,
          language: "typescript",
          moveCount: 1,
          renameCount: 1,
          operations: 4,
          reductionPercent: 64,
        },
        {
          filename: "assets/logo.png",
          status: "modified",
          binary: true,
        },
        {
          filename: ".github/workflows/ci.yml",
          status: "modified",
          changes: 6,
        },
        {
          filename: "docs/guide.md",
          status: "modified",
          changes: 12,
        },
        {
          filename: "pnpm-lock.yaml",
          status: "modified",
          changes: 120,
        },
      ],
    });

    expect(summary.queue.map((entry) => entry.filename)).toEqual([
      "src/core.ts",
      "src/parser.ts",
      "assets/logo.png",
      ".github/workflows/ci.yml",
    ]);
    expect(summary.queue.map((entry) => entry.priority)).toEqual([
      "review_first",
      "review_first",
      "manual_review",
      "review_next",
    ]);
    expect(summary.deprioritized.map((entry) => entry.filename)).toEqual([
      "docs/guide.md",
      "pnpm-lock.yaml",
    ]);
    expect(summary.deprioritizedGroups).toEqual([
      {
        id: "docs",
        label: "Docs Only",
        entries: [summary.deprioritized[0]],
      },
      {
        id: "lockfile",
        label: "Lockfiles",
        entries: [summary.deprioritized[1]],
      },
    ]);
    expect(summary.warnings).toContain(
      "1 file(s) fell back to low-confidence semantic parsing."
    );
    expect(summary.warnings).toContain(
      "1 file(s) require manual/native review because they are binary or oversized."
    );
    expect(summary.warnings).toContain(
      "3 file(s) are missing semantic summary metadata; prioritization is using path and churn heuristics only."
    );
    expect(summary.warnings).toContain(
      "Source changes are present without matching test-file changes in the PR."
    );
    expect(summary.themes).toContain("2 file(s) should be reviewed first.");
    expect(summary.themes).toContain(
      "1 file(s) include semantic move or rename signals."
    );
    expect(
      summary.diagnostics?.scoreBreakdown.some((entry) => entry.file)
    ).toBe(true);
    expect(summary.diagnostics?.consistency.warnings).toEqual([]);
  });

  it("uses alphabetical tie-breaks when scores are identical", () => {
    const summary = summarizePrReview({
      files: [
        {
          filename: "tests/zeta.spec.ts",
          status: "modified",
          changes: 8,
        },
        {
          filename: "tests/alpha.spec.ts",
          status: "modified",
          changes: 8,
        },
      ],
    });

    expect(summary.queue.map((entry) => entry.filename)).toEqual([
      "tests/alpha.spec.ts",
      "tests/zeta.spec.ts",
    ]);
    expect(
      summary.queue.every((entry) => entry.priority === "review_next")
    ).toBe(true);
  });

  it("handles all-generated PRs as a degraded deprioritized-only case", () => {
    const summary = summarizePrReview({
      files: [
        {
          filename: "dist/app.generated.js",
          status: "modified",
          changes: 200,
        },
        {
          filename: "build/server.min.js",
          status: "modified",
          changes: 80,
        },
      ],
    });

    expect(summary.queue).toEqual([]);
    expect(summary.deprioritized.map((entry) => entry.filename)).toEqual([
      "build/server.min.js",
      "dist/app.generated.js",
    ]);
    expect(summary.deprioritizedGroups).toEqual([
      {
        id: "generated",
        label: "Generated Artifacts",
        entries: summary.deprioritized,
      },
    ]);
    expect(summary.warnings).toContain(
      "All changed files matched deprioritized buckets; verify the PR is mostly generated, vendored, lockfile, or docs churn."
    );
  });
});

describe("review-guide file guide composition", () => {
  it("emits evidence-backed move and rename guidance for refactor-like diffs", () => {
    const diff = Schema.decodeUnknownSync(DiffDocumentSchema)({
      version: "0.1.0",
      operations: [
        {
          id: "move-1",
          type: "move",
          oldRange: {
            start: { line: 1, column: 1 },
            end: { line: 4, column: 1 },
          },
          newRange: {
            start: { line: 10, column: 1 },
            end: { line: 13, column: 1 },
          },
          oldText:
            "export function compute(foo: number) {\n  return foo + foo;\n}\n",
          newText:
            "export function compute(bar: number) {\n  return bar + bar;\n}\n",
          meta: {
            confidence: 0.92,
            moveId: "move-1",
            renameGroupId: "rename-1",
          },
        },
        {
          id: "move-1-update-1",
          type: "update",
          oldRange: {
            start: { line: 2, column: 3 },
            end: { line: 2, column: 19 },
          },
          newRange: {
            start: { line: 11, column: 3 },
            end: { line: 11, column: 19 },
          },
          oldText: "return foo + foo;",
          newText: "return bar + bar;",
          meta: {
            confidence: 0.92,
            moveId: "move-1",
            renameGroupId: "rename-1",
          },
        },
      ],
      moves: [
        {
          id: "move-1",
          oldRange: {
            start: { line: 1, column: 1 },
            end: { line: 4, column: 1 },
          },
          newRange: {
            start: { line: 10, column: 1 },
            end: { line: 13, column: 1 },
          },
          confidence: 0.92,
          operations: ["move-1", "move-1-update-1"],
        },
      ],
      renames: [
        {
          id: "rename-1",
          from: "foo",
          to: "bar",
          occurrences: 3,
          confidence: 0.38,
        },
      ],
    });

    const guide = composeFileReviewGuide({
      file: {
        filename: "src/compute.ts",
        status: "modified",
        changes: 18,
        language: "typescript",
        moveCount: 1,
        renameCount: 1,
        operations: 2,
        reductionPercent: 61,
      },
      classification: classifyReviewFile({
        filename: "src/compute.ts",
        status: "modified",
      }),
      diff,
    });

    expect(guide.priority).toBe("review_first");
    expect(guide.summary).toBe(
      "Refactor-oriented change with move and rename signals."
    );
    expect(guide.reasons.map((reason) => reason.ruleId)).toEqual(
      expect.arrayContaining([
        "guidance:moves",
        "guidance:renames",
        "guidance:operation_shape",
      ])
    );
    expect(guide.questions.map((question) => question.suggestedAction)).toEqual(
      expect.arrayContaining([
        "inspect_moves",
        "inspect_renames",
        "check_tests",
      ])
    );
    expect(
      guide.reasons
        .flatMap((reason) => reason.evidence)
        .some(
          (evidence) =>
            evidence.id === "move-1" &&
            evidence.oldLineSpan?.startLine === 1 &&
            evidence.newLineSpan?.startLine === 10
        )
    ).toBe(true);
    expect(guide.diagnostics?.evidenceIndex.length).toBeGreaterThan(0);
    expect(guide.diagnostics?.consistency.warnings).toEqual([]);
  });

  it("propagates low-confidence parser-fallback guidance", () => {
    const diff = Schema.decodeUnknownSync(DiffDocumentSchema)({
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "update",
          oldRange: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 20 },
          },
          newRange: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 28 },
          },
          oldText: "const value = foo();",
          newText: "const value = parse(foo());",
        },
      ],
      moves: [],
      renames: [],
    });

    const file = {
      filename: "src/parser.ts",
      status: "modified" as const,
      changes: 8,
      warnings: ["NO SEMANTIC PARSER — fallback is text-based."],
    };

    const guide = composeFileReviewGuide({
      file,
      classification: classifyReviewFile(file),
      diff,
    });

    expect(guide.priority).toBe("review_first");
    expect(
      guide.reasons.some(
        (reason) => reason.ruleId === "guidance:parser_fallback"
      )
    ).toBe(true);
    expect(
      guide.questions.some(
        (question) =>
          question.ruleId === "question:parser_fallback" &&
          question.trustBand === "low_confidence" &&
          question.suggestedAction === "open_native_diff"
      )
    ).toBe(true);
    expect(guide.diagnostics?.trustBandCounts.lowConfidence).toBeGreaterThan(0);
    expect(guide.diagnostics?.consistency.warnings).toEqual([]);
  });

  it("marks whitespace-only updates as likely cosmetic", () => {
    const diff = Schema.decodeUnknownSync(DiffDocumentSchema)({
      version: "0.1.0",
      operations: [
        {
          id: "op-1",
          type: "update",
          oldRange: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 21 },
          },
          newRange: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 24 },
          },
          oldText: "export const value=1;",
          newText: "export const value = 1;",
        },
      ],
      moves: [],
      renames: [],
    });

    const guide = composeFileReviewGuide({
      file: {
        filename: "src/format.ts",
        status: "modified",
        changes: 1,
      },
      classification: classifyReviewFile({
        filename: "src/format.ts",
        status: "modified",
      }),
      diff,
    });

    expect(guide.summary).toBe(
      "Likely cosmetic update with whitespace-only structural edits."
    );
    expect(
      guide.questions.some(
        (question) => question.suggestedAction === "skip_by_default"
      )
    ).toBe(true);
  });

  it("emits manual-review guidance for oversized or binary files", () => {
    const diff = Schema.decodeUnknownSync(DiffDocumentSchema)({
      version: "0.1.0",
      operations: [],
      moves: [],
      renames: [],
    });

    const file = {
      filename: "assets/logo.png",
      status: "modified" as const,
      binary: true,
      warnings: ["BINARY FILE — semantic diff is unavailable for this file."],
    };

    const guide = composeFileReviewGuide({
      file,
      classification: classifyReviewFile(file),
      diff,
    });

    expect(guide.priority).toBe("manual_review");
    expect(guide.summary).toBe(
      "Manual native review recommended because semantic guidance is limited."
    );
    expect(
      guide.questions.some(
        (question) =>
          question.ruleId === "question:manual_review" &&
          question.suggestedAction === "open_native_diff" &&
          question.trustBand === "structural_fact"
      )
    ).toBe(true);
  });

  it("stays stable on the core move fixture", () => {
    const fixture = readCoreFixturePair("move");
    const diff = structuralDiff(fixture.oldText, fixture.newText, {
      language: "ts",
    });

    const guide = composeFileReviewGuide({
      file: {
        filename: "src/move.ts",
        status: "modified",
        changes: 12,
        language: "typescript",
        moveCount: diff.moves.length,
        renameCount: diff.renames.length,
        operations: diff.operations.length,
      },
      classification: classifyReviewFile({
        filename: "src/move.ts",
        status: "modified",
      }),
      diff,
    });

    expect({
      priority: guide.priority,
      summary: guide.summary,
      reasonRuleIds: guide.reasons.map((reason) => reason.ruleId),
      questionActions: guide.questions.map(
        (question) => question.suggestedAction
      ),
    }).toEqual({
      priority: "review_first",
      summary: "Refactor-oriented change with semantic move groups.",
      reasonRuleIds: [
        "guidance:classification:source",
        "guidance:operation_shape",
        "guidance:moves",
      ],
      questionActions: ["inspect_moves", "check_tests"],
    });
  });
});

describe("review-guide live services", () => {
  it("provides classifier, prioritizer, composer, and formatter through one layer", async () => {
    const program = Effect.gen(function* () {
      const classifier = yield* ReviewClassifier;
      const prioritizer = yield* ReviewPrioritizer;
      const composer = yield* FileReviewGuideComposer;
      const formatter = yield* ReviewDiagnosticsFormatter;

      const classification = yield* classifier.classifyFile({
        filename: "src/index.ts",
        status: "modified",
        warnings: ["NO SEMANTIC PARSER"],
      });

      const summary = yield* prioritizer.summarizePr({
        files: [
          {
            filename: "src/index.ts",
            status: "modified",
            changes: 16,
          },
        ],
      });

      const diff = Schema.decodeUnknownSync(DiffDocumentSchema)({
        version: "0.1.0",
        operations: [],
        moves: [],
        renames: [],
      });

      const guide = yield* composer.composeFileGuide({
        file: {
          filename: "src/index.ts",
          status: "modified",
          warnings: ["NO SEMANTIC PARSER"],
        },
        classification,
        diff,
      });

      const diagnosticsText = yield* formatter.formatDiagnostics({
        version: REVIEW_GUIDE_SCHEMA_VERSION,
        ruleVersion: REVIEW_GUIDE_RULE_VERSION,
        ruleHits: [],
        scoreBreakdown: [],
        evidenceIndex: [],
        traceSummary: {
          ruleHitCount: 0,
          scoreEntryCount: 0,
          evidenceCount: 0,
        },
        consistency: {
          missingRuleIds: [],
          emptyEvidenceOwners: [],
          warnings: [],
        },
        trustBandCounts: {
          structuralFact: 0,
          deterministicInference: 0,
          contextualHint: 0,
          lowConfidence: 1,
        },
      });

      return { classification, summary, guide, diagnosticsText };
    }).pipe(Effect.provide(ReviewGuideLive));

    const result = await Effect.runPromise(program);

    expect(result.classification.primaryCategory).toBe("source");
    expect(result.classification.categories).toEqual([
      "source",
      "parser_fallback",
    ]);
    expect(result.summary.version).toBe(REVIEW_GUIDE_SCHEMA_VERSION);
    expect(result.summary.queue).toHaveLength(1);
    expect(result.summary.queue[0]?.priority).toBe("review_first");
    expect(result.guide.filename).toBe("src/index.ts");
    expect(result.guide.summary).toContain(
      "Structured update touching 0 operation"
    );
    expect(result.guide.reasons.length).toBeGreaterThan(0);
    expect(result.guide.diagnostics?.consistency.warnings).toEqual([]);
    expect(result.summary.diagnostics?.consistency.warnings).toEqual([]);
    expect(result.diagnosticsText).toContain("review-guide diagnostics");
    expect(result.diagnosticsText).toContain(REVIEW_GUIDE_RULE_VERSION);
  });

  it("allows selective layer provisioning when needed", async () => {
    const program = Effect.gen(function* () {
      const classifier = yield* ReviewClassifier;
      return yield* classifier.classifyFile({
        filename: "README.md",
        status: "modified",
      });
    }).pipe(Effect.provide(Layer.provideMerge(ReviewGuideLive, Layer.empty)));

    const result = await Effect.runPromise(program);
    expect(result.categories).toEqual(["docs"]);
  });
});
