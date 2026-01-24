# Project Setup

Initialize the workspace for CLI plus extension builds using Vite, React, TypeScript.

## Requirements
- Vite + React + TypeScript scaffold for extension UI.
- Tailwind configured with tokens for diff operations.
- Playwright installed via `npx playwright install`; `playwright.config.ts` present; `e2e/smoke.spec.ts` present.

## E2E Test
Write test in `e2e/smoke.spec.ts` that verifies:
- Extension UI renders in Playwright run.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] `pnpm test:e2e` runs in CI
