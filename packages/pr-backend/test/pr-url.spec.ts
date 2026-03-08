import { describe, expect, it } from "vitest";
import { parsePrUrl } from "../src/pr-url";

describe("parsePrUrl", () => {
  it("parses canonical GitHub pull request URLs with whitespace and suffixes", () => {
    expect(
      parsePrUrl("  https://github.com/semadiff/semadiff/pull/123/files  ")
    ).toEqual({
      owner: "semadiff",
      repo: "semadiff",
      number: 123,
    });
  });

  it("normalizes shorthand owner and repo inputs", () => {
    expect(parsePrUrl("/semadiff/semadiff/pull/987")).toEqual({
      owner: "semadiff",
      repo: "semadiff",
      number: 987,
    });
    expect(parsePrUrl("semadiff/semadiff/pull/654")).toEqual({
      owner: "semadiff",
      repo: "semadiff",
      number: 654,
    });
  });

  it("rejects empty and non-pull-request inputs", () => {
    expect(parsePrUrl("")).toBeNull();
    expect(
      parsePrUrl("https://github.com/semadiff/semadiff/issues/123")
    ).toBeNull();
    expect(parsePrUrl("not-a-github-url")).toBeNull();
  });
});
