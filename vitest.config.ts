import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.spec.ts"],
    reporters: "default",
    coverage: {
      provider: "v8",
      all: false,
      reporter: ["text", "json", "html"],
      exclude: [
        "**/*.d.ts",
        "**/dist/**",
        "**/test/**",
        "**/*.test.*",
        "**/*.spec.*",
        "apps/**",
        "e2e/**",
        "scripts/**",
        "tmp/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
