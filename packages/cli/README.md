# @semadiff/cli

Effect-based CLI for semantic diff workflows.

## Build

```bash
pnpm --filter @semadiff/cli build
```

## Run

```bash
bun packages/cli/dist/index.js --help
bun packages/cli/dist/index.js diff old.ts new.ts --format json
```

## Major Commands

- `diff`
- `explain`
- `config`
- `doctor`
- `bench`
- `git-external` / `difftool` / `install-git`
- `pr summary` / `pr file`
