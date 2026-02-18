# PR Viewer

`apps/pr-viewer` is a TanStack-based web app for inspecting semantic diffs on GitHub PRs.

## Development

From repo root:

```bash
pnpm --filter pr-viewer dev -- --host 127.0.0.1 --port 3000 --strictPort
curl -I http://127.0.0.1:3000/
```

## Scripts

```bash
pnpm --filter pr-viewer build
pnpm --filter pr-viewer preview
pnpm --filter pr-viewer typecheck
pnpm --filter pr-viewer test
```

## Notes

- Server-side calls are implemented in `src/server/pr.server.ts`.
- Shared response types are in `src/shared/types.ts`.
- Main route UI is in `src/routes/index.tsx`.
