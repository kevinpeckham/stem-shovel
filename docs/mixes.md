# Mixes

Planned 2026-10-09 at Kevin's request: a mixing engineer or producer
bounces the project to a stereo file, a **mix**, and sends it to the band
to listen and give feedback; after the feedback a new mix follows, and
the loop repeats. Kevin's sketch: a third view in the player beside
Stems and Demos (open to a page of its own instead); a widget sharing
some of the stem player (a waveform that comments can be left on, the
comments kept with the mix rather than in the Docs panel's stream);
upload, download, rename and share by email; and notes from the
engineer about the mix.

## Refinements to the sketch (what was built, and why)

- **In the player, not a page.** The player's view switch gains **Mixes
  (n)** after Demos. A page of its own would pull the listener away from
  the chart, lyrics, notes and chat they want open while they listen, and
  the player's box already switches between kinds of audio. What a page
  would have given, an address to send, a mix has anyway: every mix has
  a link (`?view=mixes&mix=<id>` on the song page, kept through the
  permalink and share-link redirects) that opens the player on it.
- **Mixes are versions.** Each upload takes the next number on the song
  (v1, v2, …), shown with the label, so "listen to v3" means something
  and the list reads as the history of the mix. The label itself comes
  from the filename and can be renamed. The newest mix opens by default.
- **Mix comments are comments.** A mix's feedback uses the comment
  table and forms the song already has (title, text, an optional
  position typed as time, timecode or bars against the song's grid),
  with a `mix_id` on the row. The Docs panel's Comments tab and the stems'
  Comments row show only the song's own (`mix_id` null); a mix shows only
  its own, on its own Comments row under the waveform and in a list
  under the notes. One model keeps edit history, deletion rules and
  notifications the same; the notification for a mix comment names the
  mix and links to it.
- **Notes are markdown.** The engineer's notes on a mix ("vocal up 1 dB,
  new bass take in the bridge") are a markdown field on the mix, rendered
  on the server like the song's documents, edited in place by editors.
- **Share by email is the song's share, aimed at a mix.** The share
  popover sends the mix's link; for a private song the viewing link made
  for the recipient carries the mix too (`share_link.mix_id`), so the
  email lands on the mix, not the song's top.
- **Playback is the demo pipeline.** A mix uploads like a demo (any
  audio a DAW exports, the stem size ceiling, the account's storage
  room), gets an MP3 rendition from the jobs function for streaming, and
  the browser decodes the file at upload for its length and waveform
  peaks (stored on the row, as a stem's are), so the waveform is there the
  moment the mix opens; a file the browser cannot decode (an unusual
  codec) uploads without peaks and the panel decodes the MP3 to draw
  them.
- **Name clash avoided.** The song already has a "mix": the stems summed
  for download (`mix.ts`, `song.mixUrl`, the Downloads menu). The new
  table is `song_mix`, the code says `songMix`/`mixes`, and the user sees
  "Mixes" in the player and "Download Mix" for the stems' bounce as before.
  Worth renaming that menu item ("Stems mix (WAV)") when Kevin wants.

#- **The project page prefers the mix.** A song's tile and the playlist play its newest ready mix when it has one (the mixing stage comes after the stems' arranging and recording), else the stems' bounce; the player labels the track ("Mix v4", "Stems mix") and the tile counts the mixes (`getProject` carries each song's mixes; the load presents the newest as `latestMix`).

## Not built yet, suggested next

- **Resolving feedback.** A comment on a mix could be marked addressed
  ("fixed in v4"), and a new mix could show how many of the previous
  mix's comments are still open. Cheap on this model (a flag on the
  comment) and the thing that makes the loop a loop.
- **Compare.** A/B switching between two mixes at the same position.
- **A reference mix.** Marking one mix as the current one for the song's
  page and share emails.

## What it is

The player's **Mixes** view: a list of the song's mixes, newest first,
each with its version, label, who uploaded it and when; the chosen mix
with a transport (play, pause, position, volume), its waveform with the
playhead (click to seek; ⌘-click, Ctrl-click or right-click for _Comment
here_), a Comments row of its located comments (CommentTimeline), the
engineer's notes, and the mix's comments in a list. Editors upload mixes
(the Upload Mix button, or the Uploads menu), rename, edit the notes,
remove, and share by email; anyone who can comment on the song comments
on a mix; anyone who can view the song listens and downloads (the source
file or the MP3).

## Data

- **song_mix** — `account_id`, `song_id`, `version` (1, 2, … within the
  song), `label` (the filename's, renamable), `notes` (markdown), the
  file (`status`, `url`, `pathname` at
  `accounts/<id>/songs/<id>/mixes/<mixId>.<ext>`, `filename`,
  `content_type`, `size_bytes`), what the browser learned at upload
  (`duration_seconds`, `peaks`), the MP3 rendition (`playback_*` as a
  demo's), `uploaded_by`, timestamps. Up to `MAX_MIXES_PER_SONG` (24).
  Deleted with the song and the account; the blobs go with the row.
- **comment.mix_id** — null for the song's own comments; a mix's id for
  feedback on that mix (indexed).
- **share_link.mix_id** — a viewing link made for a mix lands on it.
- Migration 0083.

## Code

- `src/lib/constants/mixFormats.ts`: the ceiling; formats are the demo
  formats.
- `src/lib/server/db/schema/songMix.ts`; `data.ts`: `createMix`,
  `findUploadingMix`, `markMixReady`, `recordMixUrl`, `deleteMix`,
  `renameMix`, `setMixNotes`, `mixesWantingPlayback`, `claimMixPlayback`
  / `finishMixPlayback` / `failMixPlayback`, `mixOwnership`,
  `listMixComments`; `presentSongFiles` and `songView` carry the mixes
  (notes rendered).
- Routes: `POST /api/mixes` (reserve), `POST /api/mixes/[id]/ready`
  (the URL, the length and the peaks); `/api/upload` issues the token
  for a `/mixes/` pathname like a demo's; the jobs function renders
  `mix-playback` MP3s (`transcode.renderMixes`).
- `src/lib/remote/mixes.remote.ts`: `renameMix`, `setMixNotes`,
  `removeMix` (commands, editors); `shareSong` takes an optional `mixId`;
  `createComment` takes an optional `mixId`.
- `src/lib/upload.ts`: `uploadMixFile` (upload, decode, report).
- `src/lib/components/MixPanel.svelte`: the view; `CommentTimeline`
  takes any source with a duration, position, peaks and `seek`.
- The song page: the Mixes view, `?view=mixes&mix=<id>`, the Upload Mix
  path, mix comments through the same popover.
- Notifications: kind `mix` (a new mix, under the demos opt-in); a comment
  on a mix names it.
- User doc `scripts/user-docs/mixes.md`.
