import { describe, expect, test } from "vitest";
import { extractLinePayloadFromHtml, summarizeReports } from "../src/index.js";
import type { BenchmarkCaseReport } from "../src/types.js";

const PAYLOAD_MARKER = "globalThis.__SEMADIFF_DATA__ = ";

describe("benchmark run helpers", () => {
  test("returns empty split payloads for missing or malformed embedded data", () => {
    expect(extractLinePayloadFromHtml("<div>No payload</div>")).toEqual({
      rows: [],
      lineLayout: "split",
    });
    expect(
      extractLinePayloadFromHtml(`<script>${PAYLOAD_MARKER}{}</script>`)
    ).toEqual({
      rows: [],
      lineLayout: "split",
    });
    expect(
      extractLinePayloadFromHtml(`<script>${PAYLOAD_MARKER}  ;</script>`)
    ).toEqual({
      rows: [],
      lineLayout: "split",
    });
    expect(
      extractLinePayloadFromHtml(`<script>${PAYLOAD_MARKER}[];</script>`)
    ).toEqual({
      rows: [],
      lineLayout: "split",
    });
  });

  test("keeps only supported line rows from virtualized HTML payloads", () => {
    const payload = {
      lineLayout: "unified",
      rows: [
        {
          type: "replace",
          oldLine: 1,
          newLine: 2,
          oldText: "before",
          newText: "after",
          header: "@@ -1,1 +2,1 @@",
        },
        {
          type: "move",
          oldLine: "bad",
          newLine: 5,
          text: "kept",
          hidden: Number.POSITIVE_INFINITY,
        },
        42,
        {
          type: "comment",
          oldLine: 3,
          newLine: 3,
        },
      ],
    };

    expect(
      extractLinePayloadFromHtml(
        `<script>${PAYLOAD_MARKER}${JSON.stringify(payload)};</script>`
      )
    ).toEqual({
      lineLayout: "unified",
      rows: [
        {
          fileId: "",
          type: "replace",
          oldLine: 1,
          newLine: 2,
          text: undefined,
          hidden: undefined,
          oldText: "before",
          newText: "after",
          header: "@@ -1,1 +2,1 @@",
        },
        {
          fileId: "",
          type: "move",
          oldLine: null,
          newLine: 5,
          text: "kept",
          hidden: undefined,
          oldText: undefined,
          newText: undefined,
          header: undefined,
        },
      ],
    });
  });

  test("summarizes unsupported review and entity lanes without inventing averages", () => {
    const reports: BenchmarkCaseReport[] = [
      {
        caseId: "case-1",
        description: "Unsupported entity and review lanes",
        kind: "micro",
        capabilities: { review: false, entity: false, graph: false },
        evaluation: {
          review: { status: "unsupported", reason: "no review" },
          entity: { status: "unsupported", reason: "no entity" },
          graph: { status: "unsupported", reason: "no graph" },
          performance: {
            status: "scored",
            runtimeMs: 5,
            operationCount: 1,
            moveCount: 0,
            renameCount: 0,
          },
        },
        output: {
          tool: "fixture",
          toolVersion: "1.0.0",
          caseId: "case-1",
          capabilities: { review: false, entity: false, graph: false },
          result: {
            durationMs: 5,
            operations: [],
            moves: [],
            renames: [],
            entities: { old: [], new: [] },
            entityChanges: [],
            reviewRows: [],
          },
        },
      },
      {
        caseId: "case-2",
        description: "Unsupported entity and review lanes",
        kind: "micro",
        capabilities: { review: false, entity: false, graph: false },
        evaluation: {
          review: { status: "unsupported", reason: "no review" },
          entity: { status: "unsupported", reason: "no entity" },
          graph: { status: "unsupported", reason: "no graph" },
          performance: {
            status: "scored",
            runtimeMs: 15,
            operationCount: 2,
            moveCount: 1,
            renameCount: 0,
          },
        },
        output: {
          tool: "fixture",
          toolVersion: "1.0.0",
          caseId: "case-2",
          capabilities: { review: false, entity: false, graph: false },
          result: {
            durationMs: 15,
            operations: [],
            moves: [],
            renames: [],
            entities: { old: [], new: [] },
            entityChanges: [],
            reviewRows: [],
          },
        },
      },
    ];

    expect(summarizeReports(reports)).toEqual({
      review: {
        cases: 0,
        averagePrecision: null,
        averageRecall: null,
        averageMoveRecall: null,
        averageRenameRecall: null,
      },
      performance: {
        cases: 2,
        totalRuntimeMs: 20,
        medianRuntimeMs: 5,
        p95RuntimeMs: 15,
      },
      entity: {
        supportedCases: 0,
        unsupportedCases: 2,
        averagePrecision: null,
        averageRecall: null,
        averageF1: null,
        averageChangePrecision: null,
        averageChangeRecall: null,
        averageChangeF1: null,
      },
      graph: {
        supportedCases: 0,
        unsupportedCases: 2,
      },
    });
  });
});
