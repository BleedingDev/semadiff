# Resolved: Official CLI Runtime Layer for Effect v4

## Title

Effect v4 CLI can run on official `@effect/platform-node` runtime services (`NodeServices.layer`)

## Summary

Initially, this repository used a custom local runtime layer for `effect/unstable/cli` while preparing for Effect v4.

As of `effect@4.0.0-beta.5`, `@effect/vitest@4.0.0-beta.5`, and `@effect/platform-node@4.0.0-beta.5`, the CLI runtime now uses upstream Node services via `NodeServices.layer` in `packages/cli/src/runtime-layer.ts`.

This removes the in-house shim path and keeps runtime wiring on official package surfaces.

## Previous Reproduction (Historical)

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
Without platform services, projects must provide local implementations.

## Resolution

- `packages/cli` now depends on `@effect/platform-node@4.0.0-beta.5`.
- `packages/cli/src/runtime-layer.ts` now exports `NodeServices.layer`.
- `packages/cli/test/runtime-layer.spec.ts` validates required service availability from the official runtime layer.

The underlying requirement remains expected behavior: `effect/unstable/cli` needs `ChildProcessSpawner | FileSystem | Path | Terminal`, and `@effect/platform-node` is now the standard way this repository provides those services.
