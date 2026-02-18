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
  - targeted v4 runtime/integration checks:
    - `pnpm exec playwright test e2e/cli-pack.spec.ts`
    - `pnpm exec vitest run packages/core/test/effect-vitest.spec.ts`
    - `pnpm exec playwright test e2e/parser-registry.spec.ts e2e/parser-chain.spec.ts e2e/render-html.spec.ts e2e/explain-diagnostics.spec.ts e2e/normalizer-framework.spec.ts e2e/tailwind-normalizer.spec.ts`

## Runtime verification runbook

Use this when validating migration parity after Effect beta bumps.

1. Verify baseline readiness:

   ```bash
   pnpm effect:v4:readiness -- --strict
   ```

2. Verify packed CLI runtime parity (Bun + Node):

   ```bash
   pnpm exec playwright test e2e/cli-pack.spec.ts
   ```

   Expected:
   - installs packed tarballs in an isolated consumer project
   - runs `dist/index.js --help` via Bun and Node
   - runs `dist/index.js diff` via Bun and Node

3. Verify Effect test harness parity:

   ```bash
   pnpm exec vitest run packages/core/test/effect-vitest.spec.ts
   ```

   Expected:
   - `@effect/vitest` layer provisioning with `ServiceMap.Service`
   - `TestClock.adjust` scheduling behavior
   - typed failure propagation from provided services

4. Verify eval/script JSON compatibility on v4 Schema API:

   ```bash
   pnpm exec playwright test e2e/parser-registry.spec.ts e2e/parser-chain.spec.ts e2e/render-html.spec.ts e2e/explain-diagnostics.spec.ts e2e/normalizer-framework.spec.ts e2e/tailwind-normalizer.spec.ts
   ```

   Expected:
   - no `Schema.parseJson` runtime usage
   - helper/script JSON encode/decode uses `Schema.UnknownFromJsonString` or `JSON.stringify`

## Remaining caveats

- CLI remains on unstable v4 module surface (`effect/unstable/cli`), which is expected and may change across beta releases.
- Platform and Vitest integrations are still separate packages (`@effect/platform-bun`, `@effect/platform-node`, `@effect/vitest`), not collapsed into a single `effect` import surface.

## Ongoing guardrail

Keep `pnpm effect:v4:readiness -- --strict` in migration validation so regressions to removed APIs or incompatible effect peer constraints fail early.
