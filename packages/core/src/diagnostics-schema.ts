import { Schema } from "effect";
import { ConfigSchema } from "./config.js";
import { DiffDocumentSchema } from "./diff-schema.js";

export const DiagnosticsBundleSchema = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  createdAt: Schema.String,
  redacted: Schema.Boolean,
  summary: Schema.Struct({
    operationCount: Schema.Number,
    moveCount: Schema.Number,
    renameCount: Schema.Number,
  }),
  config: Schema.optional(ConfigSchema),
  diff: Schema.optional(DiffDocumentSchema),
});
