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
  seeks the player there; an `@Name` of someone the message mentions
  stands out ("Mentions"). Nothing is rendered as HTML, so nothing needs
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
- Marking the chat read also marks the person's unread `chat` and
  `mention` notifications on it read (`markSubjectRead`, by the
  notification's subject: the song id, or `session:<id>`), so the inbox
  and the dashboard's Latest stop counting a chat they have already seen
  (v0.186.0).

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
- `src/lib/server/data.ts`: `listChatMessages(songId, after?, viewerId?)`,
  `createChatMessage`, `chatMessageOwnership`, `updateChatMessage`,
  `deleteChatMessage`, `chatReadAt`, `markChatRead`, `toggleChatReaction`,
  `chatAudience` ("Mentions", "Reactions").
- `src/lib/remote/chat.remote.ts`: `sendMessage`, `editMessage`,
  `deleteMessage` (forms), `markChatRead` and `reactToMessage` (commands),
  `chatSince` and `chatPeople` (queries),
  guarded like `comments.remote.ts` (`memberOf` with viewers).
- `src/lib/components/SongChat.svelte`: the list, the composer, polling,
  the read mark; `onseek` for positions.
- The song page: `data.chat` (messages and the read mark, loaded only for
  someone who may comment), the header button and the panel
  (`FloatingPanel`, mounted only while open).
- User doc `scripts/user-docs/chat.md`, listed after Comments.

## The project page

A song's tile counts its messages in the meta line, and a badge beside
the tile shows how many messages by others the viewer has not seen; the
badge links to the song with `?open=chat`, so the chat panel is up on
arrival. `chatSummaryOf(songIds, userId)` gathers both in two queries
for someone who may write in the chats; a visitor sees neither.

### The project's chat feed (2026-10-25)

Kevin asked on 2026-10-09 whether a project-level chat could show the
talk across songs; the answer then was not a chat of its own (a second
kind of thread competing with the songs' is where people lose track of
where a message went) but, if wanted, a read-only feed. Built at his
request: the project page carries a **Chat** button in its header (for
whoever may read the songs' chats, project viewers included, with a dot
while any song has unread messages) opening a read-only panel
(`ProjectChatFeed`): every song's messages in one stream, oldest at the
top, by day, each under its song's title, which links to that song's
chat (`?open=chat`). It has no composer, so a conversation still lives in
one place, on its song. `projectChatFeed(accountId, projectId, { before,
limit })` (src/lib/server/projectChat.ts, `projectChat.remote.ts`)
answers a page newest first, 50 at a time, and whether there is more;
"Load earlier messages" pages back from the oldest held. While the page
is visible the panel fetches the newest page every 15 seconds and folds
it in (`mergeFeed`), so new, edited and deleted messages show. The tile
badges above still count the unread per song.

## Sessions (2026-10-19)

A practice or a show has a chat of its own on the Sessions page
(docs/uploads-and-blob.md, "Sessions review"): `session_chat_message` and
`session_chat_read` mirror the song's two tables under a
`recording_session`, with the same data functions beside the song's
(`listSessionChatMessages`, `createSessionChatMessage`,
`sessionChatMessageOwnership`, `updateSessionChatMessage`,
`deleteSessionChatMessage`, `sessionChatSummaryOf`,
`markSessionChatRead`). The remote functions are the same five: the
schemas carry a scope, `songId` or `sessionId` (exactly one, `oneChatScope`,
a 400 otherwise), `sendMessage`, `markChatRead` and `chatSince` branch on
it, and `editMessage` and `deleteMessage` find the message in whichever
table holds it (`ownerOf`). Any member of the account reads and writes
(`memberOf` on `accountOfRecordingSession`). `SongChat` and `ChatComposer`
take `sessionId` in place of `songId`; the session page keeps what it
fetched per session and shows one panel at a time. `notifySessionChat`
reaches the account's members with `?session=<id>&open=chat`.

## Mentions (2026-10-25)

Typing `@` in the composer, or in a message being edited, opens a list of
the chat's people (`ChatMentionPicker`) narrowed by what follows the `@`
(the start of the name or of any word in it); ArrowUp/ArrowDown move,
Enter or Tab picks, Escape closes, a click picks too. Picking writes
`@Name ` into the text. On send or save the people picked whose `@Name`
is still in the text (`utils/mentionsIn.ts`, read the way the message
will show it) go with the message as `mentions`; the server keeps only
the ids of people in the chat's audience, each once, at most 20
(`ChatSendSchema`/`ChatEditSchema`).

- **Who may be named**: `chatAudience(accountId, { songId | sessionId })`
  in data.ts, by name: for a song, everyone who may open its project
  (`projectAudienceOf`, the same rule the notifications use); for a
  session, the account's members. The composer fetches it once, on the
  first `@`, through the `chatPeople` query.
- **Rendering**: `ChatMessageRow.mentions` is `{ id, name }[]` (names
  read in one query per list); `chatTokens(body, mentions)` makes a
  `mention` token of `@Name` for each, the longest name first and never
  run on into a longer word or inside a link; ChatText shows it in the
  accent, the reader's own on a tint. Any other `@text` stays plain.
- **Notifications**: `notifyMention(accountId, scope, id, authorId,
  mentionedIds)` raises a `mention` item for each person named, never
  folded: "<who> mentioned you in the chat on <song or session>", with the
  chat's `?open=chat` link; email follows the comments opt-in.
  `notifyChat`/`notifySessionChat` leave those people out of the folded
  chat item, so nobody hears twice. An edit tells only the people it newly
  names (`chatMessageOwnership` returns the stored `mentions`).
- **Data**: `chat_message.mentions` and `session_chat_message.mentions`
  (json `string[]`, null for none or for messages from before; migration
  0098).

## Reactions (2026-10-25)

A message carries reactions from a fixed set (`CHAT_REACTION_EMOJI`:
👍 ❤️ 😂 🔥 🎸 👀), once per person per emoji. Under the text a chip per
emoji with a count (`ChatReactions`), lit when the reader is among them,
its title the names; a tap toggles the reader's own. On hover, beside Edit
and Delete, a smiley (`ContextMenu`, a native popover, keyboard-reachable)
offers the six. Anyone who may write in the chat reacts; someone who may
not sees the chips without tapping.

- **Data**: `chat_reaction` (`scope` "song" | "session", `message_id`,
  `user_id`, `emoji`; unique per message, user and emoji), one table for
  both chats; deleted with the message (`deleteChatMessage`,
  `deleteSessionChatMessage`), the song, session, account and user
  (cascade.ts). Migration 0098.
- **Code**: `toggleChatReaction(scope, messageId, userId, emoji)` inserts
  or deletes the row and moves the message's `updated_at`, so the poll
  (`chatSince`) carries the change to other open pages, and returns the
  message as the person sees it. The `reactToMessage` command
  (`{ id, emoji }`) finds the message in whichever table holds it and
  allows whoever may read that chat. `ChatMessageRow.reactions` is
  `{ emoji, count, mine, names }[]` in the set's order
  (`utils/chatReactionSummary.ts`); `mine` needs the viewer, so
  `listChatMessages(songId, after, viewerId)` and
  `listSessionChatMessages(sessionId, after, viewerId)` take one
  (`songChat` and `chatSince` pass it).

## Not built

Attachments in messages, a project-wide chat, and
push delivery (the poll is enough for a band page). A deletion by someone
else reaches other open pages on their next load.
