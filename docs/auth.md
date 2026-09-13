# Authentication

Better Auth, following replicator's setup, with email + password. Viewing is
public by URL; editing needs a signed-in member.

- **Server**: `src/lib/auth.ts` — `betterAuth()` with the Drizzle adapter over
  our schema. This app's tenant table is `account`, so Better Auth's
  provider-link model is mapped to `auth_account` (`account.modelName`).
  Tables: `user` (Better Auth's core shape + `isActive`), `session`,
  `auth_account`, `verification`. `baseURL` is unset in dev (several origins)
  and pinned to the production URL otherwise; `trustedOrigins` lists the dev
  VM's names and Vercel previews.
- **Client**: `src/lib/auth-client.ts` — `createAuthClient()` from
  `better-auth/svelte`, no baseURL (defaults to the page origin). Pages call
  `authClient.signIn.email` / `signUp.email` and then `invalidateAll()`.
- **Hook**: `src/hooks.server.ts` resolves the session into `locals.user`
  (null when signed out) and `locals.memberships`, then hands the request to
  `svelteKitHandler` so `/api/auth/*` is served.
- **Routes**: `/sign-in`, `/sign-up`; signing out is the `signOut` remote
  form (`src/lib/remote/auth.remote.ts`), a POST from the nav — a GET page
  was being preloaded on hover and signing people out. Members-only pages (`/[account]/settings`, the chart/lyrics
  editors) redirect anonymous visitors to `/sign-in?next=…`.
- **New users get their own account**: the `user.create.after` hook creates
  an `account` named after them (slug from the name, made unique) and an
  `owner` membership. Inviting people into an existing account is not built
  yet — insert an `account_member` row for now.
- **Existing users** (the seeded owner predates sign-in) get a credential
  with `PASSWORD='…' bun run db:set-password <email>`; the script hashes with
  Better Auth's own hasher and writes the `auth_account` row.
- **Screenshot bypass**: a request with the `x-preview-token` header (or
  `preview_token` cookie) equal to `PREVIEW_AUTH_TOKEN` is the Screenshot Bot
  user, checked before the session (`src/lib/server/previewAuth.ts`,
  docs/agent-screenshots.md). Fail-closed when the variable is unset.
- **Not yet**: email verification, password reset and 2FA all need an email
  provider (replicator uses Resend); `requireEmailVerification` is off.
  GitHub OAuth needs an OAuth app; add `socialProviders.github` when there
  is one.
- **Env**: `BETTER_AUTH_SECRET` (in the 1Password environment; a random
  32-byte value). Dev gets one in `.env.local`.
- **Build**: `better-auth` is bundled into the server chunk
  (`ssr.noExternal` in `vite.config.ts`) because Vercel's file tracer
  resolves the package to its package.json alone and never copies `dist/`;
  its dependencies trace normally. It is pure ESM, so bundling is safe.

Access rules live in `src/lib/server/access.ts`: `requireUser` (401),
`requireSignedIn` (redirect), `requireMember` / `memberOf` (404 for
non-members, deriving the account from the entity), `canEdit` (UI only).
