# @semadiff/react

React primitives for embedding SemaDiff.

## Exports

- `useSemaDiffExplorer(options)` - shared state and orchestration for PR summary, file filtering, selection, and diff prefetching.
- `toError(result)` and `toData(result)` helpers for `PrDiffResult<T>`.

The hook expects a client implementing:

- `getPrSummary`
- `getFileDiff`

from `@semadiff/pr-client` contracts.
