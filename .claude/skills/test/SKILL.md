---
name: test
description: Run the test suite, format, lint, check, Fallow and build — fix what fails
disable-model-invocation: true
effort: high
---

# Test, format, lint, check, build

Run every quality gate and fix what fails. Stage files by name if you commit.

## 1. Tests

```
bun run test
```

Report files and tests passed / failed / skipped. Fix new failures (do not
loosen an assertion to make it pass unless the test was wrong), re-run.
docs/testing.md describes the two projects and conventions.

## 2. Format, lint, check

```
bun run format
bun run lint       # 0 errors and 0 warnings
bun run check      # 0 errors
```

## 3. Fallow

```
bunx fallow
```

Dead-code must be clean (`✓ No issues found`); a new unused export usually
means unwired code. Health and duplicate findings are advisory.

## 4. Build

```
bun run build
```

Must complete. If server dependencies changed, check
`.vercel/output/functions/*/node_modules` for CommonJS packages that depend
on ESM-only ones (docs/environment.md).

## 5. Re-run after fixes

If anything was changed, run `bun run test` and `bun run check` again.

## Summary

- Tests: X passed / Y failed across N files
- Format: files fixed
- Lint / check: clean or what remains
- Fallow: clean or findings
- Build: success or failure
- Fixes made
