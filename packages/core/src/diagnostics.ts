import type { Config } from "./config.js";
import type { DiffDocument } from "./diff.js";

export interface DiagnosticsBundle {
  version: "0.1.0";
  createdAt: string;
  redacted: boolean;
  summary: {
    operationCount: number;
    moveCount: number;
    renameCount: number;
  };
  config?: Config;
  diff?: DiffDocument;
}

function redactDiff(diff: DiffDocument): DiffDocument {
  return {
    ...diff,
    operations: diff.operations.map((op) => {
      const { oldText: _oldText, newText: _newText, ...rest } = op;
      return rest;
    }),
  };
}

export function createDiagnosticsBundle(options: {
  diff: DiffDocument;
  config?: Config;
  includeCode?: boolean;
}): DiagnosticsBundle {
  const includeCode = options.includeCode ?? false;
  const diff = includeCode ? options.diff : redactDiff(options.diff);

  return {
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    redacted: !includeCode,
    summary: {
      operationCount: diff.operations.length,
      moveCount: diff.moves.length,
      renameCount: diff.renames.length,
    },
    ...(options.config ? { config: options.config } : {}),
    diff,
  };
}
