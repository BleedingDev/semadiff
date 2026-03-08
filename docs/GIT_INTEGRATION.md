# Git Integration

SemaDiff exposes three git-facing commands:

- `install-git`: prints the git config snippets.
- `git-external`: implements Git's external diff contract.
- `difftool`: wraps the two-file handoff used by `git difftool`.

Most users only need `install-git` and normal Git commands.

## 1. Print the Setup Snippet

Inside this repository:

```bash
./scripts/semadiff install-git
```

With an installed CLI:

```bash
semadiff install-git
```

That prints the exact `diff.external` and `difftool` entries expected by SemaDiff.

## 2. Configure Git External Diff

Global setup:

```bash
git config --global diff.external "semadiff git-external"
```

Repository-local setup:

```bash
git config diff.external "semadiff git-external"
```

If you are testing from a checkout instead of an installed CLI, replace `semadiff` with the absolute path to `scripts/semadiff`.

Verify it with normal Git commands:

```bash
git diff --ext-diff
git diff --cached --ext-diff
git show --ext-diff
git log -p --ext-diff -1
```

Git still decides which file pairs changed. `semadiff git-external` only renders each pair it receives from Git.

## 3. Configure Git Difftool

Global setup:

```bash
git config --global difftool.semadiff.cmd 'semadiff difftool $LOCAL $REMOTE'
```

Repository-local setup:

```bash
git config difftool.semadiff.cmd 'semadiff difftool $LOCAL $REMOTE'
```

If you are testing from a checkout instead of an installed CLI, replace `semadiff` with the absolute path to `scripts/semadiff`.

Verify it:

```bash
git difftool --tool=semadiff
git difftool --tool=semadiff --cached
```

## 4. Typical Review Loop

```bash
# Render through git's external diff path
git diff --ext-diff
git diff --cached --ext-diff

# Open the explicit two-file difftool wrapper
git difftool --tool=semadiff
```

If you want machine-readable output instead of Git's diff UI, use `semadiff git-hybrid` directly:

```bash
./scripts/semadiff git-hybrid --staged
./scripts/semadiff git-hybrid --from HEAD~1 --to HEAD --compact
```

## 5. Config and Troubleshooting

The same config resolution applies to `diff`, `git-external`, `difftool`, and `git-hybrid`. Inspect it with:

```bash
./scripts/semadiff config
./scripts/semadiff doctor
```

If the CLI is installed, replace `./scripts/semadiff` with `semadiff`.

To remove the Git integration:

```bash
git config --global --unset diff.external
git config --global --unset difftool.semadiff.cmd
```

## Notes

- `git-external` receives the standard 7-argument contract from Git and should not fail just because files differ.
- Binary files are detected and skipped with a message instead of breaking the whole diff.
- `install-git` prints the minimal config. You can apply it globally or per repository.
