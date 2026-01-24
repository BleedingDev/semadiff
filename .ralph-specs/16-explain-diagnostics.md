# Explain Diagnostics

Provide explain JSON output plus diagnostics bundle schema.

## Requirements
- Explain output includes match, move, rename rationale.
- Diagnostics bundle schema supports redaction plus versioning.
- Bundle output is used by bug report flow.

## E2E Test
Write test in `e2e/explain-diagnostics.spec.ts` that verifies:
- Explain JSON validates against schema.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Diagnostics bundle redacts code by default
