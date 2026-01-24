# Workspace Packages

Define pnpm workspace layout for core, parsers, renderers, CLI, extension, test corpus.

## Requirements
- `pnpm-workspace.yaml` lists all package paths from architecture.
- Each package has `package.json` with name plus build entry.
- Shared `tsconfig` base with strict settings plus path aliases.

## E2E Test
Write test in `e2e/workspace.spec.ts` that verifies:
- `pnpm -r build` succeeds from repo root.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Workspace installs with `pnpm install`
