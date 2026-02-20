# @semadiff/react-ui

Embeddable React UI component for browsing SemaDiff PR diffs.

## Exports

- `SemaDiffExplorer` - full explorer UI component.
- `ChangeTotals` - additions/deletions badge component.
- `findFirstChangedLine`, `scrollDiffDocumentToFirstChange`, `focusFirstDiffChange`.

## Notes

- Import the package stylesheet once in your host app:
  - `import "@semadiff/react-ui/styles.css";`
- The stylesheet scopes styles to the `.sd-app` root class used by `SemaDiffExplorer`.
