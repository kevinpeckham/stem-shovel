/** "My Song (v2)" → "my-song-v2". Used for Blob pathnames and /songs/[slug]. */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** "stems/<slug>/<file>" — the Blob pathname layout for one song's stems. */
export const STEM_PREFIX = "stems/";

export function stemPathname(slug: string, filename: string): string {
	// Keep the basename only; the browser may hand us a path on some platforms.
	const base = filename.split(/[/\\]/).pop() ?? filename;
	return `${STEM_PREFIX}${slug}/${base}`;
}

/** Audio types a stem upload may declare. Matches what browsers report for File.type. */
export const STEM_CONTENT_TYPES = [
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
	"audio/vnd.wave",
	"audio/flac",
	"audio/x-flac",
	"audio/mpeg",
	"audio/mp3",
	"audio/ogg",
	"audio/opus",
	"audio/aac",
	"audio/mp4",
	"audio/x-m4a",
	"audio/aiff",
	"audio/x-aiff",
	"audio/webm",
];

/** Per-stem size cap for browser uploads (multipart), in bytes. */
export const STEM_MAX_BYTES = 500 * 1024 * 1024;
