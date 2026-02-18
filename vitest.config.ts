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
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
