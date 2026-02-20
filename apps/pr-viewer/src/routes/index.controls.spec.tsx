// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => vi.fn(),
}));

vi.mock("../server/pr.server", () => ({
  getAuthStatus: vi.fn(),
  getFileDiff: vi.fn(),
  getPrSummary: vi.fn(),
}));

import { DiffPanelHeader } from "./index";

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
