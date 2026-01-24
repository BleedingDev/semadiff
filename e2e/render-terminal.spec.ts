import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { distFileUrl } from "./helpers.js";

const renderTerminalUrl = distFileUrl(
  "packages",
  "render-terminal",
  "dist",
  "index.js"
);

test("terminal renderer matches expected snapshot", () => {
  execSync("pnpm --filter @semadiff/render-terminal build", {
    stdio: "inherit",
  });

  const output = execSync(
    `node --input-type=module -e "import { renderTerminal } from '${renderTerminalUrl}'; const diff = { version: '0.1.0', operations: [ { id: 'op-1', type: 'insert', newRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, newText: 'x' }, { id: 'op-2', type: 'delete', oldRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, oldText: 'x' }, { id: 'op-3', type: 'update', oldRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, newRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, oldText: 'x', newText: 'y' }, { id: 'op-4', type: 'move', oldRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, newRange: { start: { line: 2, column: 1 }, end: { line: 2, column: 2 } }, oldText: 'a', newText: 'a' } ], moves: [], renames: [] }; console.log(renderTerminal(diff, { format: 'plain' }));"`
  ).toString();

  const expected = [
    "> move 1 -> 2",
    "+ insert 1",
    "- delete 1",
    "~ update 1",
  ].join("\n");

  expect(output.trim()).toBe(expected);
});
