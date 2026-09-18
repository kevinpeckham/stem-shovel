# One environment each: dev, staging, production (plan)

Status: **in progress** (2026-09-18): the code, the `db:reset-stage`
script and the docs are done; the consoles (Turso, Blob, 1Password, Vercel)
are Kevin's steps below, and the switch happens when the new ids reach
`.env.local` and Vercel. Staging's address is `https://staging.stemshovel.dev`
(a domain attached to the Preview environment; deployment protection is off).
Before this change every deployment
and the VM's dev server share one 1Password environment, one Turso
database and one pair of Blob stores. That is why a migration generated on
dev lands in production the moment it is applied, why throwaway test songs
have to be cleaned up with care, and why the Screenshot Bot cannot sign in
on staging without opening production too. This is the plan to give dev,
staging and production their own set of everything.

## Target

| Thing                        | dev (the VM)                                       | staging (Vercel preview of `staging`)       | production (`main`)                                                  |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| 1Password environment        | `stem-shovel-dev`                                  | `stem-shovel-staging`                       | `stem-shovel-production` (today's, renamed)                          |
| `OP_ENV_ID` comes from       | `.env.local`                                       | Vercel env var, Preview scope               | Vercel env var, Production scope                                     |
| `OP_TOKEN` (service account) | the narrow one: dev + staging only                 | the full one                                | the full one                                                         |
| Turso database               | `stem-shovel-dev`                                  | `stem-shovel-staging`                       | `stem-shovel` (today's)                                              |
| Blob stores (public/private) | `stem-shovel-dev` / `…-dev-private`                | `stem-shovel-staging` / `…-staging-private` | today's two                                                          |
| `BETTER_AUTH_SECRET`         | its own                                            | its own                                     | today's                                                              |
| `PREVIEW_AUTH_TOKEN` (bot)   | set                                                | set                                         | **absent** (stays closed)                                            |
| `AI_GATEWAY_API_KEY`         | same key (spend is small; the log is per database) | same                                        | same                                                                 |
| `RESEND_*`                   | same key and domain                                | same                                        | same                                                                 |
| Sentry                       | `environment: development`                         | `preview`                                   | `production` (already tagged)                                        |
| Better Auth `baseURL`        | inferred from the request                          | inferred                                    | pinned (from `VERCEL_PROJECT_PRODUCTION_URL`, replacing the literal) |

Nothing in the app code knows which environment it is in beyond `APP_ENV`
(`VERCEL_ENV` on Vercel, `development` locally): the split is entirely in
which 1Password environment a build or process loads.

## Why this shape

- **One 1Password environment per stage** keeps the schema unchanged: the
  same variable names, different values. `OP_ENV_ID` is the only switch,
  and Vercel already scopes env vars per environment (Production /
  Preview / Development), so previews of `staging` load the staging
  values and nothing else changes on Vercel.
- **A database per stage** ends the "additive migrations only, deploy code
  before dropping columns" rule as a cross-stage concern. It still holds
  _within_ a stage during the minutes between a migration and the deploy
  that uses it (rename = two releases), which is the normal rule.
- **Blob stores per stage** because a store is where files are deleted
  from by URL and where "delete account" and "delete song" reach. Sharing
  a store between dev and staging would work (pathnames carry ids), but
  cleaning dev up must never touch staging's files. Stores cost by bytes
  held, and dev and staging hold little.
- **The Screenshot Bot** gets `PREVIEW_AUTH_TOKEN` on dev and staging, so
  `bun run smoke:urls` and screenshots run against staging signed in,
  while production stays closed to it.

## Steps

The secrets and service consoles are Kevin's (1Password, Vercel, Turso);
the code, scripts and docs are Claude's. In order:

1. **Turso**: create `stem-shovel-staging` and `stem-shovel-dev` (empty:
   `turso db create <name>`; a token each). Do not fork production: a fork
   would carry file URLs into the private production store that the other
   stages cannot read. Seeded data is enough (step 6).
2. **Blob**: create four stores in the Vercel project (public and private
   for staging, the same for dev) and note each store's id, read-write
   token and webhook public key. Attach nothing to the project's env vars
   (the values go to 1Password, as today).
3. **1Password**: duplicate today's environment twice, rename the three
   (`-production`, `-staging`, `-dev`), and in the two new ones replace
   `TURSO_*`, the six `BLOB_*` values, `BETTER_AUTH_SECRET` (a fresh
   `openssl rand -base64 32` each) and add `PREVIEW_AUTH_TOKEN` (the one
   from `.env.local` today, or a fresh one; 32+ characters). The service
   account needs read access to all three; a second token for the VM with
   dev and staging only is the safer choice, so a stray command on the VM
   can never load production (production migrations then run from Kevin's
   machine, step 7).
4. **Vercel**: set `OP_ENV_ID` for the Preview environment to the staging
   id (Production keeps today's). Redeploy staging.
5. **The VM**: `.env.local` gets the dev id; a `.env.preview.local`
   (gitignored) with the staging id lets `APP_ENV=preview bunx varlock run
-- <cmd>` address staging from the VM (migrations, the bot enrolment,
   smoke tests). Restart the dev server.
6. **Seed the new databases**: `bun run db:migrate`, `db:seed` (the demo
   account and songs), `db:seed-docs` (the user docs), `db:system-admin`
   and `db:super-admin` for Kevin, `db:preview-bot` for the bot, and
   `bun run smoke:blob` once so each stage has a song with real files.
   The home page's featured song is chosen on `/admin/home` per stage.
   Claude adds a `db:reset-stage` script that does all of that against
   whichever `APP_ENV` is set, so staging can be wiped and rebuilt in a
   minute.
7. **Migrations per stage**: dev migrates on the VM as now; staging
   migrates from the VM with `APP_ENV=preview` when `dev` is merged into
   `staging`; production migrates from Kevin's machine (or the VM with the
   full-access token) when `staging` is merged into `main`, before the
   push. The release skill gets that step. Running the migration inside the
   Vercel build (`db:migrate` before `vp build`) would remove the manual
   step; the first try at `varlock run` in a Vercel build failed
   (2026-09-17), so that is a follow-up to investigate, not part of this
   change.
8. **Code** (Claude, small): Better Auth's production `baseURL` from
   `VERCEL_PROJECT_PRODUCTION_URL`; Sentry's server environment already
   follows `VERCEL_ENV`, the browser's should too (it says `production`
   on previews today); `scripts/smoke-urls.mjs` gains
   `SMOKE_BASE=<staging>` with the bot pass; docs/environment.md and
   CLAUDE.md describe the three stages; the memory note about the shared
   database goes.
9. **After the switch**: throwaway test projects on dev no longer need
   ceremony (dev is disposable), and staging can be reset from the seed
   whenever it drifts.

## Details worth knowing before starting

- **Blob's completion webhook** (`onUploadCompleted`) calls back to
  `VERCEL_PROJECT_PRODUCTION_URL`, which on a preview is still the
  production host; production then answers 400 for an unknown reservation
  and nothing happens. The browser's own `/ready` report is what completes
  an upload anyway. Setting `VERCEL_PROJECT_PRODUCTION_URL` for the Preview
  scope to the staging alias fixes the backstop for staging.
- **Emails** from staging go out through the same Resend key and domain;
  only seeded and test addresses live there, so nothing reaches real
  users. A `[staging]` subject prefix from `APP_ENV` is a five-line option
  if that ever changes.
- **Two-factor** enrolments live in the database, so Kevin's account on
  staging and dev starts without 2FA (and its own password, set with
  `db:set-password`). The seed can create his user with a known password.
- **Costs**: Turso's free tier covers several small databases; four small
  Blob stores are cents per month; nothing else is billed per environment.
- **Effort**: about half a day, most of it clicking through Turso, Vercel
  and 1Password; the code and scripts are an hour.
