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
3. The browser decodes the file and `POST`s duration, channels and peaks to
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
  panel is a `FloatingPanel` too: docked, floating from lg, or minimised
  to the action row's Docs button (`docsMode`, `stemshovel.song.docs-mode`),
  its tabs and ⋯ menu (a `ContextMenu`, so nothing is clipped by the
  panel's overflow) in the header; the player spans both columns while
  the panel is away. The player (stems or demos, their tabs in the
  header) is a `FloatingPanel` the same way (`playerMode`,
  `stemshovel.song.player-mode`, the Player button beside Docs), with
  `keep` so a minimised player stays mounted, hidden: decoded stems and
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
  row of the song, labelled from the filename, the file copied in Blob
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
  runs over the rendered, sanitised HTML in the song page's load
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
  flow against the dev server; delete the `smoke-*` project afterwards.
