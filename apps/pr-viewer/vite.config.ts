import { fileURLToPath, URL } from "node:url";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig(({ mode }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  const isBun =
    typeof process !== "undefined" && Boolean(process.versions?.bun);
  const enableNitro =
    !(isTest || isBun) && process.env.NITRO_DISABLED !== "true";
  const devtoolsEnabled = process.env.TANSTACK_DEVTOOLS_DISABLED !== "true";
  const devtoolsPort = Number(process.env.TANSTACK_DEVTOOLS_PORT ?? 42_070);
  if (isBun) {
    process.stderr.write(
      "[pr-viewer] Bun runtime detected: Nitro is disabled for dev server compatibility.\n"
    );
  }
  return {
    assetsInclude: ["**/*.node"],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    ssr: {
      noExternal: ["@tanstack/start-server-core"],
      external: [
        "@semadiff/core",
        "@semadiff/parsers",
        "@semadiff/parser-swc",
        "@semadiff/parser-tree-sitter-wasm",
        "@semadiff/parser-lightningcss",
        "@semadiff/render-html",
        "@semadiff/pr-backend",
        "@swc/core",
        "@swc/wasm",
        "tree-sitter",
        "tree-sitter-css",
        "tree-sitter-javascript",
        "tree-sitter-typescript",
        "tree-sitter-yaml",
        "tree-sitter-toml",
        "lightningcss",
      ],
    },
    optimizeDeps: {
      exclude: [
        "@semadiff/core",
        "@semadiff/parsers",
        "@semadiff/parser-swc",
        "@semadiff/parser-tree-sitter-wasm",
        "@semadiff/parser-lightningcss",
        "@semadiff/render-html",
        "@semadiff/pr-backend",
        "@swc/core",
        "@swc/wasm",
        "tree-sitter",
        "tree-sitter-css",
        "tree-sitter-javascript",
        "tree-sitter-typescript",
        "tree-sitter-yaml",
        "tree-sitter-toml",
        "lightningcss",
      ],
    },
    plugins: [
      !isTest &&
        devtoolsEnabled &&
        devtools({
          eventBusConfig: {
            port: devtoolsPort,
          },
        }),
      enableNitro &&
        nitro({
          traceDeps: [
            "@semadiff/core",
            "@semadiff/parsers",
            "@semadiff/parser-swc",
            "@semadiff/parser-tree-sitter-wasm",
            "@semadiff/parser-lightningcss",
            "@semadiff/render-html",
            "@semadiff/pr-backend",
            "@swc/core",
            "tree-sitter",
            "tree-sitter-css",
            "tree-sitter-javascript",
            "tree-sitter-typescript",
            "tree-sitter-yaml",
            "tree-sitter-toml",
            "lightningcss",
          ],
        }),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),

      !isTest && tanstackStart(),
      !isTest && viteReact(),
    ].filter(Boolean),
  };
});

export default config;
