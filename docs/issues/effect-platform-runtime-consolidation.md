# Draft Issue: CLI Runtime Consolidation in Effect v4

## Title

Effect v4 CLI cannot drop `@effect/platform-node` / `@effect/platform-bun` yet due required platform services in command runtime context

## Summary

When attempting to run the CLI with pure `effect` runtime (`Effect.runPromiseExit`) and removing `@effect/platform-node` / `@effect/platform-bun`, the program no longer typechecks because the command effect still requires platform service context:

- `ChildProcessSpawner`
- `FileSystem`
- `Path`
- `Terminal`

This blocks full consolidation to the main `effect` package for CLI runtime execution.

## Reproduction

1. Remove platform runtime imports from `packages/cli/src/index.ts` and replace runtime launch with:

   - `Effect.runPromiseExit(cli(argv))`

2. Remove:

   - `@effect/platform-node`
   - `@effect/platform-bun`

   from `packages/cli/package.json`.

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
- a consolidated export path inside `effect` that provides the required platform services for Node/Bun runtime execution.

## Why this matters

Projects migrating to Effect v4 beta can now remove many legacy APIs and consolidate dependencies, but full parity is still blocked by required platform runtime layers for CLI entrypoint execution.
