// @vitest-environment jsdom

import type {
  FileDiffPayload,
  PrDiffResult,
  PrSummary,
} from "@semadiff/pr-backend";
import {
  ChangeTotals,
  findFirstChangedLine,
  focusFirstDiffChange,
  SemaDiffExplorer,
  scrollDiffDocumentToFirstChange,
} from "@semadiff/react-ui";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const SUMMARY_FIXTURE: PrSummary = {
  pr: {
    title: "Refactor checkout flow",
    url: "https://github.com/NMIT-WR/new-engine/pull/237",
    baseSha: "base-sha",
    headSha: "head-sha",
    additions: 34,
    deletions: 254,
    changedFiles: 1,
  },
  files: [
    {
      filename: "apps/n1/next.config.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      changes: 2,
      sha: "abc123",
    },
  ],
};

const DIFF_FIXTURE: FileDiffPayload = {
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
  linesHtml: "<html><body><div>ok</div></body></html>",
};

const ok = <T,>(data: T): PrDiffResult<T> => ({ ok: true, data });

const createClient = () => ({
  getPrSummary: vi.fn(async () => ok(SUMMARY_FIXTURE)),
  getFileDiff: vi.fn(async () => ok(DIFF_FIXTURE)),
});

const REVIEW_CARD_TEXT = /Review changes with/i;

afterEach(() => {
  cleanup();
});

describe("SemaDiffExplorer controls", () => {
  test("does not render removed controls", async () => {
    const client = createClient();

    render(
      <SemaDiffExplorer
        client={client}
        contextLines={-1}
        prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
      />
    );

    await waitFor(() => expect(client.getPrSummary).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: "Ops" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lines" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prev" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Raw" })).toBeNull();
  });

  test("keeps core diff controls visible", async () => {
    const client = createClient();

    render(
      <SemaDiffExplorer
        client={client}
        contextLines={-1}
        prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
      />
    );

    await waitFor(() => expect(client.getPrSummary).toHaveBeenCalledTimes(1));

    expect(screen.getAllByRole("button", { name: "Recompute" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Unified" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Split" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Show" }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Hide" }).length).toBe(1);
  });

  test("does not render the legacy reduction card above iframe", async () => {
    const client = createClient();

    render(
      <SemaDiffExplorer
        client={client}
        contextLines={-1}
        prUrl="https://github.com/NMIT-WR/new-engine/pull/237"
      />
    );

    await waitFor(() => expect(client.getFileDiff).toHaveBeenCalledTimes(1));

    expect(screen.getByTitle("diff-apps/n1/next.config.ts")).toBeDefined();
    expect(screen.queryByText(REVIEW_CARD_TEXT)).toBeNull();
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

describe("Diff auto-focus", () => {
  test("finds the first changed line in document order", () => {
    const doc = document.implementation.createHTMLDocument("diff");
    doc.body.innerHTML = `
      <div class="sd-line sd-line--equal"></div>
      <div class="sd-line sd-line--delete"></div>
      <div class="sd-line sd-line--insert"></div>
    `;

    const first = findFirstChangedLine(doc);
    expect(first?.className).toContain("sd-line--delete");
  });

  test("scrolls the first changed line into view", () => {
    const doc = document.implementation.createHTMLDocument("diff");
    doc.body.innerHTML = `
      <div class="sd-line sd-line--equal"></div>
      <div class="sd-line sd-line--replace"></div>
    `;
    const first = doc.querySelector(".sd-line--replace") as HTMLElement;
    const spy = vi.fn();
    first.scrollIntoView = spy;

    const didScroll = scrollDiffDocumentToFirstChange(doc);
    expect(didScroll).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("focusFirstDiffChange returns false when iframe is missing", () => {
    expect(focusFirstDiffChange(null)).toBe(false);
  });
});
