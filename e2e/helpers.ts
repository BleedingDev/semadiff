import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const distPath = (...segments: string[]) => join(repoRoot, ...segments);

export const distFileUrl = (...segments: string[]) =>
  pathToFileURL(distPath(...segments)).href;

export const effectUrl = (() => {
  const candidates = [
    distPath("node_modules", "effect", "dist", "esm", "index.js"),
    distPath(
      "packages",
      "core",
      "node_modules",
      "effect",
      "dist",
      "esm",
      "index.js"
    ),
    distPath(
      "packages",
      "parsers",
      "node_modules",
      "effect",
      "dist",
      "esm",
      "index.js"
    ),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `Unable to resolve effect ESM entry. Tried: ${candidates.join(", ")}`
    );
  }

  return pathToFileURL(resolved).href;
})();
