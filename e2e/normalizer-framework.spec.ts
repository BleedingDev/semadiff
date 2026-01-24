import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

test("disabling a rule changes diff output", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = execSync(
    `node --input-type=module -e "import { structuralDiff } from '${coreUrl}'; const base = { global: { whitespace: true, tailwind: true, importOrder: false, numericLiterals: false }, perLanguage: {} }; const disabled = { global: { whitespace: false, tailwind: true, importOrder: false, numericLiterals: false }, perLanguage: {} }; const oldText = 'const  x=1;'; const newText = 'const x=1;'; const diffEnabled = structuralDiff(oldText, newText, { normalizers: base }); const diffDisabled = structuralDiff(oldText, newText, { normalizers: disabled }); console.log(JSON.stringify({ enabled: diffEnabled.operations.length, disabled: diffDisabled.operations.length }));"`
  ).toString();

  const result = JSON.parse(output);
  expect(result.enabled).toBe(0);
  expect(result.disabled).toBeGreaterThan(0);
});
