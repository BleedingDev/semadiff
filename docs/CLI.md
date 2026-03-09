# CLI

SemaDiff is designed around the `semadiff` command.

Inside this repository, use `./scripts/semadiff`. It runs `packages/cli/src/index.ts` directly with Bun, so you do not need to build `dist/` first.

Once the CLI is installed on your machine or in CI, replace `./scripts/semadiff` with `semadiff`.

## Run the CLI

```bash
# Local development in this repo
./scripts/semadiff --help
./scripts/semadiff doctor

# Installed command
semadiff --help
semadiff doctor
```

Build `dist/` only when you need the publishable package artifact or package-level validation:

```bash
pnpm --filter @semadiff/cli build
```

## Main Commands

- `diff`: compare two files and render semantic or line-oriented output.
- `inspect`: generate an offline HTML workbench for a file pair.
- `git-hybrid`: emit multi-file JSON from the working tree, staged changes, commit ranges, or stdin.
- `install-git`: print the git config snippets for `git diff` and `git difftool`.
- `config`: print the resolved config plus field provenance.
- `doctor`: report Bun, Git, parser, and write-access details.
- `git-external` and `difftool`: adapter commands for Git. Most users should not call them directly.

## Typical Workflows

```bash
# Compare two files in the terminal
./scripts/semadiff diff old.ts new.ts --format ansi

# Emit JSON plus experimental hybrid sidecar data
./scripts/semadiff diff old.ts new.ts --format json --experimental-hybrid

# Generate an offline inspect workbench
./scripts/semadiff inspect old.ts new.ts --output tmp/inspect.html
./scripts/semadiff inspect old.ts new.ts --output tmp/inspect.html --include-code --open

# Work with staged or unstaged git changes
./scripts/semadiff git-hybrid --staged
./scripts/semadiff git-hybrid --working-tree

# Compare an explicit git range
./scripts/semadiff git-hybrid --from HEAD~1 --to HEAD --compact

# Feed precomputed file changes from stdin
./scripts/semadiff git-hybrid --stdin-file-changes < file-changes.json

# Inspect resolved config and runtime state
./scripts/semadiff config
./scripts/semadiff doctor
```

`inspect` writes a self-contained HTML file. Add `--include-code` to keep source
snippets in the embedded diagnostics bundle, and `--open` to launch the file in
your default browser after it is generated.

## Related Docs

- `docs/GIT_INTEGRATION.md`: wire `semadiff` into `git diff` and `git difftool`.
- `docs/CONFIG.md`: config file shape, environment variables, and provenance output.
