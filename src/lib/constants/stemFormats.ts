/**
 * Stem formats, keyed by file extension. Validation is by extension, not the
 * browser's declared MIME type: Firefox says `audio/x-wav`, some files arrive
 * with no type at all, and the extension is what the user can actually see.
 *
 * Only formats every browser's `decodeAudioData` handles are listed; the
 * player hands the uploaded file straight to it. AIFF (no Firefox), Ogg/Opus
 * and WebM (no Safari) stay out until there is a transcoding step.
 */
export const STEM_FORMATS: Record<string, string> = {
	wav: "audio/wav",
	flac: "audio/flac",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	aac: "audio/aac",
};

/** `accept` attribute for the file input. */
export const STEM_ACCEPT = Object.keys(STEM_FORMATS)
	.map((ext) => `.${ext}`)
	.join(",");

/** Human-readable list for hints: "WAV, FLAC, MP3, M4A, AAC". */
export const STEM_FORMAT_LIST = Object.keys(STEM_FORMATS)
	.map((ext) => ext.toUpperCase())
	.join(", ");

/** Per-stem size cap for browser uploads (multipart), in bytes. */
export const STEM_MAX_BYTES = 500 * 1024 * 1024;

/**
 * A sanity ceiling on stems per song, not a limit a band should meet (Kevin
 * lifted the cap of 32 on 2026-10-12): it bounds the reorder schema and
 * stops a runaway upload. The real limit is the listener's browser: every
 * stem is decoded to PCM (~128 KB per second per channel at the 32 kHz
 * context), so a 4-minute stereo stem is ~60 MB and a phone gives out at a
 * gigabyte or so. `STEM_MEMORY_SOFT_BYTES` is where the app starts saying so
 * (docs/audio-engine.md, "Memory is the binding limit").
 */
export const MAX_STEMS_PER_SONG = 256;
/** Decoded PCM a song's stems add up to before the uploader and the player warn that phones may not manage it. */
export const STEM_MEMORY_SOFT_BYTES = 1024 ** 3;
/** The player's context rate: what the decoded size is reckoned at (engine.svelte.ts). */
export const STEM_CONTEXT_RATE = 32_000;
