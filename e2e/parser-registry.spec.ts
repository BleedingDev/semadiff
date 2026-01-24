import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl, effectUrl } from "./helpers.js";

const parsersUrl = distFileUrl("packages", "parsers", "dist", "index.js");

test("invalid parse returns text fallback", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });

  const result = execSync(
    `node --input-type=module -e "import { Effect } from '${effectUrl}'; import { ParserRegistryLive } from '${parsersUrl}'; const registry = Effect.runSync(ParserRegistryLive); const parsed = Effect.runSync(registry.parse({ content: 'const x = 1;', path: 'file.ts' })); console.log(JSON.stringify({ kind: parsed.kind, language: parsed.language }));"`
  ).toString();

  const parsed = JSON.parse(result);
  expect(parsed.kind).toBe("text");
  expect(parsed.language).toBe("ts");
});

test("shebang content selects js language", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });

  const result = execSync(
    `node --input-type=module -e "import { Effect } from '${effectUrl}'; import { ParserRegistryLive } from '${parsersUrl}'; const registry = Effect.runSync(ParserRegistryLive); const parsed = Effect.runSync(registry.parse({ content: '#!/usr/bin/env node\\nconsole.log(1);' })); console.log(JSON.stringify({ kind: parsed.kind, language: parsed.language }));"`
  ).toString();

  const parsed = JSON.parse(result);
  expect(parsed.language).toBe("js");
});
