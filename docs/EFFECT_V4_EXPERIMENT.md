# Effect v4 Override Experiment

Date: 2026-02-18  
Experiment branch: `experiment/effect-v4-overrides`  
Baseline branch: `chore/effect-v4-readiness`

## Goal

Validate practical breakpoints by forcing Effect v4 beta into the current workspace without changing application code.

## Temporary override used

Applied on the experiment branch (not kept committed):

```json
{
  "pnpm": {
    "overrides": {
      "effect": "4.0.0-beta.0",
      "@effect/platform-bun": "4.0.0-beta.0",
      "@effect/vitest": "4.0.0-beta.0"
    }
  }
}
```

## Commands run

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm -s quality
```

## Results

### 1) Install: `pass` with important peer warnings

- `@effect/vitest` upgraded to `4.0.0-beta.0`
- `effect` upgraded to `4.0.0-beta.0`
- Peer mismatch warning remained:
  - `@effect/vitest@4.0.0-beta.0` expects `vitest@^3.0.0`, workspace has `vitest@2.1.9`
- Existing non-Effect `tree-sitter` peer warnings were also reported.

### 2) Typecheck: `pass`

`pnpm typecheck` (`tsc -b`) completed successfully.

### 3) Full quality: `fail`

`pnpm -s quality` failed during app typecheck with Effect-v4-related type/API breakpoints.

Representative failures:

- `apps/pr-viewer/src/server/pr.server.ts`
  - `Effect.tapErrorCause` no longer exists on Effect v4 type surface.
  - Multiple environment (`R`) type inference failures (`unknown` vs expected service).
  - `yield* PrDiffService` / `yield* GitHubConfig` patterns fail type expectations.
- `apps/pr-viewer/src/routes/index.tsx`
  - `unknown` values no longer satisfy existing `ServerResult<...>` state assignments.

## Interpretation

Even with forced v4 overrides, the stack is not migration-ready end to end:

1. Dependency ecosystem is still partially v3-pegged (`@effect/cli`, `@effect/platform`).
2. Internal app/server code needs targeted migration for changed Effect APIs and service typing model.
3. Test stack alignment is required (`@effect/vitest@4` expects Vitest v3).

## Recommendation

Treat this as a proving run only. Keep production branches on v3 until:

1. Effect ecosystem versions align (`@effect/cli` + `@effect/platform` v4-compatible releases).
2. Service model migration (`Context.Tag`/`Effect.Service`) is completed.
3. App/server Effect API changes are applied and validated under full `quality`.
