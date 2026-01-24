import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.spec.ts"],
    reporters: "default",
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "html"],
    thresholds: {
      lines: 1,
      functions: 1,
      branches: 1,
      statements: 1,
    },
  },
});
