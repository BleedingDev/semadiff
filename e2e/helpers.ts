import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Schema } from "effect";

export const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const distPath = (...segments: string[]) => join(repoRoot, ...segments);

export const distFileUrl = (...segments: string[]) =>
  pathToFileURL(distPath(...segments)).href;

export const effectUrl = (() => {
  const candidates = [
    distPath("node_modules", "effect", "dist", "index.js"),
    distPath("node_modules", "effect", "dist", "esm", "index.js"),
    distPath("packages", "core", "node_modules", "effect", "dist", "index.js"),
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

export const encodeJson = (value: unknown) =>
  Schema.encodeSync(Schema.UnknownFromJsonString)(value);

export const encodeJsonPretty = (value: unknown) =>
  JSON.stringify(value, null, 2) ?? "null";

export const decodeJson = <T = unknown>(value: string) =>
  Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(value) as T;

export const bunBinary = process.env.BUN_BINARY ?? "bun";

export const bunEval = (script: string) =>
  `${bunBinary} --eval ${encodeJson(script)}`;

export const runBunEval = (
  script: string,
  options?: Parameters<typeof execFileSync>[2]
) =>
  execFileSync(bunBinary, ["--eval", script], {
    encoding: "utf8",
    ...options,
  });
