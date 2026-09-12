# CLAUDE.md

Guidance for Claude Code when working in this repository. The README is the
human-facing overview; `docs/` holds the topic documents; this file is the
working agreement.

## Commands

```bash
bun run dev          # the VM runs this as a systemd unit on :5173 — do not start a second one
bun run check        # svelte-check
bun run lint         # vp check: format check + Oxlint + tsgolint
bun run format       # Oxfmt (formats .svelte templates too)
bun run build        # vp build; output in .vercel/output
bunx fallow          # dead code, duplication, health
bun run stems        # generate the static test WAVs (gitignored)
bun run smoke:blob   # create a smoke project + song and upload through the real flow
bun run shot <path>  # full-page PNG of a dev-server page into .screenshots/ — then Read it
                     # signed in as the Screenshot Bot when PREVIEW_AUTH_TOKEN is set (docs/agent-screenshots.md)
bun run db:generate / db:migrate / db:seed / db:studio   # drizzle-kit via varlock
bun run db:preview-bot <account-slug>   # enrol the Screenshot Bot in an account
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

## Working agreement

- Commit and push each completed change (main deploys to production);
  watch the deployment and check the live pages. Kevin verifies interaction
  in a real browser; use `bun run shot` + Read for layout before reporting.
- Reference repos on GitHub: `lightning-jar/replicator` (patterns: remote
  functions, $val schemas, editors, screenshots) and `lightning-jar/lj-website`
  (look and feel, uno config, page structure). Read them with `gh api`.
- Releases: `/release <version>` (`.claude/skills/release/SKILL.md`).
- Do not record in memory what the repo already documents.
