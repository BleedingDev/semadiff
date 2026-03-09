# SemaDiff

SemaDiff is a semantic diff toolkit for code review workflows.
The main entry point is the `semadiff` CLI: use it directly on files, feed it git ranges, or wire it into `git diff` and `git difftool`.

It includes:
- a CLI (`@semadiff/cli`)
- a GitHub extension overlay (`@semadiff/github-extension`)
- a PR viewer app (`apps/pr-viewer`)
- parser, diff, renderer, and backend packages in `packages/*`

## Requirements

- Node.js 20+
- pnpm 10+
- Bun 1.3.9+

## Quick Start

```bash
pnpm install

# Run the CLI from TypeScript source during local development.
./scripts/semadiff --help

# Compare two files.
./scripts/semadiff diff old.ts new.ts --format ansi

# Generate an offline HTML workbench for deeper inspection.
./scripts/semadiff inspect old.ts new.ts --output tmp/inspect.html

# Inspect staged changes as hybrid JSON.
./scripts/semadiff git-hybrid --staged

# Print the git config snippets for git diff / git difftool.
./scripts/semadiff install-git
```

## CLI Workflows

```bash
# File-to-file semantic diff
./scripts/semadiff diff old.ts new.ts --format json --experimental-hybrid

# Generate a self-contained inspect workbench
./scripts/semadiff inspect old.ts new.ts --output tmp/inspect.html --open

# Multi-file git-aware JSON for tooling and experiments
./scripts/semadiff git-hybrid --working-tree
./scripts/semadiff git-hybrid --from HEAD~1 --to HEAD --compact
./scripts/semadiff git-hybrid --stdin-file-changes < file-changes.json

# Inspect resolved config and environment
./scripts/semadiff config
./scripts/semadiff doctor
```

When the CLI is installed on your machine or in CI, replace `./scripts/semadiff` with `semadiff`.

## Git Workflow

Once the CLI is on your `PATH`, wire it into Git:

```bash
# Print the config snippets
semadiff install-git

# Review with semadiff through git
git diff --ext-diff
git show --ext-diff
git log -p --ext-diff -1
git difftool --tool=semadiff
```

See `docs/CLI.md` for the command guide and `docs/GIT_INTEGRATION.md` for the full git setup, including checkout-only usage before installation.

## Build, Test, and Benchmark

Use Bun to run the CLI source locally. Build `dist/` only when you need the packaged artifact:

```bash
pnpm --filter @semadiff/cli build
pnpm quality
pnpm benchmark:gold
pnpm test:e2e
```

Other useful workspace commands:

```bash
# Gold micro benchmark harness
pnpm benchmark:compare
pnpm benchmark:compare:sem
node packages/benchmark-harness/dist/cli.js --cases bench/cases/gold/micro --tools semadiff,git-diff,git-diff-color-moved,difftastic
SEM_BIN=tmp/sem-install/bin/sem node packages/benchmark-harness/dist/cli.js --cases bench/cases/gold/micro --tools semadiff,sem

# Curated real PR corpus (50 TypeScript PR slices)
pnpm benchmark:real:compare
pnpm benchmark:real:refresh
jq '.tools[] | { tool, review: .review }' bench/cases/real/selection-report.json

# Browser extension dev
pnpm --filter @semadiff/github-extension dev

# PR viewer dev (IPv4-safe)
pnpm --filter pr-viewer dev -- --host 127.0.0.1 --port 3000 --strictPort
curl -I http://127.0.0.1:3000/
```

## Workspace Layout

- `packages/core`: diff engine, schemas, normalizers, telemetry
- `packages/entity-core`: experimental entity extraction and matching sidecar
- `packages/benchmark-harness`: benchmark case loading, scoring, reporting, and cross-tool adapters
- `packages/parsers` and `packages/parser-*`: parser registry and implementations
- `packages/render-html` / `packages/render-terminal`: renderers
- `packages/pr-backend`: GitHub/PR diff backend services
- `packages/cli`: command-line interface
- `packages/github-extension`: overlay UI/bridge
- `apps/pr-viewer`: web app for PR summary and file diff inspection
- `bench/cases/real`: curated real-world PR slices, local GitHub/SemanticDiff archives, and the latest selection report
- `e2e`: Playwright end-to-end tests
- `docs`: focused docs (`ARCHITECTURE.md`, `CLI.md`, `CONFIG.md`, `CONTRIBUTING.md`, `EMBED_API.md`, `GIT_INTEGRATION.md`, `IMPLEMENTATION_PLAN.md`)

## Docs

- CLI guide: `docs/CLI.md`
- Git integration: `docs/GIT_INTEGRATION.md`
- Configuration: `docs/CONFIG.md`
- Architecture map: `docs/ARCHITECTURE.md`
- Contributor workflow and extension runbooks: `docs/CONTRIBUTING.md`
