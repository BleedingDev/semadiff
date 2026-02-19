# Draft Issue: Official CLI Runtime Layer for Effect v4

## Title

Effect v4 CLI requires custom local service layer to run without `@effect/platform-*`

## Summary

We migrated a CLI to `effect@4.0.0-beta.4` and removed `@effect/platform-*` dependencies.

To do that, we had to provide a custom local layer for the `effect/unstable/cli` runtime environment (`ChildProcessSpawner | FileSystem | Path | Terminal`) and run with `Effect.runPromiseExit`.

This works for our current command surface, but it requires local runtime shims that should ideally be provided by upstream as an official Effect v4 runtime layer.

## Reproduction

1. Build a CLI with `effect/unstable/cli`.
2. Remove `@effect/platform-node` / `@effect/platform-bun`.
3. Try to run `Command.runWith(...)` program directly with `Effect.runPromiseExit(...)` without providing runtime services.

## Observed

The command effect requires environment services:

- `ChildProcessSpawner`
- `FileSystem`
- `Path`
- `Terminal`

Without these, type-checking/runtime wiring fails.  
To proceed, projects must provide local implementations.

## Expected

One of:

1. An official v4 runtime layer in main `effect` for CLI execution contexts.
2. A documented, recommended minimal runtime-layer constructor for CLI apps in v4.

## Why this matters

Effect v4 consolidation is significantly improved, but projects still need custom runtime shims for `effect/unstable/cli` when avoiding `@effect/platform-*`.
