# TUI Guide

## What TUI Mode Is For

The TUI is the primary `repo-meter` experience for active coding sessions.
It auto-refreshes and shows live repo state without any AI dependency.

## Launch

```bash
repo-meter
repo-meter tui
```

With remote status enabled:

```bash
repo-meter tui --remote
```

## Key Controls

- `q`: quit
- `j` / `k` or arrow keys: move
- `a`: add repo(s) to current session
- `d`: remove selected repo from current session
- `p`: pin/unpin selected repo
- `s`: cycle sort mode
- `x`: cycle filter mode
- `tab`: switch focus between repo list and details
- `r`: manual refresh
- `u`: upstream status check
- `g`: toggle remote section (when remote mode is enabled)
- `?` or `h`: help overlay

## Add Repo Prompt Behavior

When you press `a`, you can paste:

- one path:
  - `"C:\Users\name\repo-a"`
- multiple paths:
  - `"C:\Users\name\repo-a" "C:\Users\name\repo-b"`
- `--repos` style list:
  - `--repos "C:\Users\name\repo-a,C:\Users\name\repo-b"`

Invalid paths are rejected before scan, with a clear status message.

## Clean vs Dirty

- `clean`: no modified, staged, deleted, or untracked files
- `dirty`: local changes exist in working tree and/or index

Dirty is a state indicator, not an error.

