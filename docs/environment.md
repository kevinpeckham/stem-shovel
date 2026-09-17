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
  schema keys off it.

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
- `media-src` and `connect-src` add `https://*.public.blob.vercel-storage.com`
  and `https://*.private.blob.vercel-storage.com` (presigned URLs)
  (`<audio>` plays mixes and demos from the store; the player fetches
  renditions and MIDI files) and `blob:` for the mixes rendered in the
  browser; `connect-src` also adds `https://vercel.com/api/blob/`, where
  `@vercel/blob`'s client `upload()` PUTs.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`; `upgrade-insecure-requests` in production only
  (dev is plain http on localhost).

When a new external resource is added, `bun run dev` shows the refusal in
the browser console; `.screenshots/csp-sweep.mjs`-style Playwright runs
that collect "Refused to" console lines are how the policy was checked.

## Sentry

`@sentry/sveltekit` 10 (set up with Sentry's wizard, then trimmed).
`src/hooks.client.ts` initialises the browser SDK and `src/hooks.server.ts`
wraps `handle` with `sentryHandle()` and exports `handleErrorWithSentry()`;
the server `Sentry.init` lives in `src/instrumentation.server.ts`, which
SvelteKit loads before the app because `experimental.instrumentation.server`
is on in `vite.config.ts` (adapter-vercel supports it). The DSN is a public
value and is written inline in both files; the project is `lightning-jar /
stem-shovel`. Environments: `development` locally, `preview`/`production`
from `VERCEL_ENV`. Sample rates: 20 % of traces, 10 % of sessions for
Replay and every session with an error; no user identity or request bodies
(docs/security.md).

`sentrySvelteKit()` in `vite.config.ts` instruments load functions and
uploads source maps only when `VERCEL` and `SENTRY_AUTH_TOKEN` are both set,
so local builds never upload. The token is an organisation auth token from
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
the Vercel build. When a change would make drizzle-kit ask about a rename,
split it into two generates (drop, then add).

**Sign-in** is Better Auth ([auth.md](auth.md)). `src/hooks.server.ts` puts
the signed-in user (or null) and their memberships on `event.locals`; the
URL's `[account]` segment picks the account, viewing is public, and every
mutation checks membership through `src/lib/server/access.ts`.

## Email (Resend)

`RESEND_API_KEY` (secret) and `RESEND_MAIL_DOMAIN` (the domain verified in
Resend; mail goes out as `no-reply@` it) come from 1Password like the other
secrets. `delivered@resend.dev` is Resend's sink address for tests.
