# @semadiff/pr-client

Promise and Effect clients for the SemaDiff PR diff API.

## Exports

- `createHttpPrDiffClient(options)` - Promise-based client over HTTP GET endpoints.
- `makePrDiffEffectClient(client)` - wraps a Promise client as an Effect client.
- `PrDiffClient` and `PrDiffClientLive` - Effect service tag and layer.
- `makeHttpPrDiffClientLive(options)` - Effect layer backed by HTTP transport.
- Shared contract types are re-exported from `@semadiff/pr-backend`.

## HTTP Client Example

```ts
import { createHttpPrDiffClient } from "@semadiff/pr-client";

const client = createHttpPrDiffClient({
  baseUrl: "https://your-app.example.com",
});
```

Default endpoints:

- `GET /api/semadiff/pr/summary`
- `GET /api/semadiff/pr/file-diff`
- `GET /api/semadiff/pr/file-diff-document`
