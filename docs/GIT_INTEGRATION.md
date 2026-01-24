# Git Integration (External Diff + Difftool)

SemaDiff provides a git external diff command and a difftool wrapper. These work with modern git versions that support `diff.external`.

## External Diff

Add the external diff configuration (global or per-repo):

```ini
[diff]
  external = semadiff git-external
```

Verify:

```bash
git diff --ext-diff
git show --ext-diff
git log -p --ext-diff
```

## Difftool

Configure a difftool entry:

```ini
[difftool "semadiff"]
  cmd = semadiff difftool $LOCAL $REMOTE
```

Verify:

```bash
git difftool --tool=semadiff
```

## Helper Command

The CLI can print these snippets:

```bash
semadiff install-git
```

## Notes

- `git-external` receives the standard 7-argument contract from git and should never fail just because files differ.
- Binary files are detected and skipped with a message.
- Configuration can be inspected with `semadiff config`.
