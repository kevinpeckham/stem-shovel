import { STEM_FORMATS } from "./stemFormats";

/** Demo recordings per song (phone memos, rough takes). */
export const MAX_DEMOS_PER_SONG = 12;

/**
 * Demo recordings accept whatever a phone or DAW hands over; the server
 * transcodes every demo to MP3 for playback (Chrome and Firefox cannot play
 * Voice Memos' lossless ALAC .m4a, for one), so the list is broader than
 * the stem formats, which the browser must decode itself.
 */
export const DEMO_FORMATS: Record<string, string> = {
	...STEM_FORMATS,
	aif: "audio/aiff",
	aiff: "audio/aiff",
	ogg: "audio/ogg",
	opus: "audio/ogg",
	caf: "audio/x-caf",
	webm: "audio/webm",
	amr: "audio/amr",
	"3gp": "audio/3gpp",
	mp4: "audio/mp4",
};

export const DEMO_ACCEPT = Object.keys(DEMO_FORMATS)
	.map((ext) => `.${ext}`)
	.join(",");

export const DEMO_FORMAT_LIST = Object.keys(DEMO_FORMATS)
	.map((ext) => ext.toUpperCase())
	.join(", ");
