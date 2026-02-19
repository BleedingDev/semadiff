import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

// lightningcss resolves a non-existent ../pkg path when this env var is truthy.
process.env.CSS_TRANSFORMER_WASM = "";

const lightningCssPkgVirtualId = "\0lightningcss-pkg";
const lightningCssPkgPlugin = {
  name: "resolve-lightningcss-pkg",
  resolveId(id: string, importer?: string) {
    const specifier = id.split("?")[0].split("#")[0];
    if (specifier !== "../pkg") {
      return;
    }
    const normalizedImporter = importer?.split(path.sep).join("/");
    if (!normalizedImporter) {
      return;
    }
    if (
      normalizedImporter.includes("/lightningcss/") &&
      normalizedImporter.endsWith("/node/index.js")
    ) {
      return lightningCssPkgVirtualId;
    }
  },
  load(id: string) {
    if (id !== lightningCssPkgVirtualId) {
      return;
    }
    return "const lightningCssPkgStub = {}; export default lightningCssPkgStub;";
  },
};

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
      lightningCssPkgPlugin,
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
