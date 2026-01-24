import { execFileSync, execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

const normalizersEnabled = {
  global: {
    whitespace: true,
    tailwind: true,
    importOrder: false,
    numericLiterals: false,
  },
  perLanguage: {},
};

const normalizersDisabled = {
  global: {
    whitespace: true,
    tailwind: false,
    importOrder: false,
    numericLiterals: false,
  },
  perLanguage: {},
};

function runTailwindCase(oldText: string, newText: string) {
  const script = `
import { structuralDiff } from ${JSON.stringify(coreUrl)};
const enabled = ${JSON.stringify(normalizersEnabled)};
const disabled = ${JSON.stringify(normalizersDisabled)};
const oldText = ${JSON.stringify(oldText)};
const newText = ${JSON.stringify(newText)};
const diffEnabled = structuralDiff(oldText, newText, { normalizers: enabled, language: "tsx" });
const diffDisabled = structuralDiff(oldText, newText, { normalizers: disabled, language: "tsx" });
console.log(JSON.stringify({ enabled: diffEnabled.operations.length, disabled: diffDisabled.operations.length }));
`;
  const output = execFileSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  return JSON.parse(output) as { enabled: number; disabled: number };
}

test.beforeAll(() => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });
});

test("tailwind reorder yields no semantic edits", () => {
  const result = runTailwindCase(
    '<div className="text-sm bg-red-500" />',
    '<div className="bg-red-500 text-sm" />'
  );
  expect(result.enabled).toBe(0);
  expect(result.disabled).toBeGreaterThan(0);
});

test("tailwind token addition remains a diff", () => {
  const result = runTailwindCase(
    '<div className="text-sm bg-red-500" />',
    '<div className="text-sm bg-red-500 font-bold" />'
  );
  expect(result.enabled).toBeGreaterThan(0);
  expect(result.disabled).toBeGreaterThan(0);
});

test("tailwind token removal remains a diff", () => {
  const result = runTailwindCase(
    '<div className="text-sm bg-red-500 font-bold" />',
    '<div className="text-sm bg-red-500" />'
  );
  expect(result.enabled).toBeGreaterThan(0);
  expect(result.disabled).toBeGreaterThan(0);
});

test("tailwind preserves duplicates while sorting", () => {
  const result = runTailwindCase(
    '<div className="text-sm text-sm bg-red-500" />',
    '<div className="bg-red-500 text-sm text-sm" />'
  );
  expect(result.enabled).toBe(0);
  expect(result.disabled).toBeGreaterThan(0);
});

test("tailwind ignores dynamic class composition", () => {
  const result = runTailwindCase(
    // biome-ignore lint/suspicious/noTemplateCurlyInString: preserve template literal example.
    "<div className={`text-sm ${kind}`} />",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: preserve template literal example.
    "<div className={`bg-red-500 ${kind}`} />"
  );
  expect(result.enabled).toBeGreaterThan(0);
  expect(result.disabled).toBeGreaterThan(0);
});
