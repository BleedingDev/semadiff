# Structural Diff

Implement structure-aware diff that emits stable operations with ranges.

## Requirements
- Operations include insert, delete, update with line plus col ranges.
- Formatting-only changes yield minimal semantic edits when safe.
- Output ordering is deterministic for same inputs.

## E2E Test
Write test in `e2e/structural-diff.spec.ts` that verifies:
- Reformat-only fixture yields no semantic edits.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Diff output is deterministic across runs
