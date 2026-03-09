import { describe, expectTypeOf, test } from "vitest";
import type {
  GetFileDiffDocumentInput,
  GetFileDiffInput,
  GetFileReviewGuideInput,
  GetPrReviewSummaryInput,
  GetPrSummaryInput,
  PrDiffClientContract,
  PrDiffClientError,
  PrDiffEffectClientContract,
  PrDiffLineLayout,
  PrDiffLineMode,
  PrDiffResult,
} from "../src/embed-api.js";
import type {
  FileDiffDocument,
  FileDiffPayload,
  FileReviewGuide,
  PrReviewSummary,
  PrSummary,
} from "../src/types.js";

describe("embed API contract", () => {
  test("keeps promise client method signatures stable", () => {
    expectTypeOf<PrDiffClientContract["getPrSummary"]>().toEqualTypeOf<
      (input: GetPrSummaryInput) => Promise<PrDiffResult<PrSummary>>
    >();
    expectTypeOf<PrDiffClientContract["getFileDiff"]>().toEqualTypeOf<
      (input: GetFileDiffInput) => Promise<PrDiffResult<FileDiffPayload>>
    >();
    expectTypeOf<PrDiffClientContract["getFileDiffDocument"]>().toEqualTypeOf<
      (
        input: GetFileDiffDocumentInput
      ) => Promise<PrDiffResult<FileDiffDocument>>
    >();
    expectTypeOf<PrDiffClientContract["getPrReviewSummary"]>().toEqualTypeOf<
      (input: GetPrReviewSummaryInput) => Promise<PrDiffResult<PrReviewSummary>>
    >();
    expectTypeOf<PrDiffClientContract["getFileReviewGuide"]>().toEqualTypeOf<
      (input: GetFileReviewGuideInput) => Promise<PrDiffResult<FileReviewGuide>>
    >();
  });

  test("keeps effect client method signatures stable", () => {
    expectTypeOf<
      PrDiffEffectClientContract["getPrSummary"]
    >().returns.toEqualTypeOf<
      import("effect").Effect<PrSummary, PrDiffClientError>
    >();
    expectTypeOf<
      PrDiffEffectClientContract["getFileDiff"]
    >().returns.toEqualTypeOf<
      import("effect").Effect<FileDiffPayload, PrDiffClientError>
    >();
    expectTypeOf<
      PrDiffEffectClientContract["getFileDiffDocument"]
    >().returns.toEqualTypeOf<
      import("effect").Effect<FileDiffDocument, PrDiffClientError>
    >();
    expectTypeOf<
      PrDiffEffectClientContract["getPrReviewSummary"]
    >().returns.toEqualTypeOf<
      import("effect").Effect<PrReviewSummary, PrDiffClientError>
    >();
    expectTypeOf<
      PrDiffEffectClientContract["getFileReviewGuide"]
    >().returns.toEqualTypeOf<
      import("effect").Effect<FileReviewGuide, PrDiffClientError>
    >();
  });

  test("keeps line-view input controls explicit and optional", () => {
    const input: GetFileDiffInput = {
      prUrl: "https://github.com/owner/repo/pull/123",
      filename: "apps/pr-viewer/src/routes/index.tsx",
    };
    expectTypeOf(input.lineLayout).toEqualTypeOf<
      PrDiffLineLayout | undefined
    >();
    expectTypeOf(input.lineMode).toEqualTypeOf<PrDiffLineMode | undefined>();
    expectTypeOf(input.hideComments).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(input.detectMoves).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(input.contextLines).toEqualTypeOf<number | undefined>();
  });
});
