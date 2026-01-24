import { Schema } from "effect";
import type { DiffDocument } from "./diff.js";
import { DiffDocumentSchema } from "./diff-schema.js";

const DiffDocumentJson = Schema.parseJson(DiffDocumentSchema, { space: 2 });

export function renderJson(diff: DiffDocument) {
  return Schema.encodeSync(DiffDocumentJson)(diff);
}
