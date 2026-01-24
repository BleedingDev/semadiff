# JSON Renderer

Render versioned JSON diff output.

## Requirements
- JSON schema is versioned plus exported.
- Output includes insert, delete, update, move ops with metadata.
- JSON output validates against schema.

## E2E Test
Write test in `e2e/render-json.spec.ts` that verifies:
- JSON output validates with schema file.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Schema version is documented
