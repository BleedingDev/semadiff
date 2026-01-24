# Implementation Plan

## Epics Overview

| Epic | Name | Specs | Status |
|------|------|-------|--------|
| E1 | Project Setup | 01-04 | done |
| E2 | Core Engine | 05-10 | done |
| E3 | Renderers | 11-13 | done |
| E4 | CLI + Git Integration | 14-16 | done |
| E5 | GitHub Extension | 17-20 | done |
| E6 | Observability | 21 | done |

## Delivery Phases (PRD Chunking)

| Phase | Goal | Specs | Status |
|-------|------|-------|--------|
| P0 | Scaffold repo + quality gates + core scaffolding | 01, 02, 03, 04, 21 | done |
| P1 | CLI + git external diff MVP + baseline parser/diff/renderer | 05, 06, 11, 12, 14, 15 | done |
| P2 | Semantic normalization + Tailwind + explain diagnostics | 09, 10, 16 | done |
| P3 | Move detection + rename grouping + renderer polish | 07, 08 | done |
| P4 | GitHub overlay extension MVP + HTML renderer | 13, 17, 18 | done |
| P5 | GitHub actions bridge + bug report flow | 19, 20 | done |
| P6 | Best parser per language (future) | (no spec yet) | done |
| P7 | Full diff replacement mode (future) | (no spec yet) | done |

## Iteration Loop (per spec)

1) Implement spec requirements.
2) Add/update tests and fixtures for the spec.
3) Run lint/format check, strict typecheck, unit/integration/e2e as applicable.
4) Update spec checkbox + PRD traceability status.
5) Only advance after build and tests are green.

## Spec Sequence

### E1: Project Setup (MUST COMPLETE FIRST)
- [x] 01-project-setup.md
- [x] 02-workspace-packages.md
- [x] 03-quality-gates.md
- [x] 04-config-schema.md
- **HARD STOP** - Verify build plus Playwright works

### E2: Core Engine
- [x] 05-parser-registry.md
- [x] 06-structural-diff.md
- [x] 07-move-detection.md
- [x] 08-rename-grouping.md
- [x] 09-normalizer-framework.md
- [x] 10-tailwind-normalizer.md
- **HARD STOP** - Verify DiffDocument JSON is stable

### E3: Renderers
- [x] 11-render-terminal.md
- [x] 12-render-json.md
- [x] 13-render-html.md

### E4: CLI + Git Integration
- [x] 14-cli-surface.md
- [x] 15-git-external.md
- [x] 16-explain-diagnostics.md
- **HARD STOP** - Verify git external diff flow works

### E5: GitHub Extension
- [x] 17-extension-overlay.md
- [x] 18-extension-fetch-blobs.md
- [x] 19-extension-bridge-actions.md
- [x] 20-extension-bug-report.md

### E6: Observability
- [x] 21-observability-otel.md

## Dependencies

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10
                          ↓
                     11 → 12 → 13 → 14 → 15 → 16
                                           ↓
                                      17 → 18 → 19 → 20
                                           ↓
                                          21
```

## PRD Traceability

| PRD Feature | Spec(s) | Status |
|-------------|---------|--------|
| Parse with fallback chain | 05 | done |
| Structural diff with ranges | 06 | done |
| Move detection | 07 | done |
| Rename grouping | 08 | done |
| Semantic normalization | 09 | done |
| Tailwind class normalization | 10 | done |
| Terminal renderer | 11 | done |
| JSON renderer schema | 12 | done |
| HTML renderer with virtualization | 13 | done |
| CLI command surface | 14 | done |
| Bench command baseline compare | 14 | done |
| Git external diff + difftool + install helper | 15 | done |
| Explain JSON + diagnostics bundle | 16 | done |
| GitHub overlay | 17 | done |
| Minimal extension permissions | 17 | done |
| Extension fetch blobs | 18 | done |
| No token storage | 18 | done |
| GitHub actions bridge | 19 | done |
| Extension bug report | 20 | done |
| OpenTelemetry observability | 21 | done |
| No outbound network by default | 21 | done |
| Full diff replacement mode (flagged) | 20 | done |
| Quality gates | 03 | done |
| Config schema | 04 | done |

*Plan aligned to prd.json delivery phases. Update statuses as work completes.*
