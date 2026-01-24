import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, effectUrl, runBunEval } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("disabling a rule changes diff output", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = runBunEval(
    `import { Schema } from '${effectUrl}'; import { structuralDiff } from '${coreUrl}'; const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); const base = { global: { whitespace: true, tailwind: true, importOrder: false, numericLiterals: false }, perLanguage: {} }; const disabled = { global: { whitespace: false, tailwind: true, importOrder: false, numericLiterals: false }, perLanguage: {} }; const oldText = 'const  x=1;'; const newText = 'const x=1;'; const diffEnabled = structuralDiff(oldText, newText, { normalizers: base }); const diffDisabled = structuralDiff(oldText, newText, { normalizers: disabled }); console.log(encodeJson({ enabled: diffEnabled.operations.length, disabled: diffDisabled.operations.length }));`
  );

  const result = decodeJson<{ enabled: number; disabled: number }>(output);
  expect(result.enabled).toBe(0);
  expect(result.disabled).toBeGreaterThan(0);
});
