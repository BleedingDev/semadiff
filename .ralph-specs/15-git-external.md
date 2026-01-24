# Git External Diff

Implement git external diff contract plus difftool wrapper.

## Requirements
- 7-arg external diff contract implemented with /dev/null handling.
- Difftool wrapper reads standard git difftool env vars.
- Install helper prints config snippet plus verification checklist plus docs entry.

## E2E Test
Write test in `e2e/git-external.spec.ts` that verifies:
- Temp repo uses external diff for git diff plus git show.

## Done when
- [ ] Build passes
- [ ] E2E test passes
- [ ] install-git output matches docs
