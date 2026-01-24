# HTML Renderer

Render HTML diff output for extension overlay.

## Requirements
- HTML renders without external network.
- Virtualization handles large diffs.
- Output consumes DiffDocument schema.

## E2E Test
Write test in `e2e/render-html.spec.ts` that verifies:
- Large diff renders without crash.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] HTML output used by extension overlay
