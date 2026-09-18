# One environment each: dev, staging, production (plan)

Status: **done for dev and staging** (2026-09-18): both run on their own
1Password environment, Turso database (the newer platform, names
`stem-shovel-dev` and `stem-shovel-stage`) and Blob stores, restored from
the production snapshot of the MMKK and sirrobert accounts; production is
unchanged until the move below. Staging's address is `https://staging.stemshovel.dev`
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
6. **Seed the new databases** with real data: `bun run db:reset-stage --
--wipe --restore prod-2026-09-18 --admin kevin@lightningjar.com`
   (`APP_ENV=preview` for staging) migrates, restores the snapshot of the
   MMKK and sirrobert accounts (rows with their production ids, every file
   uploaded to the stage's own stores at the same pathnames, members with
   their passwords and 2FA, the bot as admin of MMKK), then runs the seed,
   the user docs and the operator flags. The snapshot was taken on
   2026-09-18 with `bun run db:snapshot-accounts prod-2026-09-18` into the
   gitignored `.snapshots/` (79 files, 1.4 GB); take a fresh one any time
   the VM can still read production. The home page's featured song is
   chosen on `/admin/home` per stage.
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

## Moving production to the newer Turso platform

**Done on 2026-09-18 (about 14:10 UTC):** production now runs on
`stem-shovel-prod` on the newer platform, copied from the old database
with `db:copy-database --verify` (297 rows in 25 tables, every count
matching) and switched by changing the two `TURSO_*` values in the
production 1Password environment and redeploying (`vercel redeploy` of
the live production deployment). The import-a-SQLite-file option in
Turso's wizard only creates old-format databases, so it was not used.
The value had to be written as `libsql://` because `main` was still at
v0.15.0, which predates the `turso://` normalisation; either form works
once that ships. The old database is kept untouched until 2026-09-25 for
rollback (the two values and a redeploy), then renamed `-legacy` and
deleted. The plan it followed:
The Blob stores do not move (URLs stay valid), so this is a database copy
and a config change. The gotchas met on dev and staging apply: the new
dashboard prints `turso://` URLs (accepted since `libsqlUrl`), the
database's auth token is a JWT starting `eyJ` (a platform API token is
not it), and the system table `__turso_internal_mvcc_meta` must be left
alone.

1. **Provision** `stem-shovel-prod` on the new platform with a token. Put
   nothing in 1Password yet.
2. **Rehearse** from a machine with the production token:
   `APP_ENV=production TARGET_DATABASE_URL=… TARGET_AUTH_TOKEN=…
bun run db:copy-database -- --verify` copies every table (schema,
   indexes, rows, `__drizzle_migrations`) from the live database and
   checks row counts. Point a preview at the copy if a rehearsal under the
   real build is wanted (a temporary 1Password environment with the new
   `TURSO_*` values and the production stores).
3. **Cut over** at a quiet hour, in this order, about five minutes in
   all: copy again with `--wipe --verify` (the delta since the rehearsal
   is what matters; the copy of a few MB takes seconds), change `TURSO_*`
   in the production 1Password environment to the new database, and
   redeploy production (`vercel redeploy <deployment-url>` or a push to
   `main`); the build bakes the new values in. Writes that land in the old
   database between the copy and the new deployment going live are the
   only exposure: compare `max(updated_at)` per table on the old database
   afterwards and re-copy those rows by hand if any appeared. Sessions are
   copied, so nobody is signed out.
4. **Verify**: the production smoke test, a sign-in, a page with stems, an
   upload. Keep the old database untouched for a week; rolling back is
   the 1Password value and a redeploy.
5. **Afterwards** rename the old database `stem-shovel-legacy` and delete
   it when the week is up.

## Details worth knowing before starting

- **`.env.local` layers under every stage on the VM.** varlock reads
  `.env.local` for `APP_ENV=preview` too, so a value that lives only there
  (the bot's `PREVIEW_AUTH_TOKEN` did) looks present when probing staging
  from the VM while the staging build never had it. Keep `.env.local` to
  `OP_TOKEN` and `OP_ENV_ID`; everything else belongs in 1Password.
- **A `vercel redeploy` of a preview does not move the branch domain.**
  `staging.stemshovel.dev` follows the latest deployment built from a push
  to `staging`; to rebuild staging with new 1Password values, push to the
  branch.

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
