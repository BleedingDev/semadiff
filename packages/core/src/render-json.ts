import { Schema } from "effect";
import type { DiffDocument } from "./diff.js";
import { DiffDocumentSchema } from "./diff-schema.js";

const DiffDocumentJson = Schema.toCodecJson(DiffDocumentSchema);

export function renderJson(diff: DiffDocument) {
  return JSON.stringify(Schema.encodeSync(DiffDocumentJson)(diff), null, 2);
}
