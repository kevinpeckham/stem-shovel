<!-- BEGIN swamp managed section - DO NOT EDIT -->

# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp behavior type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension behavior in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` behavior is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a behavior covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp behavior type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a behavior (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire behaviors together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp behavior get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp behavior run` calls against the same behavior. Multiple parallel calls against the same behavior contend on the per-behavior lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp behavior type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled; pin them.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. When the extension has a `deno.json`, the `deno.lock` beside it decides which versions are bundled; otherwise the registry's current release does. Always pin explicit versions in `npm:` and `jsr:` import specifiers (e.g., `npm:lodash-es@4.17.21`) — `swamp extension push` warns on unpinned and range specifiers.
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze behavior output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of behavior-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.
10. **Use swamp, don't bypass it.** Always work through swamp commands — don't go around them with raw shell tools. Use `swamp data query` to find data, not `grep`/`find` on `.swamp/` files. Use behavior methods to interact with resources, not `curl`/`aws`/`gcloud`/`kubectl` when a behavior type already wraps that API — check with `swamp behavior type search`. Use `swamp help` for CLI discovery, not guesswork. Composing with swamp output is fine (e.g. piping `--json` through `jq`) — the anti-pattern is bypassing swamp entirely.
11. **Inspect reports after failures.** When a behavior method or workflow run fails, inspect its generated reports before retrying or changing definitions. Reports run even on failure and capture structured diagnostics — error messages, execution status, arguments, and data output pointers. Use `swamp report get @swamp/method-summary --model <model> --json` for method failures or `swamp report get @swamp/workflow-summary --workflow <workflow> --json` for workflow failures. Run `swamp help report get` to confirm current retrieval syntax.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — behaviors, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

If you were asked to read a task brief under `tasks/` (a file whose first
line is `<!-- swamp start brief v1 -->`), read that brief, then invoke the
`swamp-getting-started` skill and follow it from its brief entry point.

If the user is new to swamp or asks to get started, or a swamp command you
run shows this repository has no behaviors yet, invoke the
`swamp-getting-started` skill. It checks for existing behaviors itself and walks
new users through an interactive onboarding tutorial.

Otherwise, use the `swamp` skill to work with swamp behaviors.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help behavior run` scopes to a subtree.

Behaviors (formerly models) are managed with `swamp behavior` — e.g.
`swamp behavior run <name> <method>` (or
`swamp behavior run @<type> <method> <name>` to run against a type
directly). Every `swamp model …` spelling remains supported.
<!-- END swamp managed section -->

# CLAUDE.md

Guidance for Claude Code when working in this repository. The README is the
human-facing overview; `docs/` holds the topic documents; this file is the
working agreement.

## Commands

```bash
bun run dev          # the VM runs this as a systemd unit on :5173 — do not start a second one
bun run test         # Vitest: unit (Node) + component (jsdom) projects — docs/testing.md
bun run test:coverage # the same with V8 coverage (text summary; the HTML report in coverage/, gitignored)
bunx varlock run -- bun run test:e2e   # Playwright against the dev server as the bot, fake microphone (tests/e2e; docs/testing.md "Browser tests")
bun run check        # svelte-check
bun run lint         # vp check: format check + Oxlint + tsgolint
bun run format       # Oxfmt (formats .svelte templates too)
bun run build        # vp build; output in .vercel/output
bunx fallow          # dead code, duplication, health
bunx fallow audit    # what CI gates on changed files, incl. the house rules (fallow-rules.json)
bunx fallow guard <file>   # which rules and import boundaries apply to a file, before editing it
bun run spell        # cspell over the prose (docs, user docs, README, changelog)
bun run stems        # generate the static test WAVs (gitignored)
bun run smoke:blob   # create a smoke project + song and upload through the real flow
bun run smoke:urls   # every route answers as expected, signed out and as the bot; SMOKE_BASE=https://www.stemshovel.com for production
bun run audit:seo    # every route's indexability: sitemap, robots.txt, X-Robots-Tag (hook + vercel.json rule), robots meta, title/description/h1 against isIndexablePath; SEO_BASE=https://www.stemshovel.com for production; exits 1 on a finding (docs/security.md "Indexability audit")
bun run audit:effects # every $effect in the components with the rationale on the line before it; exits 1 on one without (docs/testing.md "The $effect audit")
bunx varlock run -- swamp workflow run code-audit   # Swamp: the repo-level audits (audit:effects), asserted and kept as data
bunx varlock run -- swamp workflow run site-audit --input stage=production   # Swamp: audit:seo and smoke:urls against one stage (dev|staging|production), asserted, the results kept as data (docs/security.md "Through Swamp"); every swamp command runs through varlock, which supplies its swamp-club.com credential
bun run check:swing  # renders drum patterns through the machine's own code and measures the onsets: swing must move the odd sixteenths (dev server only)
bun run shot <path>  # full-page PNG of a dev-server page into .screenshots/ — then Read it
                     # signed in as the Screenshot Bot when PREVIEW_AUTH_TOKEN is set (docs/agent-screenshots.md)
