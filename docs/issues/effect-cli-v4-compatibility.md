# Archived Issue: `@effect/cli` Effect v4 Compatibility

## Status

Resolved for this repository as of 2026-02-19.

We no longer depend on published `@effect/cli`. The CLI now uses
`effect/unstable/cli` and runs on `@effect/platform-node` services, all aligned
to `effect@4.0.0-beta.5`.

## Why this file still exists

This issue draft is kept as migration history only. It captured a real blocker
on earlier v4 betas, when `@effect/cli` packages still peered on Effect v3.

## Current migration path used here

1. Replace `@effect/cli` package usage with imports from `effect/unstable/cli`.
2. Provide runtime services with `@effect/platform-node` (`NodeServices.layer`).
3. Keep `effect`, `@effect/vitest`, and `@effect/platform-node` on the same beta.
