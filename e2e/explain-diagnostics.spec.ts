import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, effectUrl, runBunEval } from "./helpers.js";

const coreUrl = distFileUrl("packages", "core", "dist", "index.js");

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  const?: string;
  additionalProperties?: boolean;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
}

function resolveRef(schema: JsonSchema, ref: string): JsonSchema {
  const parts = ref.replace("#/", "").split("/");
  let current: JsonSchema | undefined = schema;
  for (const part of parts) {
    if (!current) {
      break;
    }
    if (part === "definitions") {
      current = current.definitions;
    } else if (current && (current as Record<string, JsonSchema>)[part]) {
      current = (current as Record<string, JsonSchema>)[part];
    } else {
      current = undefined;
    }
  }
  return current ?? {};
}

function validate(
  schema: JsonSchema,
  value: JsonValue,
  root: JsonSchema
): boolean {
  const target = schema.$ref ? resolveRef(root, schema.$ref) : schema;
  if (target.const !== undefined) {
    return value === target.const;
  }
  if (target.enum) {
    return typeof value === "string" && target.enum.includes(value);
  }
  if (target.type) {
    if (target.type === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const obj = value as Record<string, JsonValue>;
      if (target.required) {
        for (const key of target.required) {
          if (!(key in obj)) {
            return false;
          }
        }
      }
      if (target.properties) {
        for (const [key, schemaValue] of Object.entries(target.properties)) {
          if (
            obj[key] !== undefined &&
            !validate(schemaValue, obj[key], root)
          ) {
            return false;
          }
        }
      }
      if (target.additionalProperties === false && target.properties) {
        for (const key of Object.keys(obj)) {
          if (!(key in target.properties)) {
            return false;
          }
        }
      }
      return true;
    }
    if (target.type === "array") {
      if (!Array.isArray(value)) {
        return false;
      }
      if (target.items) {
        return value.every((item) =>
          validate(target.items as JsonSchema, item, root)
        );
      }
      return true;
    }
    if (target.type === "string") {
      return typeof value === "string";
    }
    if (target.type === "number") {
      return typeof value === "number";
    }
    if (target.type === "boolean") {
      return typeof value === "boolean";
    }
  }
  return true;
}

test("explain JSON validates and diagnostics redacts code by default", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const output = runBunEval(
    `import { Schema } from '${effectUrl}'; import { structuralDiff, explainDiff, createDiagnosticsBundle } from '${coreUrl}'; const diff = structuralDiff('const x=1;', 'const y=2;'); const explain = explainDiff(diff); const diagnostics = createDiagnosticsBundle({ diff }); const encodeJson = Schema.encodeSync(Schema.parseJson(Schema.Unknown)); console.log(encodeJson({ explain, diagnostics }));`
  );

  const parsed = decodeJson<{
    explain: JsonValue;
    diagnostics: {
      redacted: boolean;
      diff: { operations: { oldText?: string; newText?: string }[] };
    };
  }>(output);

  const schema = decodeJson<JsonSchema>(
    readFileSync(
      join("packages", "core", "schemas", "explain.schema.json"),
      "utf8"
    )
  );
  const diagnosticsSchema = decodeJson<JsonSchema>(
    readFileSync(
      join("packages", "core", "schemas", "diagnostics.schema.json"),
      "utf8"
    )
  );

  expect(validate(schema, parsed.explain, schema)).toBe(true);
  expect(
    validate(diagnosticsSchema, parsed.diagnostics, diagnosticsSchema)
  ).toBe(true);
  expect(parsed.diagnostics.redacted).toBe(true);
  expect(
    parsed.diagnostics.diff.operations.every(
      (op) => !(op.oldText || op.newText)
    )
  ).toBe(true);
});