bun run db:generate / db:migrate / db:seed / db:studio   # drizzle-kit via varlock
bun run db:migrate:steps                # db:migrate one statement at a time, when Turso answers 502 to the batch (same journal)
bun run db:status                       # the last migration applied and any pending (APP_ENV=preview for staging); check production before a push to main
bun run db:preview-bot <account-slug>   # enrol the Screenshot Bot in an account
bun run db:system-admin <email>         # make a user the operator (/admin)
bun run db:super-admin <email>          # owner of every account, audited (docs/security.md)
bun run db:seed-docs                    # add the starting user docs (scripts/user-docs) where missing
bun run db:update-docs <slug...>        # refresh those pages from scripts/user-docs after the source changed; a page edited in the app is skipped (--force overwrites; --list / --restore <slug> <n> for its versions)
bun run db:update-docs --merge [--apply] # carry the seed files' changes onto pages edited in the app (a three-way merge; docs/user-docs.md); dry run without --apply
bun run db:left-only [-- --apply [--origin <url>]]   # MP3 renditions with sound on the left only (a phone's mono mic before the stereo fill): list, or clear and re-render folded to mono (docs/uploads-and-blob.md "The stereo fill")
bun run db:rerender-sessions [-- --apply <id…> | --apply --all]   # list a stage's session recordings (with sizes); clear their MP3s, failed ones too, to render again on the current code (opening the account's Sessions page starts them); prints the DB host first
bun run db:reset-stage [-- --wipe --admin <email>]   # rebuild dev or staging from the seed (never production); APP_ENV=preview for staging
```

Bun is the package manager (`packageManager` pin; `bun.lock` only). varlock
resolves env from `.env.schema` + `.env.local`; anything outside Vite runs
through `bunx varlock run -- <cmd>`.

## Stack

SvelteKit 3 + Svelte 5 runes (`experimental.async` on), Vite+ (`vp`, Vite 8),
UnoCSS (wind4, lj-website's config), Turso via Drizzle, Vercel Blob,
varlock + 1Password, adapter-vercel. Full picture: README.md and docs/.

## Conventions

- **Remote functions, not form actions.** Every mutation is a `form` or
  `command` in `src/lib/remote/*.remote.ts`, validated by a valibot schema
  from `src/lib/val/`. Domain errors go to fields with `invalid()`. Derive
  redirect targets from the database, never from the request URL (inside a
  remote function `url` is the calling page only when a browser supplies it).
- **Valibot schemas live in `src/lib/val/<Name>Schema.ts`**: the value array,
  the schema and the inferred type together (replicator's `$val` layout).
  Drizzle table files import only the types, with relative paths.
- **Drizzle**: one file per table under `src/lib/server/db/schema/`, all
  `relations()` in `relations.ts` (keeps table imports a DAG), text nanoid
  ids, `timestamps` from `columns.ts`, an index on every foreign key.
  **Turso does not enforce foreign keys** (`PRAGMA foreign_keys` is 0), so
  the schema's `onDelete` rules are documentation: a delete removes its
  children itself through `src/lib/server/cascade.ts`, and a new child
  table joins the right function there. `bun run db:sweep-orphans` reports
  what earlier deletes left; `--apply` removes it.
  Migrations are generated and committed; when a change would make
  drizzle-kit ask about a rename, split it into two generates.
- **Every query is scoped by `accountId` first** (`src/lib/server/data.ts`);
  a row from another tenant is "not found". The account comes from the URL
  (`/[account]/…`, resolved in `[account]/+layout.server.ts`) for pages, and
  from the entity itself (`src/lib/server/access.ts`: `memberOf`,
  `accountOf*`) for mutations. **Viewing is public by URL; editing needs a
  signed-in member** — gate controls on `data.canEdit`, never rely on it for
  security; `locals.user` is null when signed out (Better Auth, docs/auth.md).
- **Styling is UnoCSS only**: utilities and the shortcuts inline in
  `uno.config.ts` (no stylesheets, no `<style>`, no abstraction of the config
  into modules). Follow lj-website for page structure (`page` wrapper,
  `app-page-heading` title, `heading-2` sections) and replicator's `article-body`
  idiom for rendered-markdown typography (`chart-body`). Icons are Phosphor
  via `presetIcons` (`i-ph-…`). Classes used in `src/app.html` must be
  safelisted.
- **Helpers live in `src/lib/utils/`, one function per file** named after
  the function (replicator's `$utils` layout), and shared constants in
  `src/lib/constants/`. `#lib/val/` holds valibot schemas and their types
  only — a helper that a schema needs (like `songChangeValueError`) is a
  util the schema imports, never the other way round (Fallow flags cycles).
- **A remote form remembers its last values** for the life of the page
  (module state), so a popover that holds one calls `clearForm(form)` from
  `#lib/utils/clearForm` in `onbeforetoggle` when it opens (inputs fall back
  to their `.as(type, value)` defaults), and a form that stays on the page
  calls it plus `element.reset()` after a successful submit.
- **Transient feedback is a notification**, never a line of page content:
  `notify("Song settings saved")` from `#lib/state/notifications.svelte.js`
  (success evaporates in 4 s, errors stay until dismissed); the stack is
  rendered once in the root layout, fixed to a corner. Show a caught error with
  `errorMessage(e)` from `#lib/utils/errorMessage`: a remote function's
  `error(status, message)` reaches the client as an `HttpError` that is not an
  `Error` (`String(e)` is its JSON body).
- **House rules are machine-checked** (`fallow-rules.json`, wired in
  `.fallowrc.json`, run by `fallow audit` in CI with the findings in GitHub's
  code-scanning tab): no `$env/*` imports (varlock only), no form actions
  (`actions` exports), no zod/moment/lodash/dotenv/axios, and warnings for
  `$effect` and raw window/document listeners in components. Import
  boundaries: nothing in `src/lib` imports from `src/routes` except types;
  `src/lib/val` imports only val, utils and constants; constants import only
  constants and val. Suppress a single line with
  `// fallow-ignore-next-line policy-violation:stem-shovel-house-rules/<id> -- <reason>`.
- **Swamp holds the repeatable audits.** `extensions/behaviors/*.ts` are the
  behavior types (Deno code, type-checked with `~/.swamp/deno/deno check`,
  outside tsconfig, Oxlint and Fallow), `models/` the per-stage definitions,
  `workflows/` the workflows; all committed. `.swamp/` is the run data,
  gitignored. Create definitions and workflows with `swamp behavior create`
  / `swamp workflow create --json` (never by hand: swamp assigns the ids),
  validate before running, and run every swamp command as
  `bunx varlock run -- swamp …`. The swamp skill (`~/.claude/skills/swamp`)
  has the CLI's own guidance; the section swamp manages at the top of this
  file is its, not ours.
- **`$effect` is a last resort, and every one says why.** Reach for
  `$derived` (writable), function bindings, `{@attach}`, `<svelte:window>`,
  prop-seeded state with `{#key}` or `onMount` first; an effect that
  remains (a canvas, an external engine or library, a timer, the popover
  API, a teardown) carries a `// why $effect: <which side effect>` comment
  alone on the line directly before it. The test beside
  `src/lib/utils/effectCallSites.ts` gates on it, `bun run audit:effects`
  lists every site, and the Fallow rule reminds (docs/testing.md "The
  $effect audit").
- **Tests go beside what they test** (`x.test.ts`, `X.svelte.test.ts`),
  import the runner from `vite-plus/test`, and mock the database, Blob and
  ffmpeg in server tests (docs/testing.md). Run `bun run test` before a
  push that touches logic, and `SKIP_VARLOCK=1 bun run test` when a test is
  new: CI has no 1Password, and a test that loads `#lib/server/db/index.js` (through
  `data.ts`, say) fails there. Pure functions from server modules go in
  `src/lib/utils/` with their tests.
- **Server dependencies must be ESM.** Vercel's Node 24 launcher has refused
  CommonJS `require()` of ES modules at cold start; prefer ESM packages, and
  after a build check `.vercel/output/functions/*/node_modules`.
- **Browser-only packages** (woof-editor) are imported dynamically in
  `onMount`; type imports are fine. `better-auth` is bundled into the server
  chunk (`ssr.noExternal`) because Vercel's tracer drops its `dist/`.
- **Blob pathnames are ID-based** (`accounts/<id>/songs/<id>/<stemId>[-vN].ext`)
  and never reused: Blob serves a 30-day cache header. Each stem also gets an
  AAC playback rendition (`…play-<stamp>.m4a`, `src/lib/server/transcode.ts`,
  `ffmpeg-static`); the player streams it, downloads use the source.
- **Background work goes through the jobs function.** Renditions, mixes,
  notes transcription and notation PDFs run in `POST /api/jobs` (its own
  Vercel function); page loads, remote functions and API routes only call
  the `schedule*` helpers in `src/lib/server/jobs.ts`. Never import
  `transcode.ts`, `mix.ts` (beyond `mixKeyOf`), `notes.ts` or
  `notationPdf.ts` from page code: they carry ffmpeg, tfjs and Verovio,
  and a page function's cold start is what users feel
  (docs/environment.md "Cold starts and the jobs function"). Decide on the
  row you already hold before scheduling (`songsWantingMix`,
  `songWantsNotes`), so a visit with nothing to do posts nothing.
- **Shipping a file with a function**: import it as JSON (Vite bundles it).
  The adapter traces from the filesystem root, so `process.cwd()` paths and
  static files are never packed, and the firewall's bot protection answers
  the function's own fetches of the site with a 429.
- **Measuring a cold start**: hit a fresh preview deployment's own URL twice
  (`vercel ls`); the first hit is cold. Keep server-side Sentry on
  `@sentry/node` without loader hooks.

## Working agreement

- **Three branches.** `dev` is where work lands and what the VM's dev
  server serves (it serves whatever is checked out, so keep `dev` checked
  out here); Kevin previews there. `staging` is the production-like test:
  Vercel builds it as a preview deployment at
  `https://staging.stemshovel.dev` (no deployment protection; the app's
  own sign-in gates it). `main` is production. Commit each completed
  change to `dev` and push it; merge `dev` into `staging`, and `staging`
  into `main`, only when Kevin says so. A push to `main` deploys
  production: watch the deployment and check the live pages afterwards.
  Kevin verifies interaction in a real browser; use `bun run shot` + Read
  for layout before reporting.
- Reference repos on GitHub: `lightning-jar/replicator` (patterns: remote
  functions, $val schemas, editors, screenshots) and `lightning-jar/lj-website`
  (look and feel, uno config, page structure). Read them with `gh api`.
- Releases: `/release <version>` (`.claude/skills/release/SKILL.md`).
  CHANGELOG.md is the full technical record; the `/releases` page is a
  user doc in the database (edited in the app) carrying only what a user
  would notice (features, changes, fixes), never permissions, admin
  actions, security or architecture. A release drafts its section for
  Kevin to paste there.
- **FINDINGS.md** collects gotchas and insights about packages, browser
  APIs and tools as they surface: add an entry whenever one does, with
  where the lesson came from. Conventions go to this file or docs/;
  findings go there.
- Do not record in memory what the repo already documents.
