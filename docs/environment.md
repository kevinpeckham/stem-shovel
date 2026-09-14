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

## Response headers and CSP

Following lj-website's `vercel.ts`: `src/lib/constants/securityHeaders.ts`
lists the headers every response carries (`X-Robots-Tag`, `nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, a `Permissions-Policy`
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
