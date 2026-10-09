# Song chat

Planned and built 2026-10-09 at Kevin's request ("Let's work on the
per-song chat"): a running conversation on each song page for the people
on the project, beside the comments rather than in place of them.

## What it is

A **Chat** panel of its own on the song page, closed until the chat
button in the header (beside Share) opens it, so the chat and the docs
can be read side by side (Kevin). The button carries a dot while there
are messages the person has not seen. The panel floats from lg and is
a block under the Docs panel on narrower screens, like the others; its
place and size are remembered (`stemshovel.song.chat-panel`). Messages
are short, untitled and in time order, newest at the bottom, with a
composer under them. Anyone who may comment on the song (the account's
members and the project's own people, viewers included) sees the chat
and may write in it; a visitor with a share link or on a public song does
not see the tab at all. Comments stay what they are: titled notes, often
pinned to a spot in the song, visible to anyone who can view it.

### Messages

- Plain text, up to 2000 characters, line breaks kept. No markdown: the
  text is shown as typed, with two kinds of thing made live by
  `utils/chatTokens.ts`: a URL becomes a link (new tab, `rel="noopener"`),
  and a position written as time (`1:23`, `0:45.5`) becomes a button that
  seeks the player there. Nothing is rendered as HTML, so nothing needs
  sanitising.
- Enter sends; Shift+Enter starts a new line. The composer clears on a
  successful send and keeps the text on an error (the page notifies).
- The author may edit or delete their own message (an "edited" mark
  follows an edit; no revision history). Account owners and admins may
  delete anyone's. A deleted message is gone, not tombstoned.
- `utils/groupChat.ts` lays the list out: a date line when the day
  changes, and messages by the same author within five minutes of each
  other share one name-and-time header.

### Read state and the button

- `chat_read` keeps, per person and song, when they last looked at the
  chat. The page marks it when the tab is shown with messages in view
  (and again as new ones arrive while it is shown), through the
  `markChatRead` command.
- The header's chat button carries a small dot (and "n new" in its
  label) while there are messages newer than the person's read mark; the
  list draws a "New" line above the first unread one.

### Keeping up

While the panel is open and the page is visible, the component polls the
`chatSince(songId, after)` query every ten seconds for messages newer
than the latest it holds (edits and deletions of existing messages come
with it: the query returns every message changed since `after`, by
`updated_at`, plus the ids deleted are not tracked, so a deletion by
someone else shows on the next page load). Polling stops when the panel is
closed or the document is not visible, and resumes on return.

### Notifications

A message raises a `chat` notification for everyone on the project but
the author (`notifyChat`, after the response as `notifyComment` is),
folded per song within half an hour: "3 new messages in the chat on
<song>, the latest from <name>". Email follows the existing **comments**
opt-in (the setting now reads "Someone comments or chats on a song") and
the digest, as `docs/notifications.md` says. The item's link is the
song's permalink with `?open=chat` (the redirect keeps a query, never a
hash): the page opens the chat panel on it and drops the query from the
address (Kevin: a notification lands with the chat open).

## Data

- **chat_message** — `account_id`, `song_id`, `user_id`, `body`,
  `edited_at`, timestamps; indexes on (`song_id`, `created_at`) and
  `user_id`. Deleted with the song, the account and the user
  (`cascade.ts`).
- **chat_read** — (`user_id`, `song_id`) primary key, `read_at`. Deleted
  with the song and the user.
- Migration 0082.

## Code

- `src/lib/val/ChatSchema.ts`: send, edit, delete, read and since
  boundaries.
- `src/lib/server/data.ts`: `listChatMessages(songId, after?)`,
  `createChatMessage`, `chatMessageOwnership`, `updateChatMessage`,
  `deleteChatMessage`, `chatReadAt`, `markChatRead`.
- `src/lib/remote/chat.remote.ts`: `sendMessage`, `editMessage`,
  `deleteMessage` (forms), `markChatRead` (command), `chatSince` (query),
  guarded like `comments.remote.ts` (`memberOf` with viewers).
- `src/lib/components/SongChat.svelte`: the list, the composer, polling,
  the read mark; `onseek` for positions.
- The song page: `data.chat` (messages and the read mark, loaded only for
  someone who may comment), the header button and the panel
  (`FloatingPanel`, mounted only while open).
- User doc `scripts/user-docs/chat.md`, listed after Comments.

## Not built

Mentions, reactions, attachments in messages, a project-wide chat, and
push delivery (the poll is enough for a band page). A deletion by someone
else reaches other open pages on their next load.
