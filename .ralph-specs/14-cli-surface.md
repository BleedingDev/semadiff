# CLI Surface

Build @effect/cli app with required command surface.

## Requirements
- CLI uses `@effect/cli` with commands diff, git-external, difftool, install-git, config, doctor, bench, explain.
- Bench command outputs JSON report plus baseline compare.
- Stdout, stderr deterministic; exit code 0 on success; nonzero only for internal error; git external mode exits 0 on differences.
- ANSI default output plus plain plus JSON; stdin inputs supported; binary files handled.

## E2E Test
Write test in `e2e/cli-surface.spec.ts` that verifies:
- `semadiff --help` lists all commands.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] CLI help matches snapshot
