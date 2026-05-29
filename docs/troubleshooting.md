# Troubleshooting

## `repo-meter` command not found

Install globally:

```bash
npm install -g repo-meter
```

Or run without install:

```bash
npx repo-meter
```

## PowerShell script execution issues

If PowerShell blocks `.ps1` shims, use:

- `repo-meter.cmd ...`
- or `npx repo-meter ...`

## Multi-repo launch looks wrong on Windows

Always quote repo paths if they contain spaces:

```powershell
repo-meter tui "C:\Users\name\repo-a" "C:\Users\name\repo-b"
repo-meter tui --repos "C:\Users\name\repo-a,C:\Users\name\repo-b"
```

## TUI `dirty` state seems incorrect

`dirty` means Git reports local changes.
If this seems wrong, compare with:

```bash
git status --porcelain=v1 --branch
```

`repo-meter` now ignores non-porcelain warning lines and CRLF-only noise patterns in fallback paths.

## Subfolder path in monolith shows whole repo totals

Current behavior is folder-scoped when you pass a nested path.
If you still see root totals, confirm the path entered is the target subfolder and not repo root.

## `ENOTCONN` during add prompt

This can happen if malformed command text is pasted directly into the prompt in older builds.
Use latest build and paste either:

- plain path(s), or
- `--repos "pathA,pathB"`

