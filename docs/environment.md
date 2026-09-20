# Environment, secrets and deployment

## varlock + 1Password

`.env.schema` (committed) declares every variable. Secrets are not committed:
the `@varlock/1password-plugin` loads them from a 1Password _environment_
(`OP_ENV_ID`) with a service-account token (`OP_TOKEN`).

- **Locally** `.env.local` (gitignored) holds `OP_TOKEN` and `OP_ENV_ID`;
  `vercel link` / `vercel env pull` writes it. `bunx varlock load` shows what
  resolves. Anything that runs outside Vite (drizzle-kit, scripts) goes
  through `bunx varlock run -- <cmd>`.
- **On Vercel** the only project variables are `OP_TOKEN`, `OP_ENV_ID` and
  `_VARLOCK_ENV_KEY`, per environment. Blob, Turso and Better Auth
  credentials never live in Vercel.
- **How values reach the server.** `@varlock/vite-integration` runs in
  `vite.config.ts` with `ssrInjectMode: "resolved-env"`: the build resolves
  the schema and injects the values into the SSR bundle. In preview and
  production `@encryptInjectedEnv` encrypts that blob with
  `_VARLOCK_ENV_KEY`, which must be set at build _and_ runtime
  (`bunx varlock generate-key --plain | vercel env add _VARLOCK_ENV_KEY production --sensitive --yes`).
  Server code reads `ENV.X` from `varlock/env`; `src/env.d.ts` is generated
  from the schema (`@generateTsTypes`) and excluded from formatting.
- `@vercel/blob` calls always pass `token` explicitly: the SDK prefers OIDC
  whenever `VERCEL_OIDC_TOKEN` is present (it is, in `.env.local`), and that
  fails in development.
- `APP_ENV` is `fallback($VERCEL_ENV, development)`; `forEnv()` in the
  schema keys off it, and varlock also loads `.env.<APP_ENV>.local`, which
  is how the VM addresses staging: `APP_ENV=preview bunx varlock run -- <cmd>`
  with staging's `OP_ENV_ID` in `.env.preview.local`.
- **Stages.** dev (the VM), staging (`https://staging.stemshovel.dev`,
  the preview deployment of the `staging` branch) and production each load
  their own 1Password environment with their own Turso database, Blob
  stores and Better Auth secret; the VM's service-account token can read
  dev and staging only. [environments.md](environments.md) has the layout
  and the switch-over steps.

## Vercel

**Domains.** Production is `www.stemshovel.com` (`PRODUCTION_URL` in
`src/lib/auth.ts`, Better Auth's base URL and the canonical in the front
page, sitemap and robots). The apex `stemshovel.com`, the first domain
`stem-shovel.com` / `www.stem-shovel.com`, and the spare names
(`stemshove.app`, `stemshovel.music`) are attached to the Vercel project as
redirects to it (308, path and query preserved), so every old bookmark and
emailed link keeps working; the old origins stay in Better Auth's
`trustedOrigins`. Cookies are per host, so the switch signs everyone out
once (and resets two-factor's trusted-device flag). Mail comes from
`no-reply@mail.stemshovel.com` (`RESEND_MAIL_DOMAIN`, verified in Resend).
A change to any 1Password value needs a production redeploy (`vercel
redeploy`) and a dev-server restart: the build bakes the resolved
environment in.

- Framework preset SvelteKit, Node 24, `main` deploys to production.
- Vercel's bundled Bun lags and cannot read the v2 lock file Bun 1.4 writes,
  so `vercel.json` sets `installCommand` to `npx bun@<version> install
--frozen-lockfile`; keep that version in step with `packageManager`.
- **Server dependencies must be ESM.** Vercel's Node 24 function launcher
  (`/opt/rust/nodejs.js`) has refused CommonJS `require()` of an ES module at
  cold start with `ERR_REQUIRE_ESM`, taking every route down while local Node
  was fine. Two sanitizers hit it: DOMPurify's server build (jsdom →
  html-encoding-sniffer → `@exodus/bytes`) and sanitize-html (htmlparser2
  10). Replicator ships the same jsdom chain and its older deployment loads
  it, so the exact trigger is not pinned down; the policy that avoids the
  whole class is no CommonJS packages in server code. Bundling via
  `ssr.noExternal` does not help (the inner `require()` survives). After
  `vp build`, check `.vercel/output/functions/*/node_modules`; the CommonJS
  packages there today come from drizzle, libsql, varlock and @vercel/blob
  and predate the problem.
- Browser-only packages (the woof-editor) are imported dynamically in
  `onMount` so their server builds never enter the function.

### Cold starts and the jobs function

