# Terminal Renderer

Render terminal diff output for DiffDocument.

## Requirements
- Unified mode supported.
- Side-by-side mode supported.
- Output formatting stable for snapshot tests.

## E2E Test
Write test in `e2e/render-terminal.spec.ts` that verifies:
- Snapshot output matches fixture.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] ANSI output is default renderer
