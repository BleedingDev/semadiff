# Extension Fetch Blobs

Fetch base plus head file contents in GitHub page context.

## Requirements
- Uses in-page auth context with no token storage.
- Handles large files plus missing blobs gracefully.
- Computes semantic diff locally per file.

## E2E Test
Write test in `e2e/extension-fetch-blobs.spec.ts` that verifies:
- Blob fetch failure yields user-visible error state.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Large file guardrails applied
