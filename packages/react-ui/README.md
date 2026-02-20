# @semadiff/react-ui

Embeddable React UI component for browsing SemaDiff PR diffs.

## Exports

- `SemaDiffExplorer` - full explorer UI component.
- `ChangeTotals` - additions/deletions badge component.
- `findFirstChangedLine`, `scrollDiffDocumentToFirstChange`, `focusFirstDiffChange`.

## Notes

- This package reuses the same `sd-*` CSS class contract as `apps/pr-viewer`.
- Host apps should include compatible styles (currently provided by `apps/pr-viewer/src/App.css`).
