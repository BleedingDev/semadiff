// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FileDiffPayload } from "../shared/types";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => vi.fn(),
}));

vi.mock("../server/pr.server", () => ({
  getAuthStatus: vi.fn(),
  getFileDiff: vi.fn(),
  getPrSummary: vi.fn(),
}));

import { ChangeTotals, DiffPanelBody, DiffPanelHeader } from "../routes/index";

const REVIEW_CARD_TEXT = /Review changes with/i;

afterEach(() => {
  cleanup();
});

describe("DiffPanelHeader", () => {
  test("does not render removed controls", () => {
    render(
      <DiffPanelHeader
        compareMoves
        hideComments={false}
        lineLayout="unified"
        onCompareMovesChange={vi.fn()}
        onHideCommentsChange={vi.fn()}
        onLineLayoutChange={vi.fn()}
        onRefresh={vi.fn()}
        selectedFile="apps/n1/next.config.ts"
        selectedSummary={null}
        summary={null}
      />
    );

    expect(screen.queryByRole("button", { name: "Ops" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lines" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prev" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
  });

  test("keeps core diff controls visible", () => {
    render(
      <DiffPanelHeader
        compareMoves
        hideComments={false}
        lineLayout="split"
        onCompareMovesChange={vi.fn()}
        onHideCommentsChange={vi.fn()}
        onLineLayoutChange={vi.fn()}
        onRefresh={vi.fn()}
        selectedFile="apps/n1/next.config.ts"
        selectedSummary={null}
        summary={null}
      />
    );

    expect(screen.getAllByRole("button", { name: "Recompute" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Unified" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Split" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Show" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Hide" }).length).toBe(1);
  });
});

describe("ChangeTotals", () => {
  test("renders additions in green and deletions in red", () => {
    render(<ChangeTotals additions={12} deletions={3} />);

    const totals = screen.getByTestId("change-totals");
    expect(within(totals).getByText("+12").className).toContain(
      "sd-count--add"
    );
    expect(within(totals).getByText("-3").className).toContain("sd-count--del");
  });
});

describe("DiffPanelBody", () => {
  test("does not render the legacy reduction card above iframe", () => {
    const diffPayload = {
      file: {
        filename: "apps/n1/next.config.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        changes: 2,
        sha: "abc123",
        warnings: [],
      },
      semanticHtml: "",
      linesHtml: "",
    } as FileDiffPayload;

    render(
      <DiffPanelBody
        diffData={diffPayload}
        diffError={null}
        diffHtml="<html><body><div>ok</div></body></html>"
        diffLoading={false}
        iframeRef={{ current: null }}
      />
    );

    expect(screen.getByTitle("diff-apps/n1/next.config.ts")).toBeDefined();
    expect(screen.queryByText(REVIEW_CARD_TEXT)).toBeNull();
  });
});
