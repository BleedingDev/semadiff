import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, effectUrl, runBunEval } from "./helpers.js";

const parsersUrl = distFileUrl("packages", "parsers", "dist", "index.js");

test("invalid parse returns text fallback", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });

  const result = runBunEval(
    `import { Effect, Schema } from '${effectUrl}'; import { ParserRegistryLive } from '${parsersUrl}'; const registry = Effect.runSync(ParserRegistryLive); const parsed = await Effect.runPromise(registry.parse({ content: 'const x = 1;', path: 'file.ts' })); const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ kind: parsed.kind, language: parsed.language }));`
  );

  const parsed = decodeJson<{ kind: string; language: string }>(result);
  expect(parsed.kind).toBe("text");
  expect(parsed.language).toBe("ts");
});

test("shebang content selects js language", () => {
  execSync("pnpm --filter @semadiff/parsers build", { stdio: "inherit" });

  const result = runBunEval(
    `import { Effect, Schema } from '${effectUrl}'; import { ParserRegistryLive } from '${parsersUrl}'; const registry = Effect.runSync(ParserRegistryLive); const parsed = await Effect.runPromise(registry.parse({ content: '#!/usr/bin/env node\\nconsole.log(1);' })); const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ kind: parsed.kind, language: parsed.language }));`
  );

  const parsed = decodeJson<{ kind: string; language: string }>(result);
  expect(parsed.language).toBe("js");
});
