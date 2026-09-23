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
- **Routes**: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
  (from the emailed link, `?token=`), `/verify-email` (where verification
  links land, `?verified=1` or `?error=`), `/invite/[token]`. Signing out is
  the `signOut` remote form, a POST from the nav.
- **Email** goes through Resend (`src/lib/server/email.ts`, templates
  rendered by `lib/utils/renderEmail.ts`) as `no-reply@RESEND_MAIL_DOMAIN`.
  Sign-in needs a verified address: `requireEmailVerification`, the link
  sent on sign-up and again at the sign-in wall, `autoSignInAfterVerification`.
  Password reset is Better Auth's flow (`requestPasswordReset` →
  `resetPassword`); finishing a reset also marks the address verified, which
  is how a user created outside sign-up gets in. Migration 0021 marked every
  user that existed before verification as verified.
- **Invitations** (`invitation` table): owners and admins invite an address
  with a role from account settings; the email carries `/invite/<token>`
  (14-day expiry). Accepting needs a signed-in user whose address matches and
  creates the membership; the settings page lists and revokes pending ones.
- **Several accounts per user**: memberships carry a role each. The
  "current" account for neutral pages (home, docs, admin, the `/projects`
  and `/settings` shortcuts, the post-verification landing) is the
  `current_account` cookie, set whenever a member opens an account's pages,
  else the first account they own, else the first membership
  (`src/lib/server/currentAccount.ts`). `/accounts` lists a user's accounts
  with roles and lets them leave (never the last owner). In account
  settings owners change any role (that is how ownership is handed over)
  and remove anyone; admins set member/viewer and remove non-owners.
  Anyone who belongs to an account can start another of their own (`createAccount`,
  owner role, from the menu or `/accounts`). Signing up through an invitation or
  an account's invite code joins that account only — the personal workspace is created only for a new-account
  code or a user made outside sign-up.
- **Privacy** (`project.is_private`, `song.is_private`, migration 0028):
  everything is public by default; any member makes a project or a
  song private from its settings (a private project makes every song in it
  private). Private means a signed-in member of the account, or a visitor
  carrying an open **share link** code. `share_link` rows (any member makes
  them, for one song or one project; note, optional expiry and use limit,
  revocable) are 12-character codes; the link is the page URL plus
  `?share=<code>`. `[account]/+layout.server.ts` validates an arriving code,
  counts the use, stores it in the `share` cookie (30 days, up to ten
  codes) and hands the open grants to the loaders, which decide with the
  pure rules in `src/lib/server/viewAccess.ts`; the mix endpoint applies the
  same rule from the cookie. A share link grants viewing only. Refusals are
  403s rendered by `src/routes/+error.svelte` with a sign-in button. Private
  projects are left out of the projects list for anyone who cannot open
  them; private songs likewise on the project page. Share-by-email on a
  private song mints a viewing link for the recipient. A private song's
  files live in the private Blob store and reach the browser only as
  presigned URLs (docs/uploads-and-blob.md), so a direct file URL is no
  back door.
- **Sign-up mode** (`signUpMode` app setting, `/admin/sign-up`, read by
  the root layout as `signUpOpen` and cached 15 s per instance): "open"
  (the default when unset) lets anyone create a free account, and the
  front, pricing, sign-up and waitlist pages say so; "invite" brings the
  waitlist back everywhere. The sign-up page has a plan step (only Free
  today, from `PLAN_LIMITS`) whose terms checkbox (`/docs/plan-terms`, a
  seeded user doc) must be ticked: the hook refuses without
  `acceptPlanTerms: "yes"` and records `user.plan_terms_accepted_at`
  (migration 0058). An invitee skips the plan step and ticks the terms in
  the form.
