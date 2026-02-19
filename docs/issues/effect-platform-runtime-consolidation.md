# Draft Issue: CLI Runtime Consolidation in Effect v4

## Title

Effect v4 CLI cannot drop `@effect/platform-node` yet due required platform services in command runtime context

## Summary

This repository can run CLI via Bun and Node hosts using only `@effect/platform-node`, but cannot remove platform runtime packages entirely.

When attempting to run the CLI with pure `effect` runtime (`Effect.runPromiseExit`) and removing `@effect/platform-node`, the program no longer typechecks because the command effect still requires platform service context:

- `ChildProcessSpawner`
- `FileSystem`
- `Path`
- `Terminal`

This blocks full consolidation to the main `effect` package for CLI runtime execution.

## Reproduction

1. Remove platform runtime imports from `packages/cli/src/index.ts` and replace runtime launch with:

   - `Effect.runPromiseExit(cli(argv))`

2. Remove `@effect/platform-node` from `packages/cli/package.json`.

3. Run:

   ```bash
   pnpm --filter @semadiff/cli build
   ```

## Observed Errors

TypeScript fails with missing context services (from `packages/cli/src/index.ts` at runtime call site):

- `Missing 'ChildProcessSpawner | FileSystem | Path | Terminal' in the expected Effect context.`
- `Argument of type 'Effect<..., Environment>' is not assignable to parameter of type 'Effect<..., never>'`

## Expected

Either:

- a stable Effect v4 runtime path that can run `effect/unstable/cli` programs without explicit platform packages, or
- a consolidated export path inside `effect` that provides the required platform services for CLI runtime execution.

## Why this matters

Projects migrating to Effect v4 beta can now remove many legacy APIs and reduce platform deps (for example, this repo removed `@effect/platform-bun`), but full single-package parity is still blocked by required platform runtime layers for CLI entrypoint execution.
