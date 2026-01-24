# Normalizer Framework

Provide rule-based semantic normalizer framework.

## Requirements
- Normalizer rules have id, language scope, safety level, default flag.
- Rules enable or disable globally or per-language via config.
- Rule tests cover conservative behavior.

## E2E Test
Write test in `e2e/normalizer-framework.spec.ts` that verifies:
- Disabling a rule changes diff output for a fixture.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] Rule list is exposed in config output