- **Invite-only sign-up** (`src/lib/server/signUpGate.ts`, run from Better
  Auth's `user.create.before` hook in `src/lib/auth.ts`): the sign-up
  request must carry an invitation token (`/sign-up?invite=<token>`, where
  the invitation page sends a newcomer; the address is locked to the
  invitation's) or an invite code (`/sign-up?code=…` or typed). The hook
  refuses with a 400 and a reason — not a 403, which the sign-up route
  turns into a fake success as its duplicate-email cover. The
  `create.after` hook then joins the inviting account (accepts the
  invitation or counts a use of the code) besides creating the personal
  one. Users made outside sign-up (seed, scripts) have no request context
  and pass.
- **System admin** (`user.is_system_admin`, migration 0024): the operator
  of the app, set only by `bun run db:system-admin <email>` (`--remove` to
  undo), never from a request. `/admin` (404 for everyone else, so it is not
  advertised) lists every account with its members, songs and storage,
  every user (with suspend — signs them out and blocks sign-in via the
  `isActive` check in `hooks.server.ts`, up to the session cookie cache's
  minute — reactivate, and delete, which cascades their sessions,
  memberships and comments and removes an account they alone belonged to
  only when it has no projects), and suspends, reactivates or deletes **accounts** (suspended: every page
  under it is a 403 for everyone and its memberships count as none, so
  mutations and uploads close; deleted: every row and every Blob file of
  the account go, members keep their users), and mints **new-account
  invite codes**: `invite_code` rows
  with no `account_id`, which open sign-up without joining anything — the
  newcomer gets only their own workspace. `requireSystemAdmin` in
  `src/lib/server/access.ts` guards the page and `src/lib/remote/admin.remote.ts`.
- **Super admin** (`user.is_super_admin`, migration 0030): acts as owner
  of every account, audited; docs/security.md has the details.
- **Invite codes** (`invite_code` table, migration 0023): owners and admins
  generate them in account settings with a role, an optional note, a use
  limit (blank = unlimited) and an expiry (never / 7 / 30 / 90 days), copy
  the code or its sign-up link, and revoke them; the list shows uses and
  whether a code is open, used up, expired or revoked. Codes are 12
  characters from an alphabet without 0/O/1/I/L, shown in groups of four;
  `normalizeInviteCode` makes case and separators irrelevant.
- **Share by email**: members send a song's public link with a note from the
  paper-plane button in the song header (`shareSong` command, a few per
  minute per user).
- **New users get their own account**: the `user.create.after` hook creates
  an `account` named after them (slug from the name, made unique) and an
  `owner` membership. Others join through invitations (below).
- **Existing users** (the seeded owner predates sign-in) get a credential
  with `PASSWORD='…' bun run db:set-password <email>`; the script hashes with
  Better Auth's own hasher and writes the `auth_account` row.
- **Screenshot bypass**: a request with the `x-preview-token` header (or
  `preview_token` cookie) equal to `PREVIEW_AUTH_TOKEN` is the Screenshot Bot
  user, checked before the session (`src/lib/server/previewAuth.ts`,
  docs/agent-screenshots.md). Fail-closed when the variable is unset.
- **Two-factor (TOTP)**, replicator's setup: Better Auth's `twoFactor`
  plugin (issuer "Stem Shovel", 6 digits / 30 s, ten 8-character backup
  codes, a 30-day trust-device cookie) with the `two_factor` table and
  `user.two_factor_enabled` (migration 0035). The user drives it from the
  browser: `/settings/security` (enable with password → QR from the
  `totpURI` + backup codes → first code; disable; new codes) through
  `authClient.twoFactor.*`; the server only sends the "it changed" email
  (`notifyTwoFactorChanged` in `security.remote.ts`). Sign-in with it on
  answers `twoFactorRedirect` instead of a session, and the sign-in page
  goes to `/verify-2fa?next=…`, where a TOTP or backup code completes the
  session. `locals.user.twoFactorEnabled` mirrors the flag; the Screenshot
  Bot has none. The plugin rate-limits `/two-factor/*` (3 per 10 s) and
  locks after repeated failures.
- **Passkeys** (WebAuthn): `@better-auth/passkey` with the `passkey` table
  (migration 0057; columns named as the plugin's fields, since the Drizzle
  adapter maps by property). `rpID` is the domain a credential is bound to:
  `stemshovel.com` in production (www and the bare domain share keys),
  `staging.stemshovel.dev` on the preview, the proxy name
  `stem-shovel.wr.lj.dev` in dev; the origin is checked against the request
  (gated by `trustedOrigins`). `residentKey: "preferred"` asks for a
  discoverable credential so `/sign-in` can offer "Sign in with a passkey"
  and browser autofill (`autocomplete="username webauthn"`, conditional
  mediation on mount) with no email typed. A passkey sign-in makes a full
  session with no two-factor step (the device verified the person). The
  Security page lists the user's passkeys (`listPasskeys` in data.ts),
  adds one through `authClient.passkey.addPasskey({ name })` and removes
  through `deletePasskey`; `notifyPasskeyChanged` sends the "added" or
  "removed" email. Deleting a user removes their passkeys (cascade.ts).
- **The beta waitlist** (`waitlist_signup`, `waitlist.remote.ts`,
  `WaitlistForm.svelte` on the front page and `/waitlist`): an address joins
  with an optional name and a separate, off-by-default consent to
  project-update email; a confirmation email (double opt-in) carries
  `/waitlist/confirm/<token>`, and every waitlist email carries
  `/waitlist/manage/<token>` to change the consent or leave. A honeypot field
  and per-address and per-IP rate limits keep bots out. Confirmed entries
  are invited from `/admin/waitlist`: a single-use, 30-day new-account
  invite code is made and emailed, and the entry keeps the code. Waitlist
  mail (confirmation, invite) is transactional and always sent; project
  updates are not sent by the app yet — the consent is stored for when they
  are.
- **Not yet**: changing the email address, removing members, sending project updates.
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
