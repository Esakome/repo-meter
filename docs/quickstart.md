# Quickstart

## Install

```bash
npm install -g repo-meter
```

Or run it once without global install:

```bash
npx repo-meter
```

## Run

Default command opens the TUI:

```bash
repo-meter
```

Simple one-shot report:

```bash
repo-meter scan
```

JSON or Markdown output:

```bash
repo-meter report --json
repo-meter report --markdown
```

## Multi-Repo Launch

Use quoted paths on Windows:

```powershell
repo-meter tui "C:\path\to\repo-a" "C:\path\to\repo-b"
repo-meter tui --repos "C:\path\to\repo-a,C:\path\to\repo-b"
```

## Folder-Scoped Monolith Scans

If you point at a subfolder inside a larger Git repo, `repo-meter` now scans that folder scope only.

Example:

```powershell
repo-meter tui "C:\monolith\apps\brand"
```

This is useful for monoliths where each app or package should be measured independently.

