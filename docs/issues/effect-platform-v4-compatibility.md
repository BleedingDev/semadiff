# Archived Issue: `@effect/platform` Effect v4 Compatibility

## Status

Resolved for this repository as of 2026-02-19.

We no longer depend on published `@effect/platform`. Runtime services are now
provided by `@effect/platform-node` while CLI primitives come from
`effect/unstable/cli`, aligned to `effect@4.0.0-beta.5`.

## Why this file still exists

This issue draft is kept as migration history only. It documented the earlier
peer-range blocker when `@effect/platform` still targeted Effect v3.

## Current migration path used here

1. Remove `@effect/platform` and `@effect/cli` package dependencies.
2. Adopt `effect/unstable/cli` for command primitives.
3. Adopt `@effect/platform-node` (`NodeServices.layer`) for filesystem,
   terminal, path, and child-process services.
4. Keep all v4 beta package versions aligned in lockstep.
