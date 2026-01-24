# Rename Grouping

Group repeated identifier rename patterns in diff output.

## Requirements
- Detect consistent identifier mapping across a file.
- DiffDocument includes rename group summary metadata.
- Renderer can collapse rename group summary.

## E2E Test
Write test in `e2e/rename-grouping.spec.ts` that verifies:
- Rename fixture yields a single rename group.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Rename summary appears in JSON output
