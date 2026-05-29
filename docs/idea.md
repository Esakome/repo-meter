# Project Origin (Archive)

This document preserves the original intent behind `repo-meter`.

## Original Problem

The goal was to answer a practical workflow question:

"How many lines are in my real platform code right now, and how is that changing while I work?"

Existing tools already counted lines by language very well, but did not fully solve:

- tracked vs untracked growth visibility
- product-oriented categories (`source`, `tests`, `docs`, `config`, `generated`, `lockfiles`)
- live multi-repo monitoring in one terminal
- monolith-friendly folder-level scanning

## Strategic Decision

We deliberately built on `scc` instead of reimplementing language parsing.

`repo-meter` adds workflow value on top of counting engines:

- live TUI session management
- local Git state visibility
- baseline snapshots and comparisons
- repo-health interpretation

## Current Direction

`repo-meter` is now positioned as a TUI-first developer workflow tool with CLI outputs for automation.

