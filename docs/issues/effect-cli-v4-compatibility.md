# Draft Issue: `@effect/cli` Effect v4 Compatibility

## Title

`@effect/cli` latest release still peers on Effect v3 (`^3.x`) and blocks v4 beta migration

## Target Repository

`Effect-TS/effect`

## Summary

Effect v4 beta is published (`effect@4.0.0-beta.0`), but `@effect/cli` latest release still declares a v3-only peer dependency on `effect`.

This blocks projects that use `@effect/cli` from testing or adopting v4 without force-overrides.

## Reproduction

Run:

```bash
npm view effect@4.0.0-beta.0 version --json
npm view @effect/cli@latest version --json
npm view @effect/cli@latest peerDependencies --json
```

Observed on 2026-02-18:

- `effect@4.0.0-beta.0` exists.
- `@effect/cli@0.73.2` is latest.
- `@effect/cli@0.73.2` has `peerDependencies.effect: "^3.19.16"`.

## Expected

- A `@effect/cli` release that supports Effect v4 (or clear guidance + timeline).

## Actual

- Peer dependency range excludes Effect v4.

## Impact

- CLI projects are pinned to Effect v3 even when they want to evaluate v4 beta.
- Migration work must be deferred or done behind brittle overrides.

## Request

1. Confirm planned `@effect/cli` version for Effect v4 support.
2. Share migration notes specific to `@effect/cli` users (if any).
3. Clarify whether interim beta tags are planned before stable.
