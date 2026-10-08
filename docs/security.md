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
- Rendered markdown (charts, lyrics, notes, private notes, user docs) goes through
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
  relative URLs refused). A short link's target likewise (`isSafeShortTarget`,
  "Short links" below): a redirect we serve never leaves the site.
- ffmpeg runs through `execFile` with argument arrays, never a shell; inputs
  are our own Blob files in a temp directory.

- **Attachments** (files attached to songs: PDFs, images, audio, text,
  MIDI, anything else) get a kind from their extension at the reservation,
  which sets the size ceiling; the upload token allows the content types
  browsers use for these kinds (the label is a claim, nothing is decided
  by it); and when the browser reports the upload done the server reads the
  stored file's first bytes and checks them against the kind
  (`utils/fileSignatures.ts`): `%PDF-` for a PDF, a PNG, JPEG, WebP or GIF
  header for an image, an MP3, WAV, M4A/AAC, OGG, FLAC or AIFF header for
  audio, `MThd` for MIDI, and for text the first 4 KB decoding as UTF-8
  without a NUL byte; the `other` kind is checked by size alone, since it
  is never rendered, only downloaded. A file that fails is deleted with
  its row. The thumbnail the browser sends is checked by its bytes too
  (WebP or PNG) and capped at 400 KB. The permanent link `/f/<code>` is a
  16-character nanoid; it redirects to a presigned URL for a private song's
  file, so the code is the secret and the file is never served through our
  function; `?download=1` streams it as an attachment under the content
  type its name says, never as HTML. **Mentions** (`@Title` in a document
  linking to a file) are added after sanitising, on text nodes only, and
  the anchor is the only HTML they introduce, its href and text escaped
  (`utils/linkMentions.ts`). A project-level attachment (no song) goes to
  the store the project's privacy calls for; attaching a file to a song or
  back to the project (`attachFile`) needs an editor of the account and, on
  a restricted project, one added to it, and only ever moves a file
  between a project and its own songs.
- **Downloads** (`GET /api/songs/[id]/documentation.pdf`,
  `GET /api/projects/[id]/documentation.zip`, `GET /api/projects/[id]/charts.zip`;
  docs/uploads-and-blob.md, "Documentation downloads") are open to whoever
  may view the song or the project by the page's own rules
  (`viewAccess.canViewSong`, `canViewProject`: everyone for a public one,
  members and project viewers or a share code for a private one, those
  added to a restricted one), a private song inside a public project left
  out of the project's zips for those who may not see it; ids are nanoids
  and an unknown one is a 404. They are built in the request from the
  song's own text and our own blobs (`readBlob` refuses any other URL),
  never from anything the request carries, and sent as attachments named
  through `attachmentDisposition` so a title cannot break the header.
- **Notation files** (MusicXML) attached to songs follow the same three
  gates: extension and size (10 MB) at the reservation, content type at the
  upload token (the MusicXML types plus XML, zip and octet-stream, as
  browsers label these files), and the first 4 KB of the stored file when
  the browser reports it done: a zip header for `.mxl`, else an XML
  prologue that names a `score-partwise` or `score-timewise`
  (`startsLikeZip`, `startsLikeMusicXml`). That is a byte sniff, not a
  parse: the server never parses untrusted XML (no entity expansion, no
  DTD fetches); Verovio renders the file in a worker in the browser. A file
  that fails the sniff is deleted with its row; the thumbnail is checked
  and capped as an attachment's, and the permanent link works the same way. The
  PDF the jobs function engraves from the file (Verovio in Node, the same
  engine the browser runs; `src/lib/server/notationPdf.ts`) is written
  beside the file in the same store and served through `/f/<code>?download=pdf`
  under the same code; Verovio reads the file in WebAssembly, and a file
  it cannot read marks the render failed, nothing more.

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
viewing links 60/h, share emails 5/min and 30/h, short links 30 per ten
minutes per address signed out and 120 per user signed in. Better Auth's own
limiter covers sign-in and password endpoints in production. Viewing and
invite codes are 12 characters from a 31-symbol alphabet; short-link codes
are 8 from a 57-symbol one (no 0/O/1/l/I).

## Short links

A short link (`short_link`, `src/lib/server/shortLinks.ts`) is an
8-character code for a page on the app with its query and hash, so the
instruments' long share links (the chord player's settings ride after `#`)
fit in a message. The rules:

- **Anyone mints one**, signed in or not, through the `mintShortLink`
  command, because the instruments work signed out. The limiter above
  bounds it per address and per user, and an identical target by the same
  user (or the same anonymous target within a day) answers the code that
  exists rather than a new row.
- **No open redirect.** The schema (`ShortLinkMintSchema`) accepts only a
  path: one leading slash, so `//host` and any scheme are refused; no
  backslash (browsers read `/\host` as `//host`); no control characters, so
  nothing can split the Location header; at most 4000 characters. The client
  strips the origin with `shortLinkTarget`, which answers null for any other
  origin. Resolving prepends the site's own origin, so a code can only ever
  send a visitor to this site.
