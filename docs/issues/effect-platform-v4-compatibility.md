# Draft Issue: `@effect/platform` Effect v4 Compatibility

## Title

`@effect/platform` latest release still peers on Effect v3 (`^3.x`) and blocks v4 beta migration

## Target Repository

`Effect-TS/effect`

## Summary

Effect v4 beta is available (`effect@4.0.0-beta.4` on the `beta` tag), but `@effect/platform` latest release still declares a v3-only peer dependency on `effect`.

Projects using `@effect/platform` (directly or via `@effect/cli`) cannot adopt v4 without peer-range overrides.

## Reproduction

Run:

```bash
npm view effect@4.0.0-beta.4 version --json
npm view @effect/platform@latest version --json
npm view @effect/platform@latest peerDependencies --json
```

Observed on 2026-02-19:

- `effect@4.0.0-beta.4` exists.
- `@effect/platform@0.94.5` is latest.
- `@effect/platform@0.94.5` has `peerDependencies.effect: "^3.19.17"`.

## Expected

- A `@effect/platform` release with Effect v4-compatible peer range.

## Actual

- Current peer range excludes Effect v4 beta.

## Impact

- Platform-backed apps are blocked from a realistic v4 migration trial.
- Any v4 migration branch hits dependency constraints before code migration can be validated.

## Request

1. Confirm target release/timeline for Effect v4-compatible `@effect/platform`.
2. Share recommended upgrade path for projects currently on `@effect/platform@0.94.x`.
3. Confirm whether dependent packages should wait for a coordinated stack release.
