import { Schema } from "effect";

export const PositionSchema = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
});

export const RangeSchema = Schema.Struct({
  start: PositionSchema,
  end: PositionSchema,
});

const DiffMetaSchema = Schema.Struct({
  confidence: Schema.optional(Schema.Number),
  moveId: Schema.optional(Schema.String),
  renameGroupId: Schema.optional(Schema.String),
});

export const DiffOperationSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["insert", "delete", "update", "move"] as const),
  oldRange: Schema.optional(RangeSchema),
  newRange: Schema.optional(RangeSchema),
  oldText: Schema.optional(Schema.String),
  newText: Schema.optional(Schema.String),
  meta: Schema.optional(DiffMetaSchema),
});

export const MoveGroupSchema = Schema.Struct({
  id: Schema.String,
  oldRange: RangeSchema,
  newRange: RangeSchema,
  confidence: Schema.Number,
  operations: Schema.Array(Schema.String),
});

export const RenameGroupSchema = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  to: Schema.String,
  occurrences: Schema.Number,
  confidence: Schema.Number,
});

export const DiffDocumentSchema = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  operations: Schema.Array(DiffOperationSchema),
  moves: Schema.Array(MoveGroupSchema),
  renames: Schema.Array(RenameGroupSchema),
});
