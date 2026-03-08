import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type BenchmarkCase, resolveBenchmarkAdapter } from "../src/index.js";

const tempDirectories: string[] = [];
const originalSemBin = process.env.SEM_BIN;
const originalPath = process.env.PATH;
const SEMANTICDIFF_ERROR_RE = /cache hydration failed/;

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function writeExecutable(tempDir: string, name: string, body: string) {
  const executablePath = join(tempDir, name);
  writeFileSync(executablePath, body, "utf8");
  chmodSync(executablePath, 0o755);
  return executablePath;
}

function makeBenchmarkCase(files: BenchmarkCase["files"]): BenchmarkCase {
  return makeBenchmarkCaseAtSource(
    join(process.cwd(), "tmp", "adapter-fixture", "case.json"),
    files
  );
}

function makeBenchmarkCaseAtSource(
  sourcePath: string,
  files: BenchmarkCase["files"]
): BenchmarkCase {
  return {
    id: "adapter-fixture",
    language: "ts",
    kind: "micro",
    description: "Adapter fixture",
    files,
    truth: {
      operations: [],
      moves: [],
      renames: [],
      entities: [],
      entityChanges: [],
      graphEdges: [],
      impact: [],
    },
    capabilities: {
      review: true,
      entity: true,
      graph: false,
    },
    sourcePath,
  };
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  if (originalSemBin) {
    process.env.SEM_BIN = originalSemBin;
  } else {
    Reflect.deleteProperty(process.env, "SEM_BIN");
  }
  if (originalPath) {
    process.env.PATH = originalPath;
  } else {
    Reflect.deleteProperty(process.env, "PATH");
  }
});

