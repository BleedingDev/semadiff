# Effect v4 Migration Notes

## Current Status

- Branch: `chore/effect-v4-readiness`
- Workspace migrated to `effect@^4.0.0-beta.0`
- Readiness check now reports `Ready now: yes` (`pnpm effect:v4:readiness -- --strict` passes)
- Validation status: `lint`, `format:check`, `typecheck`, `build`, `test`, `test:app`, and coverage pipeline are passing

## Package Surface Findings

### CLI

- The CLI API is currently consumed from `effect/unstable/cli`.
- There is no stable `effect/cli` export in the installed v4 beta.
- This is an expected `unstable` dependency and may break across beta updates.

### Platform (Bun)

- Bun runtime/services are still provided by `@effect/platform-bun`.
- We use `BunRuntime` and `BunServices` from that package.
- This is not collapsed into the main `effect` package export surface.

### Vitest Integration

- Effect-aware Vitest helpers are still in `@effect/vitest`.
- `vitest` itself remains a separate dependency.
- `@effect/vitest` and `effect` versions should be kept aligned during upgrades.

## Peer/Version Constraints Guidance

- Do not collapse constraints to only `effect` yet.
- Keep the following aligned per upgrade step:
  - `effect`
  - `@effect/platform-bun`
  - `@effect/vitest`
  - `vitest`

## Remaining Non-Blocking Advisories

The previous `TS15`/`TS44` effect-language-service advisories in `packages/pr-backend/src/github.ts` were eliminated by replacing in-generator `try/catch` and raw `JSON.parse`/`JSON.stringify` with Schema effectful decode/encode flows.
