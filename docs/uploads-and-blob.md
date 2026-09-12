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
- **Downloads** fetch the Blob file in the browser and save it under its
  original name (`download` is ignored cross-origin; Blob's `?download=1`
  names the file by pathname). "Download All" builds a stored zip with
  `client-zip`. Nothing goes through the server.
- The store is public with open CORS, which the engine relies on.
- **No auth yet**: anyone who can reach `/api/upload` can upload. Fine behind
  Tailscale, not for a public deploy.
- `bun run smoke:blob [kick,hats,bass,keys]` creates a smoke project + song
  through the remote forms and uploads the generated WAVs through this exact
  flow against the dev server; delete the `smoke-*` project afterwards.
