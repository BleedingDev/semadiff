# Effect v4 Migration Notes

## Current Status

- Branch: `chore/effect-v4-readiness`
- Workspace migrated to `effect@4.0.0-beta.3`
- Readiness check now reports `Ready now: yes` (`pnpm effect:v4:readiness -- --strict` passes)
- Validation status: `lint`, `format:check`, `typecheck`, `build`, `test`, `test:app`, and coverage pipeline are passing

## Package Surface Findings

### CLI

- The CLI API is currently consumed from `effect/unstable/cli`.
- There is no stable `effect/cli` export in the installed v4 beta.
- This is an expected `unstable` dependency and may break across beta updates.

### Platform (Bun)

- Bun runtime/services are still provided by `@effect/platform-bun`.
- Node runtime/services are provided by `@effect/platform-node`.
- CLI entrypoint now selects Bun vs Node runtime at startup and runs on both engines.
- Packed CLI e2e (`e2e/cli-pack.spec.ts`) validates both runtime branches.
- This is not collapsed into the main `effect` package export surface.

### Vitest Integration

- `vitest` itself remains a separate dependency.
- We run Effect integration tests with a local harness:
  - `Effect.runPromise(...)`
  - `Effect.scoped`
  - `TestClock.layer()` from `effect/testing/TestClock`
- We now have explicit harness coverage in `packages/core/test/effect-testing-harness.spec.ts` for:
  - `ServiceMap.Service` layer provisioning
  - `TestClock` scheduling
  - typed failure propagation

### Schema JSON Helpers

- `Schema.parseJson(...)` is not used in v4 migration paths anymore.
- e2e helper and benchmark scripts use `Schema.UnknownFromJsonString` for decode/encode.
- Bun eval snippets that only need serialization now use `JSON.stringify`.

## Validation runbook

Run these checks when upgrading any Effect beta:

1. `pnpm effect:v4:readiness -- --strict`
2. `pnpm quality`
3. `pnpm exec playwright test e2e/cli-pack.spec.ts`
4. `pnpm exec vitest run packages/core/test/effect-testing-harness.spec.ts`
5. `pnpm exec playwright test e2e/parser-registry.spec.ts e2e/parser-chain.spec.ts e2e/render-html.spec.ts e2e/explain-diagnostics.spec.ts e2e/normalizer-framework.spec.ts e2e/tailwind-normalizer.spec.ts`

## Peer/Version constraints guidance

- Do not collapse constraints to only `effect` yet.
- Keep the following aligned per upgrade step:
  - `effect`
  - `@effect/platform-bun`
  - `@effect/platform-node`
  - `vitest`

## Remaining Non-Blocking Advisories

The previous `TS15`/`TS44` effect-language-service advisories in `packages/pr-backend/src/github.ts` were eliminated by replacing in-generator `try/catch` and raw `JSON.parse`/`JSON.stringify` with Schema effectful decode/encode flows.