- **Expiry.** A signed-in user's link never expires; an anonymous one lives
  90 days and the daily cron (`/api/notifications/digest`) deletes what has
  expired. An expired or unknown code is a 404 at `/x/<code>` and a
  redirect to the front page on the short domain.
- **Resolving** is public and uncached (`cache-control: no-store`):
  `/x/<code>` on the app, and `/<code>` on the short domain
  (`SHORT_LINK_ORIGIN`; docs/environment.md "Short links"), which
  `src/hooks.server.ts` answers before any session work with a 302 to
  production's own origin; every other path on that domain goes to the front
  page. The hook ignores a short domain that names the site itself, so a
  misconfiguration cannot swallow every page. Hits are counted after the
  response and never fail the redirect.

## Headers

`securityHeaders.ts` + `vercel.json`: nosniff, no framing, `Referrer-Policy`,
`Cross-Origin-Opener-Policy: same-origin`, HSTS, a `Permissions-Policy` that
switches off device APIs (passkeys keep `publickey-credentials-get=(self)`; the
looper's Computer source needs `display-capture=(self)`; the
default for `-create` is already self), and SvelteKit's CSP with a per-request script nonce
(docs/environment.md). Search engines get the front page, the user docs
(`/docs`, each page, not the editors), the blog (`/blog`, each published
post; a draft carries noindex and is a 404 to everyone but a system admin),
the Releases page, the tuner, the pricing page and the built-with page (`src/lib/utils/isIndexablePath.ts`): every other path carries
`X-Robots-Tag: noindex, nofollow, noarchive` (the hook, and vercel.json's
rule for static files) and a matching robots meta from the root layout;
`robots.txt` allows those paths alone and points at `sitemap.xml`, which
lists them with each doc page's last change. Doc pages carry a meta
description from their first paragraph.

## Error reports

Sentry (`@sentry/sveltekit`; `src/hooks.client.ts` for the browser,
`src/instrumentation.server.ts` for the server, which SvelteKit 3 loads
before the app) receives unhandled errors with the stack, route and browser,
plus a 20 % sample of traces. No user identity and no request bodies are
sent (every `dataCollection` category off); Replay samples 10 % of sessions and every session
with an error, with text and inputs masked. Development reports too, under its own environment tag. The CSP allows the ingest host in `connect-src`. Source maps go
up from Vercel builds only, with `SENTRY_AUTH_TOKEN`.

## Analytics

Vercel Web Analytics and Speed Insights (the packages' generic entries,
injected once by `src/lib/observability.ts` from `src/routes/+layout.ts`,
with the route reported after each navigation by the root layout; their
`/sveltekit` entries still read SvelteKit 2's `$app/stores`) count page
views by route and collect Core Web Vitals per route. It is cookieless and
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

A person's **private note on a song** (`song_user_note`, the `mynotes`
kind of `saveDoc`) is theirs alone: it is read and written with their user
id (`getUserNote`, `saveUserNote`), never returned for anyone else, never
listed, and left out of exports and share links. Keeping one needs only
signing in and being able to view the song by the song page's own rules
(`songViewerOf` in `access.ts` runs `canViewSong`: members and project
viewers, or a share code the visitor carries), not the editor role the
shared documents need; it answers 401 signed out and 404 otherwise.

**Version history** (`history.remote.ts`, docs/data-model.md
`song_doc_version` and `comment_version`) follows the same lines. Reading
the revisions of a shared document (chart, lyrics, notes) or of a comment
takes `songViewerOf`: anyone signed in who may view the song, viewers
included, since a revision names who saved it. The revisions of a private
note are read with the caller's user id and never returned for anyone
else, like the note. Restoring takes the permission of saving what it
restores: `memberOf` (an editor) for a shared document, `songViewerOf` for
one's own private note, and for a comment its author or an owner / admin
of the account, the rule deleting one uses. A restore is a save (`saveSongDoc`
/ `saveUserNote` / `updateComment`), so the text it replaces becomes a
revision and nothing is lost; a revision is looked up with its document's
ids, so one from another song, kind, person or comment is "not found".

## Rate limits

`rateLimited(key, max, window)` counts in Upstash Redis when a stage has it
(`KV_REST_API_URL`, `KV_REST_API_TOKEN`; docs/environment.md), a fixed
window per key shared by every function instance, so a limit means what it
says; Better Auth's own limiter (sign-in, password reset, two-factor, passkeys) uses
the same Redis through `authRateLimitStorage`. Without Redis, or if it
fails, each function instance counts in its own memory, which bounds abuse
rather than counting exactly (a warning is logged once).

## Known gaps

- The Blob read delegation lives in process memory, per function instance.
- `bun audit` reports esbuild advisories in development-only tooling
  (drizzle-kit's and vite-plus's `tsx`); nothing shipped is affected.
- A public copy of a file can be served from the edge cache for a short
  time after a song goes private.
