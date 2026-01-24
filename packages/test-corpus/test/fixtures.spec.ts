import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { listFixtures } from "../src/index";

describe("test corpus fixtures", () => {
  test("fixtures resolve to files with content", () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(existsSync(fixture.oldPath)).toBe(true);
      expect(existsSync(fixture.newPath)).toBe(true);
      expect(readFileSync(fixture.oldPath, "utf8").length).toBeGreaterThan(0);
      expect(readFileSync(fixture.newPath, "utf8").length).toBeGreaterThan(0);
    }
  });
});
