# Effect v4 Migration Notes

## Current Status

- Branch: `chore/effect-v4-readiness`
- Workspace migrated to `effect@^4.0.0-beta.0`
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

`packages/pr-backend/src/github.ts` has effect-language-service advisories (not compile errors):

- `TS15` (prefer Effect-native error handling over `try/catch` inside generators)
- `TS44` (prefer Effect Schema JSON operations over `JSON.parse` / `JSON.stringify`)

These are candidates for a follow-up hardening plate, but they are not blocking build/tests right now.
