# Embeddable API Contract (Plate 1)

## Goal

Define a stable public contract for embedding SemaDiff into React 19+ apps and for consuming data through Promise and Effect APIs. This is a contract-first milestone before extraction/refactoring work.

## Scope In This Plate

- Define shared request/response/error shapes for an embeddable client API.
- Lock those shapes with type-level contract tests.
- Document the React component/hook contract that the next plates will implement.

## Current Source Of Truth

- Client contract types: `packages/pr-backend/src/embed-api.ts`
- Contract tests: `packages/pr-backend/test/embed-api.contract.spec.ts`

## Data And Error Contract

The client contract is intentionally compatible with current backend payloads:

- `PrSummary`
- `FileDiffPayload`
- `FileDiffDocument`

Errors are normalized into:

- `PrDiffClientError`:
  - `code`: one of `InvalidPrUrl`, `GitHubRateLimitError`, `GitHubRequestError`, `GitHubDecodeError`, `PrFileNotFound`, `Error`, `UnknownError`, or future custom string codes.
  - `message`: human-readable text.

Result envelope:

- `PrDiffResult<T>`:
  - `{ ok: true; data: T }`
  - `{ ok: false; error: PrDiffClientError }`

## Promise Client Contract

```ts
interface PrDiffClientContract {
  getPrSummary(input: { prUrl: string }): Promise<PrDiffResult<PrSummary>>;
  getFileDiff(input: {
    prUrl: string;
    filename: string;
    contextLines?: number;
    lineLayout?: "split" | "unified";
    lineMode?: "semantic" | "raw";
    hideComments?: boolean;
    detectMoves?: boolean;
  }): Promise<PrDiffResult<FileDiffPayload>>;
  getFileDiffDocument(input: {
    prUrl: string;
    filename: string;
    contextLines?: number;
    lineLayout?: "split" | "unified";
    detectMoves?: boolean;
  }): Promise<PrDiffResult<FileDiffDocument>>;
}
```

## Effect Client Contract

```ts
interface PrDiffEffectClientContract {
  getPrSummary(
    input: { prUrl: string }
  ): Effect.Effect<PrSummary, PrDiffClientError>;
  getFileDiff(
    input: GetFileDiffInput
  ): Effect.Effect<FileDiffPayload, PrDiffClientError>;
  getFileDiffDocument(
    input: GetFileDiffDocumentInput
  ): Effect.Effect<FileDiffDocument, PrDiffClientError>;
}
```

## Planned React Contract (Next Plates)

This plate documents the target API; implementation begins in the extraction plates.

```ts
interface SemaDiffExplorerProps {
  client: PrDiffClientContract;
  prUrl?: string;
  initialPrUrl?: string;
  onPrUrlChange?: (prUrl: string) => void;
  selectedFile?: string | null;
  onSelectedFileChange?: (filename: string | null) => void;
  fileFilter?: string;
  onFileFilterChange?: (value: string) => void;
  lineLayout?: "split" | "unified";
  onLineLayoutChange?: (layout: "split" | "unified") => void;
  hideComments?: boolean;
  onHideCommentsChange?: (hide: boolean) => void;
  compareMoves?: boolean;
  onCompareMovesChange?: (value: boolean) => void;
  onDiffLoaded?: (filename: string, result: PrDiffResult<FileDiffPayload>) => void;
}

interface UseSemaDiffExplorerStateInput {
  client: PrDiffClientContract;
  prUrl?: string;
  initialPrUrl?: string;
  contextLines?: number;
  lineLayout?: "split" | "unified";
  hideComments?: boolean;
  compareMoves?: boolean;
}
```

## Embed Quickstart (React 19+)

Use a module-level client instance and pass it directly to `SemaDiffExplorer`.
This keeps examples React Compiler friendly (no manual `useMemo` required).

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

Expected backend endpoints for `createHttpPrDiffClient` default config:

- `GET /api/semadiff/pr/summary`
- `GET /api/semadiff/pr/file-diff`
- `GET /api/semadiff/pr/file-diff-document`

## Migration Plates And Gates

1. Plate 1 (this one): contract and tests.
   - Gate: contract types + tests pass.
2. Plate 2: extract `@semadiff/pr-client` transport + Effect layer.
   - Gate: backend parity tests pass.
3. Plate 3: extract `useSemaDiffExplorer` state orchestration.
   - Gate: existing `pr-viewer` behavior parity tests pass.
4. Plate 4: extract embeddable React component package.
   - Gate: embed example apps work (React 19+).
5. Plate 5: migrate `apps/pr-viewer` to consume extracted packages only.
   - Gate: full quality + e2e regression pass.

## Current Status

- ✅ Plate 1 complete (`8cb3d74`)
- ✅ Plate 2 complete (`b3a05fc`)
- ✅ Plate 3 complete (`cf4098c`)
- ✅ Plate 4 complete (`1e703bf`)
- ✅ Plate 5 complete (`d06ff57`)
- ✅ Plate 6 complete: `@semadiff/react-ui` now ships `styles.css` for embed consumers (`ffa88bb`).

### Validation Notes

- Full `pnpm quality` passes on each plate commit.
- Workspace and app tests pass after Plate 6.
- `pnpm test:e2e` currently has one unrelated existing failure in `e2e/cli-pack.spec.ts`:
  - `Cannot find module 'effect/Latch'` in packed consumer runtime.
  - This failure is outside the React embed migration path and should be tracked separately.
