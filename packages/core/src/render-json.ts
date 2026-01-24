import type { DiffDocument } from "./diff.js";

export function renderJson(diff: DiffDocument) {
  return JSON.stringify(diff, null, 2);
}
