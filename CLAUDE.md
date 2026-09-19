# CLAUDE.md

Guidance for Claude Code when working in this repository. The README is the
human-facing overview; `docs/` holds the topic documents; this file is the
working agreement.

## Commands

```bash
bun run dev          # the VM runs this as a systemd unit on :5173 — do not start a second one
bun run test         # Vitest: unit (Node) + component (jsdom) projects — docs/testing.md
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
bun run shot <path>  # full-page PNG of a dev-server page into .screenshots/ — then Read it
                     # signed in as the Screenshot Bot when PREVIEW_AUTH_TOKEN is set (docs/agent-screenshots.md)
bun run db:generate / db:migrate / db:seed / db:studio   # drizzle-kit via varlock
bun run db:preview-bot <account-slug>   # enrol the Screenshot Bot in an account
bun run db:system-admin <email>         # make a user the operator (/admin)
bun run db:super-admin <email>          # owner of every account, audited (docs/security.md)
bun run db:seed-docs                    # add the starting user docs (scripts/user-docs) where missing
bun run db:reset-stage [-- --wipe --admin <email>]   # rebuild dev or staging from the seed (never production); APP_ENV=preview for staging
```

Bun is the package manager (`packageManager` pin; `bun.lock` only). varlock
resolves env from `.env.schema` + `.env.local`; anything outside Vite runs
through `bunx varlock run -- <cmd>`.

## Stack

SvelteKit 2 + Svelte 5 runes (`experimental.async` on), Vite+ (`vp`),
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
  `display` title, `heading-2` sections) and replicator's `article-body`
  idiom for rendered-markdown typography (`chart-body`). Icons are Phosphor
  via `presetIcons` (`i-ph-…`). Classes used in `src/app.html` must be
  safelisted.
- **Helpers live in `src/lib/utils/`, one function per file** named after
  the function (replicator's `$utils` layout), and shared constants in
  `src/lib/constants/`. `$lib/val/` holds valibot schemas and their types
  only — a helper that a schema needs (like `songChangeValueError`) is a
  util the schema imports, never the other way round (Fallow flags cycles).
- **A remote form remembers its last values** for the life of the page
  (module state), so a popover that holds one calls `clearForm(form)` from
  `$lib/utils/clearForm` in `onbeforetoggle` when it opens (inputs fall back
  to their `.as(type, value)` defaults), and a form that stays on the page
  calls it plus `element.reset()` after a successful submit.
- **Transient feedback is a notification**, never a line of page content:
  `notify("Song settings saved")` from `$lib/state/notifications.svelte`
  (success evaporates in 4 s, errors stay until dismissed); the stack is
  rendered once in the root layout, fixed to a corner. Show a caught error with
  `errorMessage(e)` from `$lib/utils/errorMessage`: a remote function's
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
- **Tests go beside what they test** (`x.test.ts`, `X.svelte.test.ts`),
  import the runner from `vite-plus/test`, and mock the database, Blob and
  ffmpeg in server tests (docs/testing.md). Run `bun run test` before a
  push that touches logic, and `SKIP_VARLOCK=1 bun run test` when a test is
  new: CI has no 1Password, and a test that loads `$lib/server/db` (through
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
- **Background work goes through the jobs function.** Renditions, mixes and
  notes transcription run in `POST /api/jobs` (its own Vercel function);
  page loads, remote functions and API routes only call the `schedule*`
  helpers in `src/lib/server/jobs.ts`. Never import `transcode.ts`,
  `mix.ts` (beyond `mixKeyOf`) or `notes.ts` from page code: they carry
  ffmpeg and tfjs, and a page function's cold start is what users feel
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
- Do not record in memory what the repo already documents.
