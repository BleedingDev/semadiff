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

## Usage (React Compiler Friendly)

```tsx
import { createHttpPrDiffClient } from "@semadiff/pr-client";
import { SemaDiffExplorer } from "@semadiff/react-ui";
import "@semadiff/react-ui/styles.css";

const client = createHttpPrDiffClient({
	baseUrl: "https://your-app.example.com",
});

export function DiffScreen() {
	return <SemaDiffExplorer className="sd-app" client={client} />;
}
```

No `useMemo` is needed in this integration pattern.
