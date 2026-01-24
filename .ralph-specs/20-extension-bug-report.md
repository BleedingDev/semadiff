# Extension Bug Report

Implement in-overlay bug report flow.

## Requirements
- Diagnostic bundle is sanitized by default.
- User must confirm inclusion of code snippets.
- Flow opens prefilled issue link or copies to clipboard.

## E2E Test
Write test in `e2e/extension-bug-report.spec.ts` that verifies:
- Report flow creates bundle plus opens link.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Bug report respects opt-in rules
