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
- **No AI** (`project.no_ai`, `song.no_ai`; any member sets it from the
  project's or song's settings): with it set, nothing from the song goes to
  a model and nothing is transcribed — the AI buttons are hidden, the
  `askAiAboutSong` and `draftChart` commands answer 403, and the notes job
  skips the song. A project's flag covers its songs. The song header shows
  a "no AI" chip. Tempo and key detection (plain signal processing, in the
  browser) is not affected. For artists whose contracts rule AI out.
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
user or address, bug reports 10/h, feature-request votes 120/h (the
feature-requests page itself is public and read-only, kept out of search
engines; a request shows there once a system admin approves it, and a
profanity check at creation flags words for the admin and the notification
email), markdown previews for the front page's demo 60/min per address, invitations 30/h, invite codes 30/h,
viewing links 60/h, share emails 5/min and 30/h. Better Auth's own limiter
covers sign-in and password endpoints in production. Codes are 12 characters
from a 31-symbol alphabet.

## Headers

`securityHeaders.ts` + `vercel.json`: nosniff, no framing, `Referrer-Policy`,
`Cross-Origin-Opener-Policy: same-origin`, HSTS, a `Permissions-Policy` that
switches off device APIs, and SvelteKit's CSP with a per-request script nonce
(docs/environment.md). Search engines get the front page, the user docs
(`/docs`, each page, not the editors), the Releases page, the tuner and the
pricing page (`src/lib/utils/isIndexablePath.ts`): every other path carries
`X-Robots-Tag: noindex, nofollow, noarchive` (the hook, and vercel.json's
rule for static files) and a matching robots meta from the root layout;
`robots.txt` allows those paths alone and points at `sitemap.xml`, which
lists them with each doc page's last change. Doc pages carry a meta
description from their first paragraph.

## Error reports

Sentry (`@sentry/sveltekit`; `src/hooks.client.ts` for the browser,
`src/instrumentation.server.ts` for the server, loaded before the app by
SvelteKit's `experimental.instrumentation.server`) receives unhandled errors
with the stack, route and browser, plus a 20 % sample of traces. No user
identity and no request bodies are sent (`dataCollection` off,
`sendDefaultPii: false`); Replay samples 10 % of sessions and every session
with an error, with text and inputs masked. Development reports too, under its own environment tag. The CSP allows the ingest host in `connect-src`. Source maps go
up from Vercel builds only, with `SENTRY_AUTH_TOKEN`.

## Analytics

Vercel Web Analytics and Speed Insights (`@vercel/analytics/sveltekit` and
`@vercel/speed-insights/sveltekit`, each called once in
`src/routes/+layout.ts`) count page views by route and collect Core Web
Vitals per route. It is cookieless and
keeps no identifier; its script and beacons are same-origin under
`/_vercel/insights/` and `/_vercel/speed-insights/`, so the CSP allows them
as `self` (dev alone allows Vercel's debug script host). Both share a
`beforeSend` that drops every query string and replaces the token segment of
confirmation, manage and invitation links, so one-time links never reach
either store.

## Support requests (/support)

Open to signed-out visitors, so it must not become an oracle for which
email belongs to which account. The visitor enters an email and gets five
partly hidden account names (`obscureName`: "MMKK" → "M*KK"); when the
email is a member's, one of them is theirs, otherwise all five are made up
(`fakeAccountNames`), and the response looks the same either way. The
correct index, the account and the email travel in a sealed token
(`src/lib/server/supportChallenge.ts`: AES-256-GCM under a key derived
from `BETTER_AUTH_SECRET`, 15-minute expiry), so nothing is kept between
the two steps and the page cannot read the answer. Rate limits: 20 starts
and 20 picks an hour per address, 8 starts and 5 picks an hour per email,
so a guess is a one-in-five shot a few times an hour and confirms only a
partly hidden name. A honeypot field rejects bots. Signed-in members skip
the line-up; every request records the verification path, address and
user agent for the admin page.

## Roles

Owner, admin, member and viewer. Every mutation, upload and editing page
goes through `requireEditor` (`memberOf` uses it): owner, admin and member
pass, a viewer gets the same 404 a non-member would. `canEdit`, which the
pages use to show controls, is false for a viewer; `isMember` is what a
viewer still has: the account's private work is theirs to see, and
comments are the one mutation open to them (`memberOf(…, { viewers: true })`).
Owner-only and admin-only actions check the role themselves in
`accounts.remote.ts`.

## Rate limits

`rateLimited(key, max, window)` counts in Upstash Redis when a stage has it
(`KV_REST_API_URL`, `KV_REST_API_TOKEN`; docs/environment.md), a fixed
window per key shared by every function instance, so a limit means what it
says; Better Auth's own limiter (sign-in, password reset, two-factor) uses
the same Redis through `authRateLimitStorage`. Without Redis, or if it
fails, each function instance counts in its own memory, which bounds abuse
rather than counting exactly (a warning is logged once).

## Known gaps

- The Blob read delegation lives in process memory, per function instance.
- `bun audit` reports esbuild advisories in development-only tooling
  (drizzle-kit's and vite-plus's `tsx`); nothing shipped is affected.
- A public copy of a file can be served from the edge cache for a short
  time after a song goes private.
