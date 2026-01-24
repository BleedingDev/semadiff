import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { decodeJson, distFileUrl, runBunEval } from "./helpers.js";

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
  }
  return true;
}

test("JSON output validates with schema file", () => {
  execSync("pnpm --filter @semadiff/core build", { stdio: "inherit" });

  const diff = runBunEval(
    `import { structuralDiff, renderJson } from '${coreUrl}'; const diff = structuralDiff('const x=1;', 'const y=2;'); console.log(renderJson(diff));`
  );

  const schema = decodeJson<JsonSchema>(
    readFileSync(
      join("packages", "core", "schemas", "diff-document.schema.json"),
      "utf8"
    )
  );

  const parsed = decodeJson<JsonValue>(diff);
  expect(validate(schema, parsed, schema)).toBe(true);
});
