/** "My Song (v2)" → "my-song-v2". Used for project and song slugs. */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

/**
 * Stem formats, keyed by file extension. Validation is by extension, not the
 * browser's declared MIME type: Firefox says `audio/x-wav`, some files arrive
 * with no type at all, and the extension is what the user can actually see.
 *
 * Only formats every browser's `decodeAudioData` handles are listed; the
 * player hands the uploaded file straight to it. AIFF (no Firefox), Ogg/Opus
 * and WebM (no Safari) stay out until there is a transcoding step.
 */
const STEM_FORMATS: Record<string, string> = {
	wav: "audio/wav",
	flac: "audio/flac",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	aac: "audio/aac",
};

/** Content type for a filename, or null if the extension is not a stem format. */
export function stemContentType(filename: string): string | null {
	const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	return ext ? (STEM_FORMATS[ext] ?? null) : null;
}

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

/** Filename minus extension, used as the default stem label. */
export function labelFromFilename(filename: string): string {
	const base = filename.split(/[/\\]/).pop() ?? filename;
	return base.replace(/\.[^.]+$/, "") || base;
}

/**
 * Soft cap on stems per song. The real limit is the listener's browser: every
 * stem is decoded to PCM (~128 KB per second per channel at the 32 kHz
 * context), so a 4-minute stereo stem is ~60 MB and a phone gives out well
 * before this number. The cap just keeps a song from growing by accident.
 */
export const MAX_STEMS_PER_SONG = 32;
