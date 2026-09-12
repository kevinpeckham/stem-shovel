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
- **Downloads** fetch the Blob file in the browser and save it under its
  original name (`download` is ignored cross-origin; Blob's `?download=1`
  names the file by pathname). "Download All" builds a stored zip with
  `client-zip`. Nothing goes through the server.
- The store is public with open CORS, which the engine relies on.
- `bun run smoke:blob [kick,hats,bass,keys]` creates a smoke project + song
  through the remote forms and uploads the generated WAVs through this exact
  flow against the dev server; delete the `smoke-*` project afterwards.
