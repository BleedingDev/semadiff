# Extension Bridge Actions

Bridge overlay interactions to native GitHub actions.

## Requirements
- Click on overlay node scrolls plus highlights matching GitHub diff.
- Comment action opens native comment UI at nearest line.
- Resolve action triggers native resolve UI when present.

## E2E Test
Write test in `e2e/extension-bridge-actions.spec.ts` that verifies:
- Click flow plus comment flow operate on fixture DOM.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Wrong-line comments are prevented
