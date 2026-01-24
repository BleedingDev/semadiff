import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl, effectUrl } from "./helpers.js";

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
  "parser-tree-sitter-node",
  "dist",
  "index.js"
);

test("parser fallback chain uses next parser when best fails", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-swc build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-lightningcss build", {
    stdio: "inherit",
  });
  execSync("pnpm --filter @semadiff/parser-tree-sitter-node build", {
    stdio: "inherit",
  });

  const output = execSync(
    `node --input-type=module -e "import { Effect } from '${effectUrl}'; import { makeRegistry } from '${parsersUrl}'; import { swcParsers } from '${swcUrl}'; import { treeSitterNodeParsers } from '${treeSitterUrl}'; const registry = makeRegistry([...swcParsers, ...treeSitterNodeParsers]); const parsed = Effect.runSync(registry.parse({ content: 'function {', path: 'file.js' })); const rootType = parsed.root?.type ?? parsed.root?.kind ?? null; console.log(JSON.stringify({ kind: parsed.kind, rootType }));"`
  ).toString();

  const parsed = JSON.parse(output);
  expect(parsed.kind).toBe("tree");
  expect(["program", "source_file"]).toContain(parsed.rootType);
});

test("parser tokens are attached when available", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-swc build", { stdio: "inherit" });
  execSync("pnpm --filter @semadiff/parser-lightningcss build", {
    stdio: "inherit",
  });
  execSync("pnpm --filter @semadiff/parser-tree-sitter-node build", {
    stdio: "inherit",
  });

  const output = execSync(
    `node --input-type=module -e "import { Effect } from '${effectUrl}'; import { makeRegistry } from '${parsersUrl}'; import { swcParsers } from '${swcUrl}'; import { lightningCssParsers } from '${lightningUrl}'; import { treeSitterNodeParsers } from '${treeSitterUrl}'; const registry = makeRegistry([...swcParsers, ...lightningCssParsers, ...treeSitterNodeParsers]); const parsedJs = Effect.runSync(registry.parse({ content: 'const foo = 1;', path: 'file.ts' })); const parsedCss = Effect.runSync(registry.parse({ content: 'a { color: red; }', path: 'file.css' })); console.log(JSON.stringify({ jsTokens: parsedJs.tokens?.length ?? 0, cssTokens: parsedCss.tokens?.length ?? 0 }));"`
  ).toString();

  const parsed = JSON.parse(output);
  expect(parsed.jsTokens).toBeGreaterThan(0);
  expect(parsed.cssTokens).toBeGreaterThan(0);
});
