# Configuration

Generate a starter config:

```bash
repo-meter init
```

This creates `repo-meter.config.json` in the current directory.

## Common Settings

- `include`: include globs
- `exclude`: exclude globs
- `generated`: generated-file patterns
- `categories`: custom category rules
- `largeFileWarning`: threshold for health warnings
- `topFiles`: number of top files to display
- `baselineDir`: baseline storage directory
- `repos`: default repo list for TUI sessions
- `tui.intervalMs`: default TUI refresh interval
- `tui.remote`: default remote status mode

## Example

```json
{
  "exclude": ["node_modules/**", ".next/**", "dist/**", "coverage/**"],
  "largeFileWarning": 800,
  "topFiles": 7,
  "repos": [
    "C:/Users/teoes/OneDrive/Documents/A-personalbrandprod",
    "C:/Users/teoes/OneDrive/Documents/Kola-Ecosystem"
  ],
  "tui": {
    "intervalMs": 2000,
    "remote": false
  }
}
```

