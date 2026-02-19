# Effect v4 Override Experiment (Archived)

Date: 2026-02-18
Experiment branch: `experiment/effect-v4-overrides`
Baseline branch at that time: `chore/effect-v4-readiness`

## Historical context

This document recorded an early forced-override run on `effect@4.0.0-beta.0`.
It is preserved as migration history only and is not the current state.

## Current status (2026-02-19)

- Workspace is on `effect@4.0.0-beta.5`.
- Test integration is on `@effect/vitest@4.0.0-beta.5`.
- CLI runtime uses `@effect/platform-node@4.0.0-beta.5` via
  `NodeServices.layer`.
- CLI command model uses `effect/unstable/cli`.
- `pnpm quality`, `pnpm effect:v4:readiness -- --strict`, and `pnpm test:e2e`
  pass on the migration branch.

## Why this file remains

The `beta.0` experiment captured useful early breakpoints (API and service
typing shifts) before the current migration path stabilized. Keep it as a
record, but rely on `docs/EFFECT_V4_READINESS.md` and
`docs/effect-v4-migration-notes.md` for current guidance.
