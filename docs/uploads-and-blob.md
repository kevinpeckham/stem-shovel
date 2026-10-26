# Uploads and Vercel Blob

Stems go browser → Blob directly (files can exceed Vercel's request limit),
in three steps driven by `src/lib/upload.ts`:

1. `POST /api/stems` reserves a `stem` row in `uploading` state and returns
   the pathname to upload to. Format is validated by extension (WAV, FLAC,
   MP3, M4A, AAC — the ones every browser's `decodeAudioData` handles), size
   against `STEM_MAX_BYTES`, count against the per-song cap.
2. `upload()` from `@vercel/blob/client` sends the bytes; `/api/upload`
   (`handleUpload()`) issues a token only for a reserved pathname and only
   for the reserved content type.
3. The browser decodes the file and `POST`s duration, channels, peaks and the file's own sample rate (from its header, `utils/audioSampleRate.ts`; docs/multitrack-recorder.md "Sample rates") to
   `/api/stems/[id]/ready`, which marks the row ready and refreshes the
   song's duration. `onUploadCompleted` is a production-only backstop (Blob
   cannot reach localhost).

- **Two stores** (`src/lib/server/blob.ts`). Public songs' files live in the
  public store and are fetched by their URLs; the files of a private song
  (its own flag or its project's, docs/auth.md) live in a **private store**
  (`BLOB_PRIVATE_READ_WRITE_TOKEN`), whose URLs answer 403 unless
  presigned. The URL's host says which store a file is in
  (`src/lib/utils/blobAccess.ts`), so no column records it. Pages hand the
  browser `presentUrl()` results: the URL itself for public files, a
  presigned GET URL (12 h) for private ones — `manifestFor` and
  `presentSongFiles` on the song page, the playlist's mix URLs on the
  project page. The server reads either store with `readBlob()` (an
  authenticated `get`, CDN bypassed, for private files) when transcoding,
  mixing or moving. Uploads: the reservation answers with `access`, the
  browser uploads with it, and `/api/upload` picks the store's token from
  the song named in the pathname. Renditions and mixes land in the store
  of the source they came from. Changing a song's or project's privacy
  moves every file in the background (`src/lib/server/relocate.ts`): each
  is streamed into the other store under a freshly stamped pathname
  (`stem.m<stamp>.wav`; the CDN remembers a deleted pathname as gone for a
  while), confirmed readable through the CDN, then the old copy is deleted
  and the row updated. A page open during the move may hold URLs that are
  about to disappear; a reload fixes it. A public copy can be served from
  the edge cache for a short time after it is deleted.
- **Pathnames are ID-based**: `accounts/<id>/songs/<id>/<stemId>.<ext>`, so
  renames never move files. "Upload new version" (`/api/stems/[id]/replace`)
  keeps the row and label but reserves `<stemId>-vN.<ext>` and deletes the
  old blob: Blob serves files with a 30-day cache header, so a replacement
  needs a new URL.
- **Playback renditions** (`src/lib/server/transcode.ts`). After step 3 the
  server renders an AAC-LC M4A of the source (192 kbps stereo, 128 kbps mono
  — the browser reports channels after its dual-mono collapse) with the
  `ffmpeg-static` binary and stores it at `<stemId>[-vN].play-<stamp>.m4a`.
  About a tenth of the WAV, so a tenth of the download, decode time and
  Blob egress per listen; the source stays for downloads. The render runs
  after the response (`waitUntil` through Vercel's request context; the
  route sets `maxDuration: 300`) and the song page schedules any stem still
  without one (never tried, failed over an hour ago, or "pending" for more
  than 15 minutes), so uploads that predate renditions get them on first
  view. `claimPlayback` is the lock. The manifest points at the rendition
  once `playbackStatus` is "ready"; deleting or replacing a stem removes it.
  Vercel's tracer has a special case for `ffmpeg-static`, and `bun install`
  needs it in `trustedDependencies` for its postinstall download.
- **MP3 mixdowns** (`src/lib/server/mix.ts`, `GET /api/songs/[id]/mix`).
  "Download MP3" renders a stereo 48 kHz 192 kbps MP3 with ffmpeg from the
  playback renditions (sources if a rendition is missing): each input forced
  to stereo and scaled by its gain, summed without amix's attenuation, then
  master and a limiter. **Original** is every stem at unity; it is rendered
  once per set of stem files and cached in Blob (`song.mixUrl`, keyed by
  `song.mixKey`; a new, replaced or removed stem changes the key). **Custom**
  sends what the player has audible (`engine.mix()`: mute, solo and faders
  folded into per-stem gains, plus master) as `?stems=id:gain,…&master=m`
  and is rendered on demand, never cached. Public like the rest of a song;
  the route has `maxDuration: 300`.
- **The original mix (the song's default mix: every stem at its saved `gain`, so a saved default re-renders it — the key includes the gains) is kept current, not just cached on demand**
  (`ensureOriginalMix`): after a stem's rendition completes, after a stem
  is removed, and from the project and song page loads as a backstop, the
  song's mix is re-rendered when its key no longer matches — once every
  ready stem has a rendition (or gave up on one). `song.mixStartedAt` is the
  lock (stale after 15 minutes). A multi-file upload re-renders the mix as
  each stem lands; a few seconds of ffmpeg each, accepted for simplicity.
  The project page plays these mixes as a playlist (`ProjectPlayer.svelte`,
  a plain `<audio>` element streaming from Blob).
- **Attachments: files attached to a project, and optionally to one of its
  songs** (table `song_pdf`, 2026-10-05 as PDFs for Kevin's charts and
  notation, generalised on 2026-10-06 to files of several kinds, and the
  same day given a `project_id` with `song_id` made nullable, so a file can
  belong to the project alone; the table keeps its first name, since a
  rename would have meant a drizzle prompt and a data copy for nothing, and
  the code calls it `songFile`, `song.files`, `project.files`). Each row has a `kind`
  (`constants/fileFormats.ts`: `pdf`, `image` for png/jpg/jpeg/webp/gif,
  `audio` for mp3/wav/m4a/aac/ogg/flac/aiff/aif, `text` for txt/md/markdown,
  `midi` for mid/midi, `other` for the rest), decided by the filename's
  extension (`fileKindOf`; rows from before the change are PDFs by the
  column's default), which sets the ceiling (`FILE_MAX_BYTES`: PDF 25 MB,
  image 15 MB, audio 60 MB, text and MIDI 2 MB, other 25 MB; forty files a
  song, `MAX_FILES_PER_SONG`; two hundred of the project's own,
  `MAX_FILES_PER_PROJECT`). The demo's lifecycle: `POST /api/files`
  (`{ songId, filename, sizeBytes, notation? }` for a song's file, or
  `{ projectId, filename, sizeBytes }` for a project-level one, `notation`
  ignored there) reserves the row (the kind's ceiling, the song's or the
  project's cap, the account's storage room) at
  `accounts/<a>/songs/<s>/files/<id>.<ext>` (`filePathname`; the rows
  from before live under `/pdfs/`) or `accounts/<a>/projects/<p>/files/<id>.<ext>`
  (`projectFilePathname`; `isFilePathname` knows all three, and
  `accessOfPathname` picks the store by the song's privacy or, under
  `projects/`, the project's) and
  answers `{ fileId, pathname, access, kind }`; the browser uploads under
  the type its name says (`FILE_CONTENT_TYPE_OF`; `/api/upload`'s
  attachment branch allows the usual labels for these kinds plus
  `application/octet-stream`, `FILE_CONTENT_TYPES`, and caps by the
  reserved row's kind), rendering a PDF's first page meanwhile with pdf.js
  (`utils/pdfThumbnail.ts`, pdfjs-dist and its worker imported on first
  use, a 400 px WebP); `POST /api/files/[id]/ready` (multipart: the URL,
  an optional page count, an optional image) reads the file's first bytes
  from the store and checks them against the kind
  (`utils/fileSignatures.ts`: `%PDF-`; PNG, JPEG, WebP or GIF; an MP3,
  WAV, M4A, AAC, OGG, FLAC or AIFF header; `MThd`; UTF-8 without a NUL
  byte for text; nothing beyond its size for `other`), removing row and
  file otherwise (a 415), checks the image's bytes the same way (WebP or
  PNG, under 400 KB) and stores it at `<id>.thumb-<stamp>.webp` beside
  the file, then marks the row ready; an image with no thumbnail is fine,
  the page shows the image itself. Each row carries a `share_code`
  (nanoid 16) behind `/f/<code>`, which 302s to the file where it is now,
  presigned for a private song, so the link is permanent across renames
  and privacy moves (`relocate.ts` moves attachments and thumbnails with
  the rest, a project's own files when the project's privacy changes);
  `/f/<code>?download=1` streams it instead (`readBlob`) as an
  attachment under its original name and the type its name says
  (`utils/attachmentDisposition.ts`), since the store's own `?download=1`
  names the file by its id and a cross-origin `download` attribute is
  ignored; `?download=pdf` is the same stream for a PDF and a 404 for
  the other kinds. On the song page (2026-10-06, Kevin) the attachments
  are the Docs panel's fifth tab (`SongFilesPanel.svelte`): small tiles
  with a ⋯ menu and a Share menu (copy link, `mailto:`), Upload at the
  foot and in the panel's ⋯ menu; a tile opens the file in a
  `FloatingPanel` viewer (an iframe of the store's URL, so the CSP's
  `frame-src` allows both stores; Download first in its header). The Docs
  panel is a `FloatingPanel` too: docked, floating from lg, or minimized
  to the action row's Docs button (`docsMode`, `stemshovel.song.docs-mode`),
  its tabs and ⋯ menu (a `ContextMenu`, so nothing is clipped by the
  panel's overflow) in the header; the player spans both columns while
  the panel is away. The player (stems or demos, their tabs in the
  header) is a `FloatingPanel` the same way (`playerMode`,
  `stemshovel.song.player-mode`, the Player button beside Docs), with
  `keep` so a minimized player stays mounted, hidden: decoded stems and
  playback survive, and the button lights while it plays; the Docs panel
  spans both columns while the player is away. Lyrics is the Docs
  panel's first and default tab (Kevin).
  Title and description are edited through `files.remote.ts`
  (`updateFile`), and so is `is_notation` (2026-10-06): a PDF or an image
  that is a score, flagged at the reservation (`notation: true` in
  `POST /api/files`'s body; ignored for the other kinds) or later
  (`isNotation` in `updateFile`), which the Chart tab's notation view
  lists beside the notation files; the Attachments panel keeps it too.
  **Use as demo** (`useAsDemo({ id })`, audio kind only): a new `demo`
  row of the song, labeled from the filename, the file copied in Blob
  to the demo's pathname in the song's store (`createDemoFromFile`, the
  shape of adding a recording to a song), ready at once with its MP3
  rendition scheduled (`scheduleDemoPlayback`) and the project told, as
  after a demo upload; the attachment stays; the demos cap applies.
  Removal (`deleteFile`) and the song and project cascades delete file
  and thumbnail (a song's cascade takes its own files, a project's takes
  every file of the project, its songs' and its own); sizes count toward
  the account's storage.
  **The project library** (2026-10-06, Kevin): the project page lists
  every ready file of the project, song-level and project-level, newest
  first (`listProjectFiles`, each with its `song: { id, title, slug }` or
  null, the page's `files`), and every ready score of its songs with the
  state of its rendered PDF (`listProjectScores`, the page's `scores`),
  minus those of songs the viewer may not see. **Attach**
  (`attachFile({ id, songId })` in `files.remote.ts`, `songId` null for
  the project level) moves a file to a song of the same project or back
  to the project level: only the row changes (the blob stays where it is;
  pathnames are ID-based and the share code is the address), the target's
  cap applies, and a file leaving a song stops being a score
  (`is_notation` cleared). An editor of the account; on a restricted
  project, one added to it. A project-level audio file cannot be a demo
  (no song to be one of) until it is attached.
- **Documentation downloads** (2026-10-06, Kevin;
  `src/lib/server/documentation.ts`): a song's lyrics, chart and notes as
  one PDF, `GET /api/songs/[id]/documentation.pdf` (a title page with the
  song, project and version, then a page or more per section that has
  text, headed "Lyrics", "Chart", "Notes"; an attachment named
  `<song title>.pdf`); every song's PDF in one zip,
  `GET /api/projects/[id]/documentation.zip` (`<project> documentation.zip`,
  one `<song title>.pdf` per song with any text, duplicate titles
  numbered); and the project's charts,
  `GET /api/projects/[id]/charts.zip` (`<project> charts.zip`: a folder
  per song holding each score's MusicXML file and, once the jobs function
  engraved it, its PDF as `<title>.pdf`, each attachment marked as notation
  under its own filename, and the chart text as `<song>-chart.txt` and
  `<song>-chart.pdf`). The markdown is drawn by `utils/markdownToPdf.ts`
  from marked's lexer tokens into an open pdfkit document with the
  built-in fonts (Helvetica; Courier for code blocks and spans, so a chord
  grid stays lined up; headings by depth, lists, quotes, rules, tables as
  text), pages breaking as pdfkit sees fit; titles become filenames
  through `utils/safeFilename.ts`; fflate's `zipSync` builds the zips
  (stored for PDFs, images and `.mxl`, deflated for text). Everything is
  built in the request (`maxDuration` 120, their own Vercel function: the
  three routes share one, and pdfkit lives there and in the jobs
  function, never in a page function) and nothing is stored. Who may
  download is who may view the song or the project (docs/security.md,
  "Downloads"); a song or project with nothing to put in is a 404.
- **Mentions** (2026-10-06): in a song's documents (chart, lyrics, notes,
  and a person's private note), `@` followed by the title of an
  attachment or a notation file, or the label of a demo, is a link when
  the document is shown: `<a class="mention" href="/f/<code>">@Title</a>`
  (a demo links to `#demo-<id>` on the page). `utils/linkMentions.ts`
  runs over the rendered, sanitized HTML in the song page's load
  (`+page.server.ts`) and in `saveDoc`'s answer (so a freshly saved
  document links without a reload), with the targets from
  `utils/mentionTargets.ts` (ready files and notation by title or
  filename, demos by label). It touches text only (never a tag, an
  attribute or the inside of an existing `<a>`), matches labels
  literally and case-insensitively, longest first, only where the label
  ends at the end of the text, whitespace or punctuation, and only where
  the `@` is not glued to a word (an e-mail address stays as it is); the
  anchor is the only HTML it adds, its href and text escaped. The
  markdown is untouched: a rename of the file changes what the mention
  points at next time the page loads.
- **Notation files attached to a song** (`song_notation`, 2026-10-06,
  Kevin: MusicXML scores for the band, compressed `.mxl` or plain
  `.musicxml`/`.xml`). The attachment's lifecycle with its own names:
  `POST /api/notation` reserves the row (a name `notationFormatOf` knows,
  a size under `NOTATION_MAX_BYTES` (10 MB), the song's cap of
  `MAX_NOTATION_PER_SONG`, the account's storage room) at
  `accounts/<a>/songs/<s>/notation/<id>.<ext>` with the extension as
  uploaded, lower-cased, and a `format` column (`mxl` | `musicxml`) the
  extension decided; the browser uploads through `/api/upload`'s notation
  branch, which allows the MusicXML types and the generic ones browsers
  label such files with (`NOTATION_CONTENT_TYPES`: XML, zip, octet-stream),
  since the bytes are what count. `POST /api/notation/[id]/ready`
  (multipart: the URL, an optional page count and first-page image) reads
  the first 4 KB from the store and insists on a zip header (`PK\x03\x04`)
  for `.mxl` or, for the rest, an XML prologue naming `score-partwise` or
  `score-timewise` (`startsLikeZip`, `startsLikeMusicXml` in
  `utils/fileSignatures.ts`) — a sniff of the bytes, never an XML parse on
  the server — removing row and file otherwise, then checks and stores the
  thumbnail at `<id>.thumb-<stamp>.webp` beside the file as an attachment's. The
  browser does all the rendering: Verovio in a worker draws the score on
  the song page and renders the thumbnail at upload (`uploadNotationFile`
  in `src/lib/upload.ts` takes the thumbnail from an optional callback).
  The same `share_code` behind `/f/<code>`, which looks an attachment up first and
  a notation file second; `?download=1` streams it under its original name
  as `application/vnd.recordare.musicxml` (`.mxl`) or
  `application/vnd.recordare.musicxml+xml`. Title and description through
  `notation.remote.ts`; `relocate.ts`, the song and project cascades and
  the storage sum treat the rows exactly as attachments.
  **The score as a PDF** (2026-10-06): once the row is ready, the ready
  route sets `pdf_status` to `pending` and posts a `notation-pdf` job
  (`scheduleNotationPdf` in `jobs.ts`; the payload is
  `{ kind: "notation-pdf", ids: [<notationId>] }`), and the jobs function
  runs `renderNotationPdf` (`src/lib/server/notationPdf.ts`): the same
  Verovio engine as the browser's, in Node, lays the file out for A4 at
  full engraving scale (`utils/engraveNotationPages.ts`, fixed pages;
  `engraveNotation.ts` is the screen's one tall page) and
  `utils/svgPagesToPdf.ts` writes every page's SVG into one A4 PDF with
  pdfkit and svg-to-pdfkit, text in pdfkit's built-in Times and Helvetica
  (no font files ship with the function; the music glyphs are paths). The
  PDF lands at `<id>.pdf` beside the file, in the store the song's privacy
  calls for (`notationPdfPathname`; unstamped, since the file never
  changes under its id), and the row gets `pdf_url`, `pdf_pathname` and
  `pdf_status` `ready`, or `failed` with the error logged. Only the jobs
  function imports `notationPdf.ts`: the 7 MB engine stays out of the
  page functions. `/f/<code>?download=pdf` streams the PDF as an
  attachment named after the file (`<name>.pdf`), a 404 until it is
  ready; for a `song_pdf` code the same switch streams the PDF itself.
  `relocate.ts`, removal and the cascades move or delete the PDF with the
  file and thumbnail; like the thumbnails, a derived file, it is not
  counted toward the account's storage.
- **MIDI files per stem** (`…/midi/<stemId>-<stamp>.mid`, columns
  `stem.midi_*`): "Upload MIDI" in the row menu reserves the pathname on
  the stem (`/api/stems/[id]/midi`), the browser uploads through the same
  `/api/upload` token handler (`/midi/` in the pathname picks the branch,
  `audio/midi`, a 5 MB cap) and reports the URL to `/api/stems/[id]/midi/ready`,
  which swaps in the new file and deletes the previous one. A "midi" chip
  beside the stem name marks stems that have one; "Download MIDI" and
  "Remove MIDI" sit in the row menu. Deleting the stem or song deletes the
  file. MIDI is not part of "Download Stems" or the mixes.
- **Demo recordings** use the same three steps with `/api/demos` and
  `/api/demos/[id]/ready` (`uploadDemoFile` in `src/lib/upload.ts`), minus
  the decode: the browser only reports the blob URL. `/api/upload` tells the
  two apart by the `/demos/` segment of the reserved pathname. They accept a
  broader format list (`DEMO_FORMATS`: AIFF, OGG/Opus, CAF, WebM, AMR, 3GP,
  MP4 on top of the stem formats) because the server converts every demo to
  a 192 kbps MP3 (`transcodeDemo`, `demo.playback*` columns, same claim and
  retry rules as stem renditions) — browsers cannot all play what phones
  produce, Voice Memos' lossless ALAC `.m4a` for one. The page plays and
  downloads the MP3 once it exists and the original until then; the
  original stays in Blob. Uploaded from the Uploads menu or song settings,
  removed from song settings; played and downloaded from the demos view
  of the song page's player box (`DemoPanel.svelte`: a Stems / Demos
  toggle above the box, demos first when a song has demos but no stems).
- **Content type on upload comes from the extension**, not the browser's
  guess: the reservation allows exactly `stemContentType(name)` /
  `demoContentType(name)`, and macOS reports a Voice Memo as
  `audio/x-m4a`, which the token would refuse.
- **Downloads** fetch the Blob file in the browser and save it under its
  original name (`download` is ignored cross-origin; Blob's `?download=1`
  names the file by pathname). "Download All" builds a stored zip with
  `client-zip`. Nothing goes through the server.
- The store is public with open CORS, which the engine relies on.
- `bun run smoke:blob [kick,hats,bass,keys]` creates a smoke project + song
  through the remote forms and uploads the generated WAVs through this exact
  flow against the dev server, as the Screenshot Bot (through varlock for
  `PREVIEW_AUTH_TOKEN`; the cookie rides on every request, the Blob client's
  token call included) in the bot's account (`SMOKE_ACCOUNT`, mmkk by
  default), on `SMOKE_BASE` (127.0.0.1:5173 by default: `localhost` can
  resolve to ::1, which the server does not listen on). SvelteKit 3 names
  a remote form's inputs `field/<form id>`, and the script posts them so.
  Delete the `smoke-*` project afterwards, through the app.

## Retries (2026-10-12)

Kevin's batch of 32 stems lost its first five in a row to
`net::ERR_SSL_BAD_RECORD_MAC_ALERT` on `vercel.com/api/blob/mpu`, the
multipart-create call, before a byte had moved; the Blob client made a
few attempts of its own and gave up, the app none, and the rest of the
batch went through once the connection had settled. Three layers now:

- `uploadStemFile` (`src/lib/upload.ts`) wraps the transfer and the
  ready call in `withRetries` (`src/lib/utils/withRetries.ts`): three
  attempts, a second and then three seconds apart, only for a failure
  with no HTTP answer behind it (`looksLikeNetwork`: fetch's TypeError,
  or wording about the network, TLS, a reset or a timeout); an answer
  (a 4xx, a refused type) is thrown at once. The reservation allows an
  overwrite, so a partial blob from the attempt before is replaced.
- `StemUploader` keeps each job's reservation (`onReserved`) and, once
  the batch is through, runs the jobs that failed for a network reason
  once more, unasked, to the same stems.
- What still fails shows **Retry failed** under the upload list on the
  song page (`retryFailed()`, exported from the uploader): one press,
  the files the browser still holds, the same reservations, so no row is
  left behind. After a reload the files are gone, and the "Stems not
  ready" tiles with their upload link remain the way back.

## Sessions (2026-10-18)

The band's practice and show recordings (Kevin: an area for members to
upload practice recordings and others to browse and download; shows too,
tagged by kind; then sessions as the unit: a session is the practice or
the show, made of its recordings, named or called after its place and
day, assignable, with a playlist and a zip of the MP3s). Two tables,
`recording_session` and `session_recording` (docs/data-model.md), under
the account alone: a session covers many songs.

**Upload.** `POST /api/sessions` reserves a recording's row (a member of
the account; `demoContentType` says the type, `SESSION_MAX_BYTES` of 2 GB
the ceiling, the storage room is checked) in a session: the one the body
names, or else the account's session of the file's own day (the
browser sends `recordedOn` from `file.lastModified`, the recorder's
clock) with the same kind, or of the day before (a show past midnight),
or a new session of that day named by its place
(`createSessionRecording`). The browser uploads to
`accounts/<a>/sessions/<id>.<ext>` through `/api/upload` (the token
allows the reserved type and size), and `POST /api/sessions/<id>/ready`
reads the file's first bytes and keeps the row only if they are audio,
then schedules the MP3 (`scheduleSessionPlayback`, the demo's transcode
with `SESSION_TARGET`) and tells the account's members
(`notifySessionRecording`, kind `session`, coalesced per session, the
demo opt-in for email). The completion webhook's backstop is
`recordSessionUrl`.

**The page** (`/[account]/sessions`, members only,
`listRecordingSessions`): a toolbar under the page copy (Kevin,
2026-10-26) with "Add a recording", which opens the upload form in a
`popover="auto"` panel (the session combo box, kind, place, input device
and name, the files; the panel hides as the upload starts so the rows
and their progress show), and "Record a session", the link to the
recorder; then sessions newest first, each with its ready
recordings in the order they were made (day, then upload). One
`SessionPlayer` (the project page's shape) holds a queue: a row's play
button or a session's Play all fills it with the session's recordings
(the MP3 once rendered, else the file as uploaded) and plays through
them. The player lives in a `FloatingPanel` (Kevin, 2026-10-26:
`stemshovel.sessions.player-panel`, `keep` so the `<audio>` element and
its EQ graph survive a minimize), hidden until a track starts, closed
to a "Player" button in the toolbar (lit while playing) and docked in
the flow below lg; the filter row runs search, kinds, count from the
left. A **loop**, as the stem player's (Kevin, 2026-10-20): a drag across
the playing recording's waveform (the review row's, or the recording's
page's) selects a stretch (`setLoop`, bound `loop`), the transport's Loop
button (L) plays it round (`timeupdate` seeks back at its end; with
nothing selected the whole recording repeats at `ended`), Escape clears
the selection and another track drops it. Download MP3s on a session fetches
`/api/recording-sessions/<id>/mp3.zip` through `downloadBuilt`: the ready
MP3s numbered in order, stored not compressed, streamed file by file
(fflate's `Zip` + `ZipPassThrough`), 404 until one is ready. A download
is named after the recording's title, slugified (`recordingDownloadName`:
the filename's stem without a title, `recording` without either), the
zip's entries `01-<slug>.mp3` and the row's menu `<slug>.mp3` and
`<slug>.<ext>` for the original (Kevin, 2026-10-19). A recording's
`source` (migration 0093; "Kevin's phone", "Room mic"; "Input name" in
the UI since 2026-10-26) and its `device` (migration 0099; one of
`SESSION_DEVICE_VALUES` in `val/SessionRecordingSchema.ts`: soundboard,
field-rig, phone, handheld, other, or "" for unset, labeled by
`constants/sessionRecordings.ts`) tell apart recordings of one
performance from several devices: chosen for the batch on the upload form
(`POST /api/sessions` takes both; `utils/sessionDeviceOf.ts` admits only
the known keys), on the Session Recorder's save, or on the recording's
edit; shown by the title as "Phone · Kevin's phone"
(`utils/recordingInputText.ts`), searched, and slugified after the title
in the download's name (`set-2-room-mic.mp3`; the device's label stands
in when the name is empty). A recording may be of one of the
account's songs (`song_id`, migration 0094, set null when the song goes):
chosen on its edit from `listAccountSongs`, checked against the account
in `updateSessionRecording`, linked from the row, and listed on the
song's page under the Demos view (`listSessionRecordingsOfSong`, members
only) with a link to `/sessions?recording=<id>`.

**Stems measured after the fact** (2026-10-20). Some stems carry no
`peaks`, `duration_seconds` or `channels` (uploaded by a path that
reported none; three of Kevin's on dev): the player drew nothing for them
and an import into Dawn laid each out one millisecond long, the schema's
floor, with nothing to draw (the bug Kevin met). The song page now
schedules `stem-metadata` for such stems (`stemsWantingMetadata`), and
`measureStemMetadata` in the jobs function fetches the file, reads the
channels from ffmpeg's probe line and the length and peaks from the PCM
pass (`measurePeaks`), and fills what the row lacked (`finishStemMetadata`,
what was there standing). The engine, for its part, runs a clip of unknown
length (one millisecond) to its source's end once the source decodes
(`#fillUnknownClips`, saved with the song, not an undo step), so an
import made before the measuring still comes right on its first open.

**The session recorder** (`/[account]/sessions/record`,
`SessionRecorder.svelte`; Kevin, 2026-10-19: a stripped-down variation
on the Idea Recorder, available from the Sessions page, with a minimal
interface, for microphone or line-in stereo recordings). One job: the
room through the microphone or the line in, in stereo, as one session
recording. The input comes from `inputSources` (the looper's and the
Idea Recorder's engine: the chosen device or the default, the voice
processors off, `channelCount` 2) attached to a context of the page's
own with a silent monitor; the source's output node feeds a
`MediaStreamDestination` that a `MediaRecorder` records (`recordingMimeType`:
compressed by default, Opus or AAC at 256 kbps, since a practice runs an
hour; lossless on request), with the engine's meter for the level; a **low
cut** (Kevin, 2026-10-20: a `BiquadFilterNode` high-pass at 60, 80 or
120 Hz, Q 0.707, between the input and the recorder, on at 80 Hz by
default and remembered per browser in `localStorage`, Off a choice)
takes the rumble out before the file is written, the meter unaffected.
Record,
Stop (a track that ends mid-take, a call, keeps what there is), then the
take plays back in an `<audio>` and a form names it (default "Practice
7:42 PM", `sessionRecordingTitle`), picks the session (today's, or one of
the account's) and the input source (the device's label), and Save
uploads it as the Sessions page does (`uploadSessionFile`; `POST
/api/sessions` now takes a `title`), then opens the Sessions page on the
recording. Nothing is kept in the browser: a take is saved or discarded
(the Idea Recorder's segments, recovery and sources stay its own). A wake
lock holds a phone's screen; the audio session is "play-and-record" while
capturing.

**The stereo fill** (Kevin, 2026-10-26: a session recorded on the iPhone
played back on the left channel only). A phone's microphone is one
channel, and on iOS the recording destination's own up-mix (channelCount
2, "speakers") left the right channel of the file silent. An
`AudioWorkletNode` now sits between the input and the destination
(`static/worklets/stereo-fill.js`, `lib/audio/stereoFill.ts`, in the
session recorder and in the Idea Recorder's Sources mode): the left
channel passes, the right is the input's right once that has carried a
non-zero sample (a stereo interface's right input has a noise floor, so
real stereo opens it in its first block) and a copy of the left until
then, so a mono input, or a two-channel one whose right is digital
silence, lands on both sides. The capture worklets (track-capture,
loop-capture) have always copied the left into a missing right
themselves. **Recordings already made** are mended at the rendition: the
MP3 step (`transcode.ts` `leftOnly`, demos, takes and session recordings)
measures the source with ffmpeg's `astats` and, when the right channel
peaks at or under −80 dBFS while the left has sound
(`utils/silentRightChannel.ts`), renders a mono MP3 (`pan=mono|c0=c0`),
which plays on both sides; the source stays as uploaded. `bun run
db:left-only` finds a stage's left-only MP3s (each fetched and measured)
and with `--apply` clears their status and posts the jobs that render
them again, to `--origin` or the production URL. From outside the site
that post is answered 429 by the firewall's bot protection (FINDINGS.md
2026-10-26); the status is cleared all the same, and the sessions page's
load schedules the render of a recording owed its MP3
(`sessionsWantingPlayback`, as a song's page does for demos and the Idea
Recorder for takes), so opening the page starts it.

**A recording's own page and its viewing links.** Each recording has a
page, `/<account>/sessions/r/<id>` (`sessionRecordingPage`): the title,
session, day, source, the waveform, a one-track `SessionPlayer` and the
downloads. The page is where a share link lands: `share_link.recording_id`
(migration 0095; `ShareLinkCreateSchema` takes exactly one of a song, a
project or a recording; `createShareLink` checks membership through
`accountOfSessionRecording`; `/s/<code>` resolves to the page), and
`canViewRecording` lets in a member of the account or a visitor holding
the recording's code, nobody else (the tapes are never public, so the
page is 404 without one). A visitor sees that one recording and nothing
else of the account's sessions. The Sessions page's row menu has "Open
its page" and "Share…" (editors: one popover with `ShareLinks` for the
recording, the links loaded for the page by `listRecordingShareLinks`);
the recording's page has Share too.
`sessions.remote.ts`: `createSession` (a second session of a day, to
move recordings into), `updateSession`, `deleteSession` (its recordings
and their files go), `updateRecording` (title, day, notes and the session,
which must start on the recording's day or the day before:
`dayFitsSession`, utils/isoDay.ts) and `deleteRecording`. The rows join
the storage sum, the account's deletion (rows and blobs) and the user's
(the uploader and creator unset).

**The playback EQ** (Kevin, 2026-10-26). The session player's EQ button
opens a panel (`SessionEqPanel.svelte`): an 80 Hz high-pass for rumble and
a low shelf (200 Hz), a mid peak (1 kHz) and a high shelf (4 kHz), each
−12..+12 dB, with Reset. On the first play (a gesture, which iOS needs)
the player makes an `AudioContext` and routes its `<audio>` element
through the graph (`lib/audio/playbackEq.ts`: a
`MediaElementAudioSourceNode`, the high-pass crossfaded in and out by two
gains so "off" is untouched, `setTargetAtTime` glides); the element
carries `crossorigin="anonymous"`, which both Blob stores allow (every
response has `access-control-allow-origin: *`, presigned private URLs
too). Each element gets one source, ever, so the `{@attach}` builds the
graph per element and tears it down with it; where
`createMediaElementSource` is missing or throws, the element plays as it
is. Through Web Audio the sound falls under iOS's ring/silent switch, so
`ensureAudio` asks `playThroughSilentSwitch()` on the same gesture as the
stem engine does (docs/audio-engine.md). The settings are remembered on
the device in `localStorage` (`utils/playbackEqStorage.ts`, clamped and
snapped to 0.5 dB on load), flat by default, and never touch the files:
the download and the zip are the renditions as rendered.

### Sessions review: waveforms, comments and a chat (2026-10-19)

Kevin: a wave visualization and comments on each recording, as the stem
player has; the same on a song's demos; the chat on the Sessions page;
and a search as the Ideas page's.

**An MP3 as uploaded is its own rendition** (Kevin, 2026-10-19): when the
source's name says `.mp3` and ffmpeg's probe agrees, `transcodeToMp3`
skips the encode and records the source's URL as the playback URL (its
waveform measured from it), so a demo or a session recording uploaded as
an MP3 is stored once and plays as it came; the earlier rendition, if
any, goes, and a later render never deletes a rendition that is the
source itself.

**Waveforms, measured on the server.** A practice recording can run an
hour; decoding it in the browser for a waveform (as the mix page does for
a mix without peaks) would cost a gigabyte of memory on a phone. So the
jobs function measures it: `transcodeToMp3` for demos and session
recordings (`measure: true` on the target) runs `measurePeaks` on the MP3
it just made, which has ffmpeg decode the file to mono 16-bit PCM at
8 kHz on its stdout and folds the stream into peaks as it comes
(`utils/pcm16Peaks.ts`: a loudest sample per tenth of a second, reduced to
`PEAK_BINS` at the end, when the length is known), so an hour costs a few
floats per frame and nothing sits decoded; `finish` stores `peaks` (JSON,
1024 values in 0..1) and `durationSeconds` on the row. The MP3 is what
plays, so the waveform matches it to the sample. A demo or recording
rendered before this shipped has an MP3 and no peaks: the song page and
the Sessions page schedule `demo-peaks` / `session-peaks` jobs for them
(`demosWantingPeaks`, `sessionsWantingPeaks`: ready MP3, null peaks, no
measuring under way or one stalled; `peaks_started_at` is the claim, as
`playback_started_at` is for the MP3), and `measureDemos` /
`measureSessions` fetch the MP3 and measure it. Migration 0092 adds the
columns to `demo` and `session_recording`.

**Comments on a recording.** `session_comment` (docs/data-model.md): a
title, a body, an optional position in seconds, the author, `edited_at`;
under the recording and the account. `sessionComments.remote.ts`:
`createSessionComment`, `updateSessionComment` (the author),
`deleteSessionComment` (the author or an owner / admin), any member of
the account posting; a position is time (`parseTime`), since a recording
has no tempo grid. `notifySessionComment` tells every member of the
account but the author (kind `comment`, coalesced per recording, the link
`/<account>/sessions?recording=<id>`, which opens that recording's
review and scrolls to it). The rows go with the recording, the session,
the account and the author (`deleteSessionReviewRows`, cascade.ts).

**The review row** (`RecordingReview.svelte`): the recording's waveform
with the playhead and a bubble at each located comment
(`CommentTimeline` over a `TimelineSource` made of the row's peaks and the
player's position; a click seeks, and seeks the player to that recording
first when another was playing; ⌘-click, Ctrl-click or right-click opens
the page's menu: Seek here, Comment here with the position filled in),
then the comments in a list, each drawn by the page's `card` snippet (the
title, who and when, the position as a Go to, Edit for the author, Delete
for the author or an admin). It says "The waveform is on its way…" over a
flat line until the peaks are measured; the page refreshes itself every
five seconds while an MP3 or a waveform is pending (ten minutes at most).
Each recording row has a comments button with the count that opens and
closes the review; the recording that plays has it open. The comment
popover is the mix page's: one, to post or edit, with a Playhead button
that reads the player when that recording is the one playing. The
`SessionPlayer` exposes `seekTo`, `currentPosition` and binds
`currentTime` and `duration` for it.

**Demos on the song page.** The same review under the current demo in
the Demos view (`DemoPanel` takes the demos' comments, the page's card and
callbacks, and shows `RecordingReview` under its transport; `show(id)`,
`seekTo`, `currentPosition`). A demo's comment is a song comment with
`demo_id` set (migration 0092; `comment.demoId`, index), as a mix's has
`mix_id`: `listComments` leaves them out of the song's stream,
`listDemoComments` lists them for the view (`songView`'s
`demoComments`), the create form carries `demoId` and the server parses
the position as time for it; `notifyComment` names the demo and links
`?demo=<id>`, which the page turns into the Demos view on that demo. The
comments go with the demo (`deleteDemo`).

**A chat per session** (docs/chat.md "Sessions"): `session_chat_message`
and `session_chat_read` mirror `chat_message` and `chat_read` under a
`recording_session`; `chat.remote.ts` takes a scope (`songId` or
`sessionId`, exactly one: `ChatScopeSchema`, checked in the function) and
`SongChat` / `ChatComposer` a `sessionId` in place of `songId`, so the
one set of components serves both. The page loads each session's summary
(`sessionChatSummaryOf`: count, unread, where this person marked it read)
for the header's Chat button with its unread dot, fetches a chat's
messages when its button is pressed (`chatSince` from 0) and keeps them
for the visit; one `FloatingPanel` shows the open session's chat.
`notifySessionChat` reaches the account's members (kind `chat`, the link
`?session=<id>&open=chat`).

**Search.** A field beside the kind filter narrows the list as you type:
a session stays when its name, place, notes, kind or day match, or when
any of its recordings does (title, filename, notes, uploader, day, or a
comment's title or body); a session found through a recording shows only
the recordings that matched. Nothing leaves the page: the data is the
load's.

Browser spec `tests/e2e/sessions-review.spec.ts`; `pcm16Peaks` and
`RecordingReview` have unit and component tests, the remote functions
authorization tests (`sessionComments.remote.test.ts`, the session cases
in `chat.remote.test.ts` and the demo case in `comments.remote.test.ts`).
