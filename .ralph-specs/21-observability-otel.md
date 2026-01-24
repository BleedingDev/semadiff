# Observability OTel

Add OpenTelemetry tracing for CLI plus extension.

## Requirements
- Spans defined for CLI run, parse, normalize, diff, render.
- Extension spans cover overlay open, fetch blobs, parse, diff, render.
- Exporters are opt-in via config or env with console default plus no outbound network by default.

## E2E Test
Write test in `e2e/observability-otel.spec.ts` that verifies:
- Enabling console exporter emits spans for a CLI run.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Attributes include language plus op counts
