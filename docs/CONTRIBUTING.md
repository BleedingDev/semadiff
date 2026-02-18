# Contributing

## Local setup

```bash
pnpm install
pnpm build
pnpm quality
pnpm test:e2e -- e2e/smoke.spec.ts
```

## Development workflow

1. Keep commits small and single-purpose.
2. Validate after each change set:
   - `pnpm quality`
   - targeted tests for changed area
3. Run full e2e before merging risky refactors.

## Adding a parser

1. Add/update implementation package (`packages/parser-*`).
2. Expose parser definitions through `packages/parsers` registry.
3. If parser requires runtime WASM assets:
   - add grammar entry to `scripts/wasm-files.mjs`
   - verify `copy-wasm` still succeeds
   - run `scripts/verify-wasm-assets.mjs` for extension/dist targets
4. Add unit tests and at least one e2e fixture for fallback/selection behavior.
5. Update package README if parser capabilities changed.

## Adding a normalizer rule

1. Extend normalizer types/config surfaces:
   - `packages/core/src/normalizers.ts`
   - `packages/core/src/config.ts`
2. Implement rule behavior in core diff/normalization flow.
3. Add tests:
   - unit behavior test in `packages/core/test`
   - e2e regression for "enabled vs disabled" behavior
4. Document config and env variable support in `docs/CONFIG.md`.

## CI expectations

A change is expected to keep these green:

- `pnpm quality`
- WASM verification (for parser/extension asset changes)
- e2e smoke on PR
- full e2e for `main`/nightly/manual workflows

## Release checklist (maintainers)

1. `pnpm quality`
2. `pnpm test:e2e`
3. Build and verify packable artifacts as needed.
4. Ensure docs/config/schema updates are included for user-facing changes.
