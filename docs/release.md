# Release and Publish

## Pre-Release Checklist

1. Run tests.
2. Confirm version in `package.json`.
3. Confirm `LICENSE` includes correct copyright owner.
4. Confirm README and docs are up to date.
5. Run npm pack dry-run to inspect publish payload.

## Commands

```bash
npm test
npm pack --dry-run --ignore-scripts
```

## Publish

```bash
npm login
npm publish --access public --otp=123456
```

Replace `123456` with your current OTP code.

## Versioning Notes

- npm does not allow republishing the same version.
- For docs-only fixes, bump patch version (for example `1.3.3` -> `1.3.4`).
- Keep CLI/TUI version display aligned with package version.

