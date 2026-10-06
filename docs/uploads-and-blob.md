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
- **PDFs attached to a song** (`song_pdf`, 2026-10-05, Kevin: charts and
  notation for the band). The demo's lifecycle: `POST /api/pdfs` reserves
  the row (a `.pdf` name, a size under `PDF_MAX_BYTES`, the song's cap,
  the account's storage room) at `accounts/<a>/songs/<s>/pdfs/<id>.pdf`;
  the browser uploads with `application/pdf` as the only allowed type
  (`/api/upload`'s PDF branch) while it renders the first page with
  pdf.js (`utils/pdfThumbnail.ts`, pdfjs-dist and its worker imported on
  first use, a 400 px WebP); `POST /api/pdfs/[id]/ready` (multipart: the
  URL, the page count, the image) reads the file's first bytes from the
  store and insists on `%PDF-` (`utils/fileSignatures.ts`; Replicator's
  magic-byte check, without its headless browser), removing row and file
  otherwise, checks the image's bytes the same way (WebP or PNG, under
  400 KB) and stores it at `<id>.thumb-<stamp>.webp` in the song's store,
  then marks the row ready. Each row carries a `share_code` (nanoid 16)
  behind `/f/<code>`, which 302s to the file where it is now, presigned
  for a private song, so the link is permanent across renames and
  privacy moves (`relocate.ts` moves PDFs and thumbnails with the rest);
  `/f/<code>?download=1` streams it instead (`readBlob`) as an attachment
  under its original name (`utils/attachmentDisposition.ts`), since the
  store's own `?download=1` names the file by its id and a cross-origin
  `download` attribute is ignored. On the song page (2026-10-06, Kevin)
  the PDFs are the Docs panel's fifth tab (`SongPdfPanel.svelte`): small
  tiles with a ⋯ menu and a Share menu (copy link, `mailto:`), Upload at
  the foot and in the panel's ⋯ menu; a tile opens the file in a
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
  Title and description are edited through `pdfs.remote.ts`, and so is
  `is_notation` (2026-10-06): a PDF that is a score, flagged at the
  reservation (`notation: true` in `POST /api/pdfs`'s body) or later
  (`isNotation` in `updatePdf`), which the Chart tab's notation view
  lists beside the notation files; the PDFs tab keeps it too. Removal and
  the song and project cascades delete file and thumbnail; sizes count
  toward the account's storage.
- **Notation files attached to a song** (`song_notation`, 2026-10-06,
  Kevin: MusicXML scores for the band, compressed `.mxl` or plain
  `.musicxml`/`.xml`). The PDF's lifecycle with its own names:
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
  thumbnail at `<id>.thumb-<stamp>.webp` beside the file as a PDF's. The
  browser does all the rendering: Verovio in a worker draws the score on
  the song page and renders the thumbnail at upload (`uploadNotationFile`
  in `src/lib/upload.ts` takes the thumbnail from an optional callback).
  The same `share_code` behind `/f/<code>`, which looks a PDF up first and
  a notation file second; `?download=1` streams it under its original name
  as `application/vnd.recordare.musicxml` (`.mxl`) or
  `application/vnd.recordare.musicxml+xml`. Title and description through
  `notation.remote.ts`; `relocate.ts`, the song and project cascades and
  the storage sum treat the rows exactly as PDFs.
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
