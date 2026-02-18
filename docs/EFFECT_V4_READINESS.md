# Effect v4 Beta Readiness

Last updated: 2026-02-18

This repository is on a dedicated prep branch: `chore/effect-v4-readiness`.

## Why this exists

Effect published `effect@4.0.0-beta.0` and announced a major migration surface (smaller runtime, package consolidation, and API changes).  
Source: https://effect.website/blog/releases/effect/40-beta/

## Key v4 beta signals (from upstream)

- `effect@4.0.0-beta.0` is available.
- The v4 effort is based on the smaller `effect-smol` architecture.
- Functionality from several `@effect/*` packages is being moved into `effect` under unstable modules.
- Upstream migration docs are maintained in `effect-smol`:
  - https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md
  - https://github.com/Effect-TS/effect-smol/tree/main/migration

## Automated readiness check

Run:

```bash
pnpm effect:v4:readiness
```

Strict mode (non-zero exit on blockers):

```bash
pnpm effect:v4:readiness -- --strict
```

Current result (as of this update):

- `pnpm effect:v4:readiness` => `Ready now: yes`
- `pnpm effect:v4:readiness -- --strict` => exit code `0`

## What is complete

- Removed API migration is complete:
  - no `Context.Tag(...)`
  - no `Effect.Service<...>()(...)`
  - no `Effect.catchAll(...)`
  - no `Effect.Service.Default`
  - no `Effect.Service` `dependencies` option
- Workspace dependencies are aligned to v4 beta where required:
  - `effect@^4.0.0-beta.0`
  - `@effect/platform-bun@^4.0.0-beta.0`
  - `@effect/platform-node@^4.0.0-beta.0`
  - `@effect/vitest@^4.0.0-beta.0`
  - `vitest@^3.2.4`
- Full validation passes:
  - `lint`
  - `format:check`
  - `typecheck`
  - `build`
  - `test`
  - `test:app`
  - coverage pipeline via `pnpm quality`

## Remaining caveats

- CLI remains on unstable v4 module surface (`effect/unstable/cli`), which is expected and may change across beta releases.
- Platform and Vitest integrations are still separate packages (`@effect/platform-bun`, `@effect/platform-node`, `@effect/vitest`), not collapsed into a single `effect` import surface.

## Ongoing guardrail

Keep `pnpm effect:v4:readiness -- --strict` in migration validation so regressions to removed APIs or incompatible effect peer constraints fail early.