Warm requests answer in 0.15–0.35 s; a **cold start** of the page function
cost 5–6 s (measured 2026-09-19 against idle deployments), and with one or
two people using the app most sessions began with one. Three things keep it
down now:

- **Background work runs in its own function.** Renditions, mixes and notes
  transcription used to run inside the page function after the response,
  which put ffmpeg (77 MB) and the transcription stack in every route's
  bundle. `src/lib/server/jobs.ts` now posts each job to `POST /api/jobs`
  (`src/routes/api/jobs/+server.ts`, `config.split = true`, 300 s), which
  answers 202 and does the work under its own `waitUntil`. The route trusts
  a bearer token derived from `BETTER_AUTH_SECRET` (an HMAC, no extra
  secret per stage) and validates the body with `JobSchema`. In
  development the dev server serves both sides. The page function's
  `node_modules` went from 131 MB to 33 MB; the jobs function carries
  117 MB including tfjs and Basic Pitch, which the tracer only packs
  because `notes.ts` names them in a literal `import()`
  (`traceTranscriptionDeps`); before that, notes were never transcribed on
  Vercel ("Cannot find package '@tensorflow/tfjs'" in every song page's
  background). The Basic Pitch model itself is bundled into the module as
  JSON (`src/lib/server/basic-pitch/`, ~1 MB, the same files as
  `static/basic-pitch`) and written to the job's temp dir for the child
  process: fetching it from the site is answered with a 429 by the
  firewall's managed bot protection (challenge mode challenges requests
  from inside the function too), and the adapter traces from the
  filesystem root, so a `process.cwd()` file path never resolves at build
  time and static files are not packed.
- **Sentry is `@sentry/node` on the server**, without its ESM loader hook and
  without tracing (see "Sentry" below). The SvelteKit server entry
  re-exports the Vite plugin, which dragged Vite, esbuild and Babel into
  every cold start, and the loader hook slowed every import after it.
- **A cron keeps the page function warm**: `vercel.json` calls
  `GET /api/warm` every five minutes on production (crons run on
  production only), which does one `select 1` and answers ok.

The emulated cold start (importing the built function with `node`, on the
VM) went from 1.8 s to 1.2 s before the first request; Lambda multiplies
that. Measure a real one by hitting an idle deployment's own URL twice.
Page loads also run their independent queries together (`songView`, the
song, project and account loaders), which trims a warm request by tens of
milliseconds.

## AI Gateway

`AI_GATEWAY_API_KEY` (optional, 1Password) switches on "Ask AI to check" and
"Draft chart with AI" in a song's settings: the rendered mix goes to
`google/gemini-3-flash` (it listens) and the transcribed notes to
`anthropic/claude-fable-5-1` (it reads) through Vercel's AI Gateway with `@ai-sdk/gateway` + `ai`, replicator's pattern
(`src/lib/server/aiDetect.ts`). Without the key the button is not shown.

## Vercel Blob stores

`BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` are the public store every file used
to live in; `BLOB_PRIVATE_READ_WRITE_TOKEN`, `BLOB_PRIVATE_STORE_ID` and
`BLOB_PRIVATE_WEBHOOK_PUBLIC_KEY` are the private store that holds the files of
private songs (docs/uploads-and-blob.md). All come from 1Password. Tokens are
trimmed of stray quotes and whitespace on use (a paste once carried a closing
`"`). Without the private token, making a song private still works but its
files stay where they are and the relocation logs an error.

## Response headers and CSP

Following lj-website's `vercel.ts`: `src/lib/constants/securityHeaders.ts`
lists the headers every response carries (`X-Robots-Tag`, `nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, HSTS, a `Permissions-Policy`
that switches off device APIs — `autoplay` is deliberately not listed
because disabling it blocks `play()` too), set in `src/hooks.server.ts` and
repeated in `vercel.json` for the static files the CDN serves. Keep the two
lists in step.

The `Content-Security-Policy` comes from SvelteKit's `csp` option in
`vite.config.ts` (mode `auto`: a nonce on its inline script per request),
so it is not in `vercel.json`. What it allows and why:

- `script-src 'self'` plus the nonce — no third-party scripts.
- `style-src 'self' 'unsafe-inline'` — `style:` attributes and transitions.
- `font-src` adds `https://fonts.bunny.net` (UnoCSS inlines the `@font-face`
  CSS at build time, so only the font files are fetched).
