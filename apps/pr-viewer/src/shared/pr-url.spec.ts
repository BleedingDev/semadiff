import { describe, expect, it } from "vitest";
import { parsePrUrl } from "./pr-url";

describe("parsePrUrl", () => {
  it("parses full GitHub PR URL", () => {
    expect(parsePrUrl("https://github.com/owner/repo/pull/123")).toEqual({
      owner: "owner",
      repo: "repo",
      number: 123,
    });
  });

  it("parses owner/repo/pull shorthand", () => {
    expect(parsePrUrl("owner/repo/pull/42")).toEqual({
      owner: "owner",
      repo: "repo",
      number: 42,
    });
  });

  it("rejects invalid input", () => {
    expect(parsePrUrl("https://github.com/owner/repo")).toBeNull();
    expect(parsePrUrl("")).toBeNull();
  });
});
