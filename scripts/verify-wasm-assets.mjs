import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wasmFiles } from "./wasm-files.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function fail(message) {
  process.stderr.write(`verify-wasm-assets: ${message}\n`);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(
    "Usage: bun scripts/verify-wasm-assets.mjs --dir <path> [--dir <path> ...]\n"
  );
}

function parseDirs(argv) {
  const dirs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        fail("missing value for --dir");
      }
      dirs.push(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--dir=")) {
      const value = arg.slice("--dir=".length);
      if (!value) {
        fail("missing value for --dir");
      }
      dirs.push(value);
      continue;
    }

    fail(`unknown arg ${arg}`);
  }

  if (dirs.length === 0) {
    fail("at least one --dir is required");
  }

  return [...new Set(dirs.map((dir) => resolve(repoRoot, dir)))];
}

function ensureDirectory(dir) {
  if (!existsSync(dir)) {
    fail(`dir not found: ${dir}`);
  }
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    fail(`dir not readable: ${dir}`);
  }
  if (!stat.isDirectory()) {
    fail(`not a directory: ${dir}`);
  }
}

const dirs = parseDirs(process.argv.slice(2));
for (const dir of dirs) {
  ensureDirectory(dir);
}

const requiredTargets = [...new Set(wasmFiles.map((entry) => entry.target))];
const missingTargets = requiredTargets.filter(
  (target) => !dirs.some((dir) => existsSync(join(dir, target)))
);

if (missingTargets.length > 0) {
  fail(`missing files: ${missingTargets.join(", ")}`);
}

process.stdout.write(
  `verify-wasm-assets: ok (${requiredTargets.length} files, ${dirs.length} dirs)\n`
);
