# Config Schema

Define resolved config schema with provenance for project, user, env.

## Requirements
- Schema covers normalizer toggles plus renderer options.
- Telemetry exporters opt-in via config or env.
- `semadiff config` prints resolved config with sources.

## E2E Test
Write test in `e2e/config.spec.ts` that verifies:
- Resolution order is env, user, project.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Schema validation rejects invalid config
