# Security model and hardening

What protects what, and where each rule lives. The first security pass ran on
2026-09-16 (v0.7.1); this is its record and the checklist for the next one.

## Trust boundaries

- **Viewing** is public by URL unless a project or song is private; then a
  member or a share-link code is needed (`src/lib/server/viewAccess.ts`, the
  account layout, the project and song loaders, the mix endpoint). Private
  songs' files live in a private Blob store reached only by presigned URLs
  (docs/uploads-and-blob.md).
- **Editing** needs a signed-in member of the entity's account. Every remote
  function and API route resolves the account from the entity it touches
  (`memberOf`, `accountOf*` in `src/lib/server/access.ts`), never from the
  URL, and every query in `data.ts` is scoped by `accountId`.
- **Super admins** (`user.is_super_admin`, set only by `bun run db:super-admin`,
  separate from the system-admin flag) count as an owner of every account
  they do not belong to: the hook adds those accounts to their memberships
  marked `actingAs` (`src/lib/utils/actingMemberships.ts`), so every
  membership check passes without a second code path. Every request that
  uses such a membership is written to `audit_log` (who, which account,
  method and path) and listed on `/admin`; the header shows "acting as
  owner" and the account's settings page carries a notice. Acting accounts
  stay out of the account menu, the accounts page and the current-account
  choice.
- **Owners and admins** invite, manage members and account settings;
  **system admins** (`user.is_system_admin`, set only by a script) reach
  `/admin` and the user-doc editor; everyone else gets a 404 there.
- **Sign-up** is closed: an invitation token or an invite code, checked in
  Better Auth's `user.create.before` hook (`signUpGate.ts`). Email addresses
  must be verified before sign-in.

## Input and output

- Every mutation's data passes a valibot schema (`src/lib/val/`); ids are
  nanoids, slugs are checked, lengths are bounded.
- Rendered markdown (charts, lyrics, notes, user docs) goes through
  `renderMarkdown` → `sanitize.ts`: an element and attribute allowlist,
  `http(s)`/`mailto`/`tel`/relative URLs only, ids only on footnotes (DOM
  clobbering). Every `{@html}` in the app renders that output or a constant.
- Comments, bug reports, titles and names render as text.
- Email subjects are header-safe; bodies are escaped by `renderEmail`.
- Upload completion (`/api/*/ready`) accepts only the URL of the file the
  reservation was for, in one of our stores (`isOurBlobUrl`), and the server
  refuses to read any other URL (`readBlob`) — no SSRF through a reported
  URL. Uploads themselves are tokenised per reservation by `/api/upload`
  with content-type and size limits.
- `?next=` after sign-in must be a same-site path (`safeNext`; protocol-
  relative URLs refused).
- ffmpeg runs through `execFile` with argument arrays, never a shell; inputs
  are our own Blob files in a temp directory.

## Sessions and cookies

Better Auth (docs/auth.md): httpOnly, secure, lax cookies; the session cookie
cache lasts one minute, so suspending or deleting a user, or revoking a system
admin, takes effect within that. `share` (viewing codes) and
`current_account` are httpOnly, secure, lax. The screenshot bypass
(`PREVIEW_AUTH_TOKEN`) is compared in constant time and is not configured in
production, so it is closed there.

## Abuse limits

`src/lib/server/rateLimit.ts` (per function instance): custom mixes 20/h per
user or address, bug reports 10/h, invitations 30/h, invite codes 30/h,
viewing links 60/h, share emails 5/min and 30/h. Better Auth's own limiter
covers sign-in and password endpoints in production. Codes are 12 characters
from a 31-symbol alphabet.

## Headers

`securityHeaders.ts` + `vercel.json`: no indexing, nosniff, no framing,
`Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`, HSTS, a
`Permissions-Policy` that switches off device APIs, and SvelteKit's CSP with a
per-request script nonce (docs/environment.md).

## Known gaps

- Rate limits and the Blob read delegation live in process memory, per
  function instance.
- The viewer role can edit; roles below admin are not yet distinguished.
- `bun audit` reports esbuild advisories in development-only tooling
  (drizzle-kit's and vite-plus's `tsx`); nothing shipped is affected.
- A public copy of a file can be served from the edge cache for a short
  time after a song goes private.
