import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, effectUrl, runBunEval } from "./helpers.js";

const parsersUrl = distFileUrl("packages", "parsers", "dist", "index.js");
const swcUrl = distFileUrl("packages", "parser-swc", "dist", "index.js");
const lightningUrl = distFileUrl(
  "packages",
  "parser-lightningcss",
  "dist",
  "index.js"
);
const treeSitterUrl = distFileUrl(
  "packages",
  "parser-tree-sitter-wasm",
  "dist",
  "index.js"
);

test("parser fallback chain uses next parser when best fails", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-swc build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-lightningcss build", {
    stdio: "inherit",
  });
  execSync("pnpm --filter @semadiff/parser-tree-sitter-wasm build", {
    stdio: "inherit",
  });

  const output = runBunEval(
    `import { Effect, Schema } from '${effectUrl}'; import { makeRegistry } from '${parsersUrl}'; import { swcParsers } from '${swcUrl}'; import { treeSitterWasmParsers } from '${treeSitterUrl}'; const registry = makeRegistry([...swcParsers, ...treeSitterWasmParsers]); const parsed = await Effect.runPromise(registry.parse({ content: 'function {', path: 'file.js' })); const rootType = parsed.root?.type ?? parsed.root?.kind ?? null; const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ kind: parsed.kind, rootType }));`
  );

  const parsed = decodeJson<{ kind: string; rootType: string | null }>(output);
  expect(parsed.kind).toBe("tree");
  expect(["program", "source_file"]).toContain(parsed.rootType);
});

test("parser tokens are attached when available", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-swc build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-lightningcss build", {
    stdio: "inherit",
  });
  execSync("pnpm --filter @semadiff/parser-tree-sitter-wasm build", {
    stdio: "inherit",
  });

  const output = runBunEval(
    `import { Effect, Schema } from '${effectUrl}'; import { makeRegistry } from '${parsersUrl}'; import { swcParsers } from '${swcUrl}'; import { lightningCssParsers } from '${lightningUrl}'; import { treeSitterWasmParsers } from '${treeSitterUrl}'; const registry = makeRegistry([...swcParsers, ...lightningCssParsers, ...treeSitterWasmParsers]); const parsedJs = await Effect.runPromise(registry.parse({ content: 'const foo = 1;', path: 'file.ts' })); const parsedCss = await Effect.runPromise(registry.parse({ content: 'a { color: red; }', path: 'file.css' })); const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ jsTokens: parsedJs.tokens?.length ?? 0, cssTokens: parsedCss.tokens?.length ?? 0 }));`
  );

  const parsed = decodeJson<{ jsTokens: number; cssTokens: number }>(output);
  expect(parsed.jsTokens).toBeGreaterThan(0);
  expect(parsed.cssTokens).toBeGreaterThan(0);
});
