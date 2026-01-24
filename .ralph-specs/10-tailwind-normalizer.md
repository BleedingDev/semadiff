# Tailwind Normalizer

Normalize Tailwind class ordering in static class strings.

## Requirements
- Reorder of static class or className tokens yields no diff.
- Token add, remove, change yields a diff.
- Rule disabled via global or per-language config.

## E2E Test
Write test in `e2e/tailwind-normalizer.spec.ts` that verifies:
- Tailwind reorder fixture yields no semantic edits.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Rule toggle is honored in CLI output
