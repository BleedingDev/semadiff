# SemaDiff

SemaDiff is a semantic diff toolkit for code review workflows.

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
pnpm build
pnpm quality
pnpm test:e2e
```

## Common Commands

```bash
# CLI build + help
pnpm --filter @semadiff/cli build
bun packages/cli/dist/index.js --help

# Browser extension dev
pnpm --filter @semadiff/github-extension dev

# PR viewer dev (IPv4-safe)
pnpm --filter pr-viewer dev -- --host 127.0.0.1 --port 3000 --strictPort
curl -I http://127.0.0.1:3000/
```

## Workspace Layout

- `packages/core`: diff engine, schemas, normalizers, telemetry
- `packages/parsers` and `packages/parser-*`: parser registry and implementations
- `packages/render-html` / `packages/render-terminal`: renderers
- `packages/pr-backend`: GitHub/PR diff backend services
- `packages/cli`: command-line interface
- `packages/github-extension`: overlay UI/bridge
- `apps/pr-viewer`: web app for PR summary and file diff inspection
- `e2e`: Playwright end-to-end tests
- `docs`: focused docs (`ARCHITECTURE.md`, `CONTRIBUTING.md`, `CONFIG.md`, `GIT_INTEGRATION.md`, `IMPLEMENTATION_PLAN.md`)

## Configuration

See `docs/CONFIG.md` for config file shape and supported `SEMADIFF_*` environment variables.

## Git Integration

See `docs/GIT_INTEGRATION.md` for `git diff` external tool and `difftool` setup.

## Architecture + Contributing

- Architecture map: `docs/ARCHITECTURE.md`
- Contributor workflow and extension runbooks: `docs/CONTRIBUTING.md`
