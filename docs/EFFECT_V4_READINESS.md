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

## Current blockers in this repo

### 1) Removed API usage still present

The codebase currently uses APIs called out as removed or renamed in v4 migration docs:

- `Context.Tag(...)`
- `Effect.Service<...>()(...)`
- `Effect.Service.Default`
- `Effect.Service` `dependencies` option

Note: direct `Effect.catchAll(...)` callsites were reduced to zero by introducing local compatibility aliases (`catchRecoverable`) so that future v4 change can be done in one place per file.

### 2) Ecosystem package constraints

The workspace currently depends on packages that (latest release metadata) still declare `effect` peers in `^3.x`:

- `@effect/cli`
- `@effect/platform`

`@effect/platform-bun` and `@effect/vitest` already publish `4.0.0-beta.0`, but we cannot do a full clean switch while core CLI/platform dependencies are still pinned to v3 peer constraints.

## Practical migration plan for this repo

1. Keep running `pnpm effect:v4:readiness` while upstream releases move.
2. When `@effect/cli` and `@effect/platform` publish Effect v4-compatible versions:
   - bump Effect stack dependencies on this branch,
   - run `pnpm -s quality`,
   - fix compile/runtime breakages.
3. Apply code migration in this order:
   - service definitions (`Context.Tag`, `Effect.Service`) to v4 service APIs,
   - switch compatibility aliases from `Effect.catchAll` to v4 `Effect.catch`,
   - remaining migration-doc deltas (runtime/yieldable/forking/fiberref/cause as needed).
4. Merge once full test + typecheck passes on v4 stack.

## Candidate upstream issues to file (if still unresolved)

- `@effect/cli` v4 compatibility and peer range timeline.
- `@effect/platform` v4 compatibility and peer range timeline.
- Migration guidance for projects that currently use `Effect.Service.Default` and `dependencies`.
