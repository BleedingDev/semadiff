# Architecture

## System overview

SemaDiff is a monorepo with three user-facing surfaces:

- CLI (`@semadiff/cli`)
- GitHub extension overlay (`@semadiff/github-extension`)
- PR viewer app (`apps/pr-viewer`)

All surfaces consume the same core pipeline:

1. Parse source text (`packages/parsers` + `packages/parser-*`)
2. Build semantic diff (`packages/core`)
3. Render output (`packages/render-terminal` / `packages/render-html` / JSON)

## Data flow

```text
input files
  -> parser registry
  -> structural diff + normalizers + move/rename grouping
  -> DiffDocument (schema)
  -> renderer/consumer (CLI, extension, pr-backend, pr-viewer)
```

## Package boundaries

- `packages/core`
  - owns `DiffDocument` schema and structural diff behavior
  - must stay UI-agnostic and transport-agnostic
- `packages/parsers`
  - parser registry and language selection/fallback chain
- `packages/parser-*`
  - concrete parser implementations (SWC, tree-sitter node/wasm, Lightning CSS)
- `packages/render-terminal`
  - terminal formatting only (no parsing/diff logic)
- `packages/render-html`
  - HTML/virtualized rendering only (no parsing/diff logic)
- `packages/cli`
  - command surface, config resolution, git integration wrappers
- `packages/pr-backend`
  - GitHub API + PR diff orchestration
- `packages/github-extension`
  - content/UI bridge for GitHub pages
- `apps/pr-viewer`
  - standalone web viewer for PR workflows

## Cross-package contracts

- `DiffDocument` is the stable contract between engine and renderers/UI.
- Parser packages return parse roots/tokens through `packages/parsers` interfaces.
- Configuration is resolved once and passed into consumers as a plain object.

## Runtime asset pipeline (WASM)

- Required WASM grammars are defined in `scripts/wasm-files.mjs`.
- `scripts/copy-wasm.mjs` copies/produces those assets for each consumer.
- `scripts/verify-wasm-assets.mjs` enforces completeness in CI and package scripts.

## Testing layers

- Unit/contract tests: `packages/**/test`
- Coverage gate: `pnpm test:coverage`
- End-to-end behavior: `e2e/*.spec.ts` (Playwright)
- CI split:
  - quality + coverage
  - wasm verification
  - PR smoke e2e
  - full e2e on `main`/nightly/manual
