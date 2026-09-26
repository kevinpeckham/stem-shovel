# Notifications: the inbox, email and the digest

Every signed-in person has an inbox (`/inbox`, the tray in the account
menu, with an unread badge on the menu button) fed by what happens in the
projects they belong to, and settings (`/settings/notifications`) for what
also reaches their email. Code: `src/lib/server/notifications.ts` (fan-out,
inbox, digest), `src/lib/utils/notificationPolicy.ts` (the pure rules, with
tests), `src/lib/val/NotificationSchema.ts` (kinds, settings),
`notifications.remote.ts` (mark read, save settings).

## What is sent, and to whom

| kind                  | who hears                                                 | priority |
| --------------------- | --------------------------------------------------------- | -------- |
| `storage-limit`       | the account's owners and admins, at 80 %, 95 % and 100 %  | high     |
| `seats-full`          | the account's owners and admins, when the last seat fills | high     |
| `invitation-accepted` | whoever sent the invitation                               | normal   |
| `comment`             | everyone on the song's project but the author             | normal   |
| `stems`               | everyone on the project but the uploader                  | normal   |
| `song`                | everyone on the project but the creator                   | normal   |
| `demo`                | everyone on the project but the uploader                  | normal   |

"Everyone on the project" is `projectAudience`: the account's owners and
admins, its members (unless the project is restricted and they were not
added), and the project's own people, viewers included (docs/auth.md). The
events fire after the response (`background`) from `createComment`, the
stem and demo `ready` routes, `createSong`, the two invitation
acceptances (the remote form and the sign-up hook) and, for the warnings,
after every upload reservation (`checkStorage`) and every join
(`checkSeats`). A warning for a threshold is not repeated within a week
(`warnedRecently`). Stems, demos and comments on one song within half an
hour fold into one unread item with a `count` (`coalesce`).

## Email

`emailDelivery(kind, prefs)` decides: the high kinds and an accepted
invitation are emailed at once whatever the settings; the four opt-in
kinds email only when the matching setting is on, at once (`digest`
"none") or in the person's daily or weekly digest. A folded item that was
already emailed is not emailed again. Templates: `sendNotificationEmail`
and `sendDigestEmail` in `email.ts`; both point at the settings page.

The digest: `sendDigests` runs from `GET /api/notifications/digest`, a
Vercel cron once a day (vercel.json, 13:00 UTC). It is safe to call at any
time by anyone: a person's digest goes only when `digestDue` says a day
(with an hour's slack) or a week has passed since `digest_sent_at`, and
only the not-yet-emailed opt-in items go in it.

## Text messages

`notification_preference` carries `sms_number` and `sms_enabled`, and
`deliverSms` is called for every high-priority item with the person's
settings. It does nothing yet; a provider goes there and nowhere else.

## Data

`notification` (one row per recipient: kind, priority, title, body, href,
`subject_id` + `count` for folding, `read_at`, `emailed_at`) and
`notification_preference` (the opt-ins, the digest mode, `digest_sent_at`,
the SMS hook), migration 0060; both go with the user, and an account's
notifications with the account (`cascade.ts`). The root layout counts the
unread rows on every request for the badge.
