import { Schema } from "effect";

import { DiffDocumentSchema } from "./diff-schema.js";
import type { DiffDocument } from "./diff.js";

const DiffDocumentJson = Schema.toCodecJson(DiffDocumentSchema);

export function renderJson(diff: DiffDocument) {
	return JSON.stringify(Schema.encodeSync(DiffDocumentJson)(diff), null, 2);
}
