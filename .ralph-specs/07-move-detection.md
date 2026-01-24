# Move Detection

Add move detection pass with nested changes.

## Requirements
- Moves identified as move ops when match confidence is high.
- Nested edits inside moved blocks are preserved.
- Move metadata includes confidence score.

## E2E Test
Write test in `e2e/move-detection.spec.ts` that verifies:
- Moved block fixture produces move op with nested edits.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Move ops appear in JSON renderer
