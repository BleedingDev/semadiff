export const wasmFiles = [
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
    module: "tree-sitter-json",
    candidates: ["tree-sitter-json.wasm", "dist/tree-sitter-json.wasm"],
    target: "tree-sitter-json.wasm",
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
