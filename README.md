# Repo Meter

`repo-meter` is a Git-aware CLI and live TUI for monitoring active repositories, local drift, and repo composition.

It is built for real working sessions, not just one-off code counts.

## Why Use It

Tools like `scc`, `cloc`, and `tokei` are great at repository inventory.
They tell you what is in a codebase.

`repo-meter` is for the next question:

- what changed locally while I was working?
- which repo in my stack needs attention first?
- which repos are dirty, drifting, or falling behind?
- is this growth coming from source, tests, docs, lockfiles, or generated output?

The value is that `repo-meter` turns repository measurement into a live workflow.

## Install

```bash
npm install -g repo-meter
```

Or try it once without installing:

```bash
npx repo-meter
```

## Quick Start

Run this:

```bash
repo-meter
```

That opens the TUI by default.

If you want the simpler command-line report instead:

```bash
repo-meter scan
```

## Docs

- [Docs Index](./docs/README.md)
- [Quickstart](./docs/quickstart.md)
- [TUI Guide](./docs/tui.md)
- [Configuration](./docs/configuration.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Release and Publish](./docs/release.md)

## What It Does

- live TUI by default
- tracked vs untracked working-tree metrics
- source/tests/docs/config/generated/lockfile breakdowns
- local Git drift awareness
- optional remote-tracking status
- multi-repo monitoring in one terminal
- baseline snapshots and comparisons
- JSON, Markdown, and summary output for automation

## Main Commands

### Default TUI

```bash
repo-meter
```

You can also launch the TUI explicitly:

```bash
repo-meter tui
```

### Quick Report

```bash
repo-meter scan
```

### Dashboard

```bash
repo-meter dashboard
```

### Watch Mode

```bash
repo-meter watch --view dashboard
```

### Reports

```bash
repo-meter report --json
repo-meter report --markdown
repo-meter report --summary
```

### Baselines

```bash
repo-meter baseline save first
repo-meter baseline list
repo-meter baseline compare first
repo-meter baseline trend
```

## TUI Controls

- `q` quit
- `j` / `k` or arrow keys move
- `a` add another repo to the current session
- `d` remove the selected repo from the current session
- `p` pin or unpin the selected repo
- `s` cycle sort mode
- `x` cycle filter mode
- `tab` switch focus
- `r` force refresh
- `u` run an explicit upstream status check from local tracking refs
- `g` toggle remote details when remote mode is enabled
- `?` or `h` open help

## Multi-Repo Use

Open several repos at once:

```bash
repo-meter tui "C:\path\to\repo-a" "C:\path\to\repo-b"
```

Or:

```bash
repo-meter tui --repos "C:\path\to\repo-a,C:\path\to\repo-b"
```

On Windows and PowerShell, quote each repo path if it may contain spaces.
That includes common paths like `C:\Users\Your Name\...` or `C:\Users\...\OneDrive\...`.

Inside the TUI:

- press `a` to add a repo
- press `d` to remove a repo from the current live session
- press `p` to pin important repos
- press `s` to sort by `activity`, `size`, or `dirty`
- press `x` to filter to `all`, `dirty`, `active`, or `favorites`

## Dirty vs Clean

`repo-meter` marks a repo as:

- `clean` when there are no modified, staged, deleted, or untracked files
- `dirty` when local changes are present

Dirty is not bad.
It means Git still sees local changes compared with the last commit in that repo.

The TUI also shows advice on how to clean a repo:

- commit ready changes
- stash work you want to pause
- ignore or delete temporary untracked files

## Remote Status

```bash
repo-meter tui --remote
```

Remote mode shows local tracking-ref awareness without silently fetching from the network.

It can show:

- branch and remote name
- ahead / behind counts when derivable from local refs
- last local commit time
- last remote tracked commit time
- sync warnings like `Push recommended` or `Branches diverged`

## Supported Languages

`repo-meter` uses `scc` as its primary counting engine when available, so language support is effectively as broad as `scc`.

When `scc` is unavailable or restricted, `repo-meter` falls back to its built-in text counting path for common source and config extensions.

So:

- broad language coverage: yes
- infinite custom parser support: no
- primary ceiling: mostly the `scc` ecosystem plus the built-in fallback map

To inspect what the bundled `scc` supports today, run:

```bash
vendor/scc/scc.exe --languages
```

If we ever want to expand support in a future update, there are two paths:

1. update the bundled `scc` version for broader native language coverage
2. expand Repo Meter's built-in fallback extension map for environments where `scc` cannot run

## Config

Create a starter config:

```bash
repo-meter init
```

That writes `repo-meter.config.json`.

You can customize:

- include and exclude globs
- generated-file patterns
- category rules
- large-file threshold
- top-file count
- baseline directory
- default TUI interval
- default remote mode
- saved repo paths for multi-repo TUI sessions

## Shell Completion

```bash
repo-meter completion powershell
repo-meter completion bash
repo-meter completion zsh
```

## License

MIT
