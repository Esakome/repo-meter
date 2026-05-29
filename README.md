# Repo Meter

`repo-meter` is a Git-aware repo operations dashboard for people actively working across codebases.

It is trying to answer the questions:

- what changed locally since I started working?
- which repo needs attention first?
- am I carrying a lot of untracked or dirty work?
- is this repo mostly source, tests, docs, or dependency weight?
- which repos in my current stack are drifting, growing, or falling behind?

## Why Use It

`scc`, `cloc`, and `tokei` are inventory tools.
They tell you what is in a repository.

`repo-meter` is a working tool.
It helps while you are coding, reviewing, comparing, and juggling multiple repos.

The difference is practical:

- `scc` is excellent when you want a language table, totals, complexity, or COCOMO-style reporting
- `repo-meter` is useful when you want to watch live repo drift, local Git state, repo composition, and day-to-day change across one or many active repos. `repo-meter` turns repository measurement into an **ongoing workflow**, not a one-time report.

## What Makes It Different

- It treats the **working tree** as the default truth, not just the last clean commit.
- It separates **tracked** and **untracked** work so local scratch changes are visible.
- It groups files into **developer-facing categories** like source, tests, docs, config, generated output, migrations, and lockfiles.
- It keeps a **live session view** so you can see counts move while you work.
- It helps you **compare repos against each other** in one terminal session.
- It tracks **local-vs-remote drift** in a way that is useful during active development.
- It supports **baselines and trend checks** so you can measure growth over time, not just totals right now.

## When To Use It

Use `repo-meter` when you are:

- working across several repos and want one live place to monitor them
- trying to understand where today’s repo growth is coming from
- checking whether a repo is getting heavier in source, lockfiles, docs, or generated output
- comparing your local working tree with your tracked branch state
- looking for the biggest files and highest-friction repos in your current session
- saving snapshots to understand growth over days or weeks


## What It Does

- `scan` for the standard report
- `dashboard` for a denser read-only terminal view
- `tui` for the interactive live experience
- `watch` for continuous refreshing without the full TUI
- `baseline save`, `baseline compare`, and `baseline trend` for growth tracking
- `report --json`, `--markdown`, and `--summary` for automation or sharing

## Quick Start

From source:

```bash
npm install
npm run build
node dist/cli.js scan
node dist/cli.js tui
```

If you want `repo-meter` as a normal command on your machine:

```bash
npm link
repo-meter scan
repo-meter tui
```

After publishing to npm, users will be able to do:

```bash
npm install -g repo-meter
repo-meter tui
```

Or try it without installing:

```bash
npx repo-meter scan
```

## Best First Commands

```bash
repo-meter scan
repo-meter dashboard
repo-meter tui
repo-meter baseline save first
repo-meter baseline compare first --summary
```

If you are running from the source repo without `npm link`, replace `repo-meter` with `node dist/cli.js`.

## Commands

### Scan

```bash
repo-meter scan
```

Shows:

- working tree total
- tracked total
- untracked total
- category breakdown
- top languages
- largest files
- health notes

### Dashboard

```bash
repo-meter dashboard
```

This is the fast, readable, non-interactive view.
It is useful for quick terminal checks, scripts, screenshots, and CI-friendly output.

### TUI

```bash
repo-meter tui
```

This is the main live experience.
It shows:

- the Repo Meter logo and version
- a repo list
- selected repo details
- last updated timestamps
- local Git status
- category and language summaries
- largest files
- optional remote-tracking status

Useful keys:

- `q` quit
- `j` / `k` or arrow keys move
- `a` add another repo to the current session
- `p` pin or unpin the selected repo
- `s` cycle sort mode
- `x` cycle filter mode
- `tab` switch focus
- `r` force refresh
- `u` run an explicit upstream status check from local tracking refs
- `g` toggle remote details when remote mode is enabled
- `?` or `h` open help

### Multi-Repo TUI

```bash
repo-meter tui C:\path\to\repo-a C:\path\to\repo-b
```

Or:

```bash
repo-meter tui --repos C:\path\to\repo-a,C:\path\to\repo-b
```

You can also add another repo while the TUI is already open:

1. Press `a`
2. Type the repo path
3. Press `Enter`

That adds the repo to the current TUI session.

If you want a persistent list, save those repo paths in `repo-meter.config.json`.

### Remote Status

```bash
repo-meter tui --remote
```

This keeps local refresh as the default driver and adds optional remote-tracking awareness when local tracking refs exist.
It does not silently fetch from the network.

The remote card now shows:

- branch and remote name
- ahead / behind counts when they can be derived from local refs
- last local commit time
- last remote tracked commit time
- sync warnings like `Push recommended` or `Branches diverged`

### Watch

```bash
repo-meter watch --view dashboard
```

This is useful when you want auto-refresh but do not need the full interactive TUI.

### Report Formats

```bash
repo-meter report --json
repo-meter report --markdown
repo-meter report --summary
repo-meter report --markdown --write repo-metrics.md
```

### Baselines

```bash
repo-meter baseline save first
repo-meter baseline list
repo-meter baseline compare first
repo-meter baseline compare first --summary
repo-meter baseline trend
```

## Why TUI And Dashboard Are Separate

By choice, they solve different jobs:

- `dashboard` is a quick, read-only snapshot
- `tui` is the richer live workspace

Keeping both matters because not every terminal use case wants interaction.
For example:

- CI logs want `dashboard` or `report`
- screenshots and copy-paste updates want `dashboard`
- active coding sessions want `tui`

So the TUI is the flagship experience, but the dashboard still earns its place because it is lighter and script-friendly.

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

## Multi-Repo Workflow

The TUI is built to monitor multiple repos in one terminal session.

You can:

- launch with multiple repo paths
- add repos live with `a`
- pin important repos with `p`
- sort by `activity`, `size`, or `dirty` with `s`
- filter to `all`, `dirty`, `active`, or `favorites` with `x`

## Shell Completion

```bash
repo-meter completion powershell
repo-meter completion bash
repo-meter completion zsh
```

Examples:

```bash
repo-meter completion powershell > repo-meter.ps1
repo-meter completion bash > repo-meter.bash
repo-meter completion zsh > _repo-meter
```

## Install Notes

If PowerShell blocks the generated `.ps1` shim on your machine, the `.cmd` launcher still works:

```bash
repo-meter.cmd scan
```

## License

This project currently uses the `MIT` license.

That is a good default for a developer tool because it is simple, permissive, and easy for individuals and teams to adopt.

## Current Version

`repo-meter` is currently at `v1.3.1`.
