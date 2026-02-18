# @semadiff/core

Core diff engine and schemas.

## Exposes

- `structuralDiff`
- `explainDiff`
- config schema + merge/decode helpers
- JSON render helper
- diagnostics bundle helpers
- telemetry service + live layer

## Build

```bash
pnpm --filter @semadiff/core build
```

## Tests

```bash
pnpm -s test packages/core/test/core.spec.ts
```
