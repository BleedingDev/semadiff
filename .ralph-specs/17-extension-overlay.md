# Extension Overlay

Create MV3 overlay UI on GitHub PR files view.

## Requirements
- Toggle button plus keyboard shortcut opens overlay.
- File list renders with lazy-load per file.
- Overlay uses shared HTML renderer output plus minimal manifest permissions.

## E2E Test
Write test in `e2e/extension-overlay.spec.ts` that verifies:
- Overlay injects on fixture PR page.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Overlay toggle state persists per session
