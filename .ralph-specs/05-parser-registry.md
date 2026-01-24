# Parser Registry

Implement parser registry with fallback chain for web-first languages.

## Requirements
- Tree-sitter parsers for ts, tsx, js, jsx, css, md, toml, yaml.
- Parser selection by extension plus optional content sniff.
- Fallback to text diff on parse error.
- Parser registry exposed as Effect service with tagged errors.

## E2E Test
Write test in `e2e/parser-registry.spec.ts` that verifies:
- Invalid parse returns text fallback without crash.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Registry reports parser capabilities
