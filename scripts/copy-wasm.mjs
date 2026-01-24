import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const moduleSearchPaths = [
  repoRoot,
  resolve(repoRoot, "packages", "parser-tree-sitter-wasm"),
  resolve(repoRoot, "packages", "github-extension"),
];
const outDir = process.env.SEMADIFF_WASM_OUT
  ? resolve(repoRoot, process.env.SEMADIFF_WASM_OUT)
  : resolve(
      repoRoot,
      "packages",
      "github-extension",
      "public",
      "semadiff-wasm"
    );

const wasmFiles = [
  {
    module: "web-tree-sitter",
    candidates: ["tree-sitter.wasm", "web-tree-sitter.wasm"],
    target: "tree-sitter.wasm",
  },
  {
    module: "tree-sitter-typescript",
    candidates: [
      "tree-sitter-typescript.wasm",
      "dist/tree-sitter-typescript.wasm",
    ],
    target: "tree-sitter-typescript.wasm",
  },
  {
    module: "tree-sitter-typescript",
    candidates: ["tree-sitter-tsx.wasm", "dist/tree-sitter-tsx.wasm"],
    target: "tree-sitter-tsx.wasm",
  },
  {
    module: "tree-sitter-javascript",
    candidates: [
      "tree-sitter-javascript.wasm",
      "dist/tree-sitter-javascript.wasm",
    ],
    target: "tree-sitter-javascript.wasm",
  },
  {
    module: "tree-sitter-javascript",
    candidates: [
      "tree-sitter-jsx.wasm",
      "dist/tree-sitter-jsx.wasm",
      "tree-sitter-javascript.wasm",
      "dist/tree-sitter-javascript.wasm",
    ],
    target: "tree-sitter-jsx.wasm",
  },
  {
    module: "tree-sitter-css",
    candidates: ["tree-sitter-css.wasm", "dist/tree-sitter-css.wasm"],
    target: "tree-sitter-css.wasm",
  },
  {
    module: "@tree-sitter-grammars/tree-sitter-markdown",
    candidates: ["tree-sitter-markdown.wasm"],
    target: "tree-sitter-markdown.wasm",
    build: {
      grammarSubdir: "tree-sitter-markdown",
      output: "tree-sitter-markdown.wasm",
    },
  },
  {
    module: "tree-sitter-toml",
    candidates: ["tree-sitter-toml.wasm", "dist/tree-sitter-toml.wasm"],
    target: "tree-sitter-toml.wasm",
    build: {
      output: "tree-sitter-toml.wasm",
    },
  },
  {
    module: "@tree-sitter-grammars/tree-sitter-yaml",
    candidates: ["tree-sitter-yaml.wasm", "dist/tree-sitter-yaml.wasm"],
    target: "tree-sitter-yaml.wasm",
  },
];

function resolveModuleDir(moduleName) {
  const entryPath = require.resolve(moduleName, { paths: moduleSearchPaths });
  let current = dirname(entryPath);
  while (true) {
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(`Unable to resolve module directory for ${moduleName}.`);
}

function resolveWasmPath(moduleName, candidates) {
  const baseDir = resolveModuleDir(moduleName);
  for (const candidate of candidates) {
    const fullPath = join(baseDir, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  const options = candidates
    .map((candidate) => join(baseDir, candidate))
    .join(", ");
  throw new Error(`Unable to locate wasm for ${moduleName}. Tried: ${options}`);
}

function resolveTreeSitterBinary() {
  const localBinary = join(repoRoot, "node_modules", ".bin", "tree-sitter");
  if (existsSync(localBinary)) {
    return localBinary;
  }
  return "tree-sitter";
}

function buildWasm(moduleName, build) {
  const baseDir = resolveModuleDir(moduleName);
  const grammarDir = build.grammarSubdir
    ? join(baseDir, build.grammarSubdir)
    : baseDir;
  const output = join(baseDir, build.output);
  const treeSitter = resolveTreeSitterBinary();
  execFileSync(treeSitter, ["build", "--wasm", "-o", output, grammarDir], {
    stdio: "inherit",
  });
}

mkdirSync(outDir, { recursive: true });

for (const entry of wasmFiles) {
  let src = null;
  try {
    src = resolveWasmPath(entry.module, entry.candidates);
  } catch (error) {
    if (entry.build) {
      buildWasm(entry.module, entry.build);
      src = resolveWasmPath(entry.module, entry.candidates);
    } else {
      throw error;
    }
  }
  const dest = join(outDir, entry.target);
  copyFileSync(src, dest);
}