- `media-src`, `img-src` and `connect-src` add `https://*.public.blob.vercel-storage.com`
  and `https://*.private.blob.vercel-storage.com` (presigned URLs)
  (`<audio>` plays mixes and demos from the store; the player fetches
  renditions and MIDI files; pictures of accounts, artists and songs) and `blob:` for the mixes rendered in the
  browser; `connect-src` also adds `https://vercel.com/api/blob/`, where
  `@vercel/blob`'s client `upload()` PUTs.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`; `upgrade-insecure-requests` in production only
  (dev is plain http on localhost).

When a new external resource is added, `bun run dev` shows the refusal in
the browser console; `.screenshots/csp-sweep.mjs`-style Playwright runs
that collect "Refused to" console lines are how the policy was checked.

## Upstash Redis

One Upstash Redis database per stage (dev, staging, production), reached
over its REST API with `KV_REST_API_URL` and `KV_REST_API_TOKEN` from the
stage's 1Password environment (the names Vercel's KV integration uses).
`src/lib/server/redis.ts` posts a pipeline of commands; there is no client
library. Today it holds the rate-limit counters (`rateLimit.ts`,
`authRateLimit.ts`), shared across function instances; it is the place for
any other state that must be shared or must survive an instance, such as
the Blob read delegation cache. Both variables are optional: without them
the app runs with per-instance memory.

## Sentry

`@sentry/sveltekit` 10 in the browser (set up with Sentry's wizard, then
trimmed): `src/hooks.client.ts` initialises the browser SDK. On the server
it is **`@sentry/node`** (same version, a direct dependency): the server
`Sentry.init` lives in `src/instrumentation.server.ts`, which SvelteKit
loads before the app because `experimental.instrumentation.server` is on in
`vite.config.ts` (adapter-vercel supports it), with
`registerEsmLoaderHooks: false` and `tracesSampleRate: 0` (errors only), and
`src/hooks.server.ts` exports a `handleError` that captures every unexpected
error (never a 404) with the route as a tag. Why not the SvelteKit server
entry: it re-exports the Vite plugin, and the loader hook slows every import
(see "Cold starts and the jobs function"). The DSN is a public value and is
written inline in both files; the project is `lightning-jar / stem-shovel`.
Environments: `development` locally, `preview`/`production` from
`VERCEL_ENV`. Browser sample rates: 20 % of traces, 10 % of sessions for
Replay and every session with an error; no user identity or request bodies
(docs/security.md).

`sentrySvelteKit()` in `vite.config.ts` uploads source maps only when
`VERCEL` and `SENTRY_AUTH_TOKEN` are both set, so local builds never upload;
its load-function wrappers are off (`autoInstrument: false`), since they
import the SvelteKit server entry into every route. The token is an organisation auth token from
Sentry (Settings → Auth Tokens) with `project:releases` and `org:read`, kept
in the 1Password environment like every other secret and declared
`@optional` in `.env.schema`. It reaches the Sentry plugin because
`@varlock/vite-integration` runs `varlock load` and fills `process.env` the
moment its module is imported, which `vite.config.ts` does before creating
the Sentry plugin (`varlock run -- vp build` is not an option on Vercel:
the CLI there cannot read the encrypted integration variables). The wizard
left a copy in the gitignored `.env.sentry-build-plugin`, which the plugin
also reads.

## Turso + Drizzle

Design and rationale: [data-model.md](data-model.md). Schema files are the
source of truth: `src/lib/server/db/schema/*.ts`, one per table, with every
`relations()` in `relations.ts`.

```sh
bun run db:generate   # write a migration from schema changes into drizzle/
bun run db:migrate    # apply migrations to the Turso database
bun run db:seed       # idempotent: the one account + user the app runs as
bun run db:studio     # drizzle-kit studio
```

Migrations are committed and applied from a developer machine, not during
the Vercel build: dev on the VM as you go, staging (`APP_ENV=preview`) when
`dev` merges into `staging`, production from Kevin's machine when `staging`
merges into `main`, each before the push. `bun run db:reset-stage` rebuilds
dev or staging from the seed and refuses production. When a change would
make drizzle-kit ask about a rename, split it into two generates (drop,
then add); within a stage the old code still runs for the minutes between
the migration and the deploy, so additive first.

**Sign-in** is Better Auth ([auth.md](auth.md)). `src/hooks.server.ts` puts
the signed-in user (or null) and their memberships on `event.locals`; the
URL's `[account]` segment picks the account, viewing is public, and every
mutation checks membership through `src/lib/server/access.ts`.

## Email (Resend)

`RESEND_API_KEY` (secret) and `RESEND_MAIL_DOMAIN` (the domain verified in
Resend; mail goes out as `no-reply@` it) come from 1Password like the other
secrets. `delivered@resend.dev` is Resend's sink address for tests.
