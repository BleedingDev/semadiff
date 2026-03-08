# @semadiff/cli

Effect-based CLI for semantic diff workflows.

## Local Development

```bash
# From the repo root
./scripts/semadiff --help
./scripts/semadiff diff old.ts new.ts --format json
./scripts/semadiff git-hybrid --staged

# Or from packages/cli directly
bun src/index.ts --help
```

## Installed Command

```bash
semadiff --help
semadiff install-git
semadiff config
```

## Build

```bash
pnpm --filter @semadiff/cli build
```

`dist/` is the publishable package artifact. Use Bun to run `src/index.ts` during local development.

## Major Commands

- `diff`: compare two files.
- `git-hybrid`: emit multi-file JSON for staged changes, working tree, commit ranges, or stdin.
- `install-git`: print the git config snippets for `git diff` and `git difftool`.
- `config`: print resolved config with provenance.
- `doctor`: report runtime and parser capabilities.
- `git-external` / `difftool`: Git adapter commands used by the config above.
