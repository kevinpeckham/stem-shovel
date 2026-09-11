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

/** Filename minus extension, used as the default stem label. */
export function labelFromFilename(filename: string): string {
	const base = filename.split(/[/\\]/).pop() ?? filename;
	return base.replace(/\.[^.]+$/, "") || base;
}
