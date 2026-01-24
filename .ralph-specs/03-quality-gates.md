# Quality Gates

Add lint, format, typecheck, test gates required by PRD.

## Requirements
- Ultracite + Biome config with repo-wide checks.
- `tsc --noEmit` strict typecheck script.
- Single command runs lint, format check, typecheck, tests, coverage.

## E2E Test
Write test in `e2e/quality-gates.spec.ts` that verifies:
- `pnpm quality` exits zero in CI.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] CI uses required checks list