describe("benchmark adapters", () => {
  test("projects entity-only sem output from a local sem binary", () => {
    const tempDir = createTempDirectory("benchmark-sem-script-");
    const semBin = writeExecutable(
      tempDir,
      "sem",
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("sem 1.0.0");
  process.exit(0);
}
if (args[0] === "graph") {
  const isOld = process.cwd().endsWith("/old");
  const output = [];
  for (const filePath of args.slice(1)) {
    output.push(filePath);
    if (isOld) {
      if (filePath === "src/value.ts") output.push("    function compute L1-3");
      if (filePath === "src/removed.ts") output.push("    class Removed L1-1");
      if (filePath === "src/original.ts") output.push("    function previousName L1-3");
      if (filePath === "src/a.ts") output.push("    function movedThing L1-3");
    } else {
      if (filePath === "src/value.ts") output.push("    function compute L1-3");
      if (filePath === "src/new.ts") output.push("    variable created L1-1");
      if (filePath === "src/renamed.ts") output.push("    function nextName L1-3");
      if (filePath === "src/b.ts") output.push("    function movedThing L1-3");
    }
    output.push("    weird unsupported L1-1");
  }
  console.log(output.join("\\n"));
  process.exit(0);
}
if (args[0] === "diff") {
  fs.readFileSync(0, "utf8");
  console.log(JSON.stringify({
    changes: [
      {
        changeType: "modified",
        entityName: "compute",
        entityType: "function",
        filePath: "src/value.ts",
        oldFilePath: "src/value.ts",
        beforeContent: "export function compute(x: number) {\\n  return x;\\n}\\n",
        afterContent: "export function compute(value: number) {\\n  return value + 1;\\n}\\n"
      },
      {
        changeType: "added",
        entityName: "created",
        entityType: "variable",
        filePath: "src/new.ts",
        oldFilePath: null,
        beforeContent: null,
        afterContent: "export const created = true;\\n"
      },
      {
        changeType: "deleted",
        entityName: "Removed",
        entityType: "class",
        filePath: "src/removed.ts",
        oldFilePath: "src/removed.ts",
        beforeContent: "export class Removed {}\\n",
        afterContent: null
      },
      {
        changeType: "renamed",
        entityName: "nextName",
        entityType: "function",
        filePath: "src/renamed.ts",
        oldFilePath: "src/original.ts",
        beforeContent: "export function previousName() {\\n  return 1;\\n}\\n",
        afterContent: "export function nextName() {\\n  return 1;\\n}\\n"
      },
      {
        changeType: "moved",
        entityName: "movedThing",
        entityType: "function",
        filePath: "src/b.ts",
        oldFilePath: "src/a.ts",
        beforeContent: "export function movedThing() {\\n  return 1;\\n}\\n",
        afterContent: "export function movedThing() {\\n  return 1;\\n}\\n"
      },
      {
        changeType: "modified",
        entityName: "ignored",
        entityType: "macro",
        filePath: "src/ignored.ts",
        oldFilePath: null,
        beforeContent: null,
        afterContent: null
      }
    ]
  }));
  process.exit(0);
}
process.exit(1);
`
    );
    process.env.SEM_BIN = semBin;

    const adapter = resolveBenchmarkAdapter("sem");
    const result = adapter.runCase(
      makeBenchmarkCase([
        {
          id: "src/value.ts",
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          status: "modified",
          language: "ts",
          before: "export function compute(x: number) {\n  return x;\n}\n",
          after:
            "export function compute(value: number) {\n  return value + 1;\n}\n",
        },
        {
          id: "src/new.ts",
          oldPath: null,
          newPath: "src/new.ts",
          status: "added",
          language: "ts",
          before: "",
          after: "export const created = true;\n",
        },
        {
          id: "src/removed.ts",
          oldPath: "src/removed.ts",
          newPath: null,
          status: "deleted",
          language: "ts",
          before: "export class Removed {}\n",
          after: "",
        },
        {
          id: "src/renamed.ts",
          oldPath: "src/original.ts",
          newPath: "src/renamed.ts",
          status: "renamed",
          language: "ts",
          before: "export function previousName() {\n  return 1;\n}\n",
          after: "export function nextName() {\n  return 1;\n}\n",
        },
        {
          id: "src/b.ts",
          oldPath: "src/a.ts",
          newPath: "src/b.ts",
          status: "renamed",
          language: "ts",
          before: "export function movedThing() {\n  return 1;\n}\n",
          after: "export function movedThing() {\n  return 1;\n}\n",
        },
      ])
    );

    expect(result.tool).toBe("sem");
    expect(result.capabilities).toEqual({
      review: false,
      entity: true,
      graph: false,
    });
    expect(
      result.result.entityChanges.map((change) => change.changeKinds[0])
    ).toEqual(["modified", "added", "deleted", "renamed", "moved"]);
    expect(result.result.entities.old).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "compute", kind: "function" }),
        expect.objectContaining({ name: "Removed", kind: "class" }),
      ])
    );
    expect(result.result.entities.new).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "created", kind: "variable" }),
        expect.objectContaining({ name: "nextName", kind: "function" }),
      ])
    );
  });

  test("parses difftastic JSON review rows from a local difft binary", () => {
    const tempDir = createTempDirectory("benchmark-difft-script-");
    writeExecutable(
      tempDir,
      "difft",
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("difft 1.0.0");
  process.exit(0);
}
console.log(JSON.stringify([{
  chunks: [[
    {
      lhs: { line_number: 0, changes: [{ content: "oldValue" }] },
      rhs: { line_number: 0, changes: [{ content: "newValue" }] }
    },
    {
      lhs: { line_number: 1, changes: [{ content: "removedLine" }] }
    },
    {
      rhs: { line_number: 1, changes: [{ content: "addedLine" }] }
    },
    {}
  ]]
}]));
`
    );
    process.env.PATH = `${tempDir}:${originalPath ?? ""}`;

    const adapter = resolveBenchmarkAdapter("difft");
    const result = adapter.runCase(
      makeBenchmarkCase([
        {
          id: "src/value.ts",
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          status: "modified",
          language: "ts",
          before: "oldValue\nremovedLine\n",
          after: "newValue\naddedLine\n",
        },
      ])
    );

    expect(result.tool).toBe("difftastic");
    expect(result.result.reviewRows).toEqual([
      {
        fileId: "src/value.ts",
        type: "replace",
        oldLine: 1,
        newLine: 1,
        oldText: "oldValue",
        newText: "newValue",
      },
      {
        fileId: "src/value.ts",
        type: "delete",
        oldLine: 2,
        oldText: "removedLine",
      },
      {
        fileId: "src/value.ts",
        type: "insert",
        newLine: 2,
        newText: "addedLine",
      },
    ]);
  });

  test("returns no difftastic review rows when the tool emits no JSON chunks", () => {
    const tempDir = createTempDirectory("benchmark-difft-empty-");
    writeExecutable(
      tempDir,
      "difft",
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("difft 1.0.0");
  process.exit(0);
}
console.log("");
`
    );
    process.env.PATH = `${tempDir}:${originalPath ?? ""}`;

    const adapter = resolveBenchmarkAdapter("difft");
    const result = adapter.runCase(
      makeBenchmarkCase([
        {
          id: "src/value.ts",
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          status: "modified",
          language: "ts",
          before: "oldValue\n",
          after: "newValue\n",
        },
      ])
    );

    expect(result.result.reviewRows).toEqual([]);
  });

  test("parses git diff review rows for changed files", () => {
    const adapter = resolveBenchmarkAdapter("git-diff");
    const result = adapter.runCase(
      makeBenchmarkCase([
        {
          id: "src/value.ts",
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          status: "modified",
          language: "ts",
          before: "const keep = true;\nconst value = 1;\n",
          after: "const keep = true;\nconst value = 2;\nconst added = 3;\n",
        },
      ])
    );

    expect(result.tool).toBe("git-diff");
    expect(result.result.reviewRows).toEqual([
      {
        fileId: "src/value.ts",
        type: "delete",
        oldLine: 2,
        oldText: "const value = 1;",
      },
      {
        fileId: "src/value.ts",
        type: "insert",
        newLine: 2,
        newText: "const value = 2;",
      },
      {
        fileId: "src/value.ts",
        type: "insert",
        newLine: 3,
        newText: "const added = 3;",
      },
    ]);
  });

  test("reads cached semanticdiff manifests and surfaces cached error payloads", () => {
    const tempDir = createTempDirectory("benchmark-semanticdiff-");
    const caseDir = join(tempDir, "case");
    const semanticdiffDir = join(caseDir, "semanticdiff");
    const caseFilePath = join(caseDir, "case.json");
    mkdirSync(semanticdiffDir, { recursive: true });
    writeFileSync(caseFilePath, "{}", "utf8");
    writeFileSync(
      join(semanticdiffDir, "manifest.json"),
      JSON.stringify(
        [
          { tracking_name: "src/value.ts", file: "value.json" },
          { tracking_name: "src/value.ts" },
          { file: "ignored.json" },
        ],
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(
      join(semanticdiffDir, "value.json"),
      JSON.stringify({
        blocks: [
          {
            old_column: [
              { line: 1, content: "oldValue", change: 1 },
              { line: 2, content: "removedLine", change: 1 },
            ],
            new_column: [
              { line: 1, content: "newValue", change: 1 },
              { line: null, content: "", change: 0 },
            ],
          },
          {
            old_column: [],
            new_column: [{ line: 3, content: "addedLine", change: 1 }],
          },
        ],
      }),
      "utf8"
    );

    const adapter = resolveBenchmarkAdapter("semanticdiff");
    const result = adapter.runCase(
      makeBenchmarkCaseAtSource(caseFilePath, [
        {
          id: "src/value.ts",
          oldPath: "src/value.ts",
          newPath: "src/value.ts",
          status: "modified",
          language: "ts",
          before: "oldValue\nremovedLine\n",
          after: "newValue\naddedLine\n",
        },
      ])
    );

    expect(result.tool).toBe("semanticdiff");
    expect(result.result.reviewRows).toEqual([
      {
        fileId: "src/value.ts",
        type: "replace",
        oldLine: 1,
        newLine: 1,
        oldText: "oldValue",
        newText: "newValue",
      },
      {
        fileId: "src/value.ts",
        type: "delete",
        oldLine: 2,
        oldText: "removedLine",
      },
      {
        fileId: "src/value.ts",
        type: "insert",
        newLine: 3,
        newText: "addedLine",
      },
    ]);

    writeFileSync(
      join(semanticdiffDir, "value.json"),
      JSON.stringify({
        type: "error",
        error: { message: "cache hydration failed" },
      }),
      "utf8"
    );

    expect(() =>
      adapter.runCase(
        makeBenchmarkCaseAtSource(caseFilePath, [
          {
            id: "src/value.ts",
            oldPath: "src/value.ts",
            newPath: "src/value.ts",
            status: "modified",
            language: "ts",
            before: "oldValue\nremovedLine\n",
            after: "newValue\naddedLine\n",
          },
        ])
      )
    ).toThrow(SEMANTICDIFF_ERROR_RE);
  });
});
