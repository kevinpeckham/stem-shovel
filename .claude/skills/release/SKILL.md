---
name: release
description: Cut a release - format, lint, check, Fallow, build, bump version, update CHANGELOG and memory, commit, tag, push
argument-hint: [version e.g. 0.2.0]
effort: high
---

# Release Workflow

Cut release **$ARGUMENTS** of stem-shovel. If no version is given, read the
current one from `package.json` and ask which it should be (semver: patch
for fixes, minor for features, major for breaking changes to URLs or data).

## Step 1: Quality gates

Run in order, fixing anything that fails before moving on:

```
bun run test       # Vitest (unit + component projects) — all green
bun run format     # Oxfmt; auto-fixes are expected
bun run lint       # vp check: format check + Oxlint + tsgolint — 0 errors
bun run check      # svelte-check — 0 errors
bunx fallow        # dead code / health; new unused exports mean unwired code
bun run build      # production build; also proves the varlock resolution
```

For changes to uploads or the database, also run
`bun run stems && bun run smoke:blob` against the dev server, then delete
the `smoke-*` project it creates (see scripts/blob-smoke.mjs).

If server dependencies changed: after the build, check
`.vercel/output/functions/*/node_modules` for CommonJS packages that depend
on ESM-only ones (docs/environment.md explains why).

## Step 2: Bump the version

Set `version` in `package.json` to the target version.

## Step 3: CHANGELOG.md

1. Add `## [$VERSION] - $TODAY` between `## [Unreleased]` and the previous
   release; leave `## [Unreleased]` empty.
2. Subsections as needed: `### Added`, `### Changed`, `### Fixed`,
   `### Removed`, `### Technical` (schema/migrations, infrastructure).
3. Write entries from the actual changes since the last tag:
   `git log $(git describe --tags --abbrev=0)..HEAD --oneline` and
   `git diff $(git describe --tags --abbrev=0) --stat`.
4. Bold the lead phrase of each entry, one entry per user-visible change;
   match the existing style.

## Step 3b: the Releases page (user-facing notes)

The `/releases` page is the "releases" user doc, stored in each stage's
database and edited in the app (`/docs/releases/edit`, system admins), not
a file. Draft the version's section in the same shape as CHANGELOG.md
(`## [x.y.z] - YYYY-MM-DD`, `### Added` / `### Changed` / `### Fixed`) with
only what a user would notice: new features, improved or changed features,
fixes worth knowing about, in plain words. Leave out permissions,
admin-only actions, security work, infrastructure, migrations, tooling,
docs-for-developers and anything about how the app is built. Put the
draft in the release report for Kevin to paste at the top of the page on
production (and on staging/dev when he wants them in step). The seed
source `scripts/user-docs/releases.md` is only the starting content.

## Step 4: Documentation and memory

- README.md: keep the overview, commands and "where things live" current.
- docs/: update the topic doc for anything whose behaviour changed
  (data-model, environment, styling, audio-engine, uploads-and-blob,
  agent-screenshots).
- Claude memory (`~/.claude/projects/-home-exedev-projects-stem-shovel/memory/`):
  update a project memory only if a convention or constraint changed; do not
  record what the repo already documents.

## Step 5: Commit, tag, push

Stage the specific files (not `git add -A` — `.claude/settings.json` and
`.screenshots/` are not part of a release), then:

```
git commit -m "vX.Y.Z: <one-line summary>" -m "<2–3 sentences on the significant changes>" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push && git push --tags
```

Pushing `main` deploys to production. Watch the deployment
(`vercel ls`, `vercel inspect <url>`) and confirm the live pages respond
before reporting the release as done.
