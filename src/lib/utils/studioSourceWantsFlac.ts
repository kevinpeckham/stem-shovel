import { WAV_CONTENT_TYPES } from "#lib/constants/wavContentTypes.js";

/**
 * Whether a Studio source is still the WAV it was uploaded as, and so due
 * for its FLAC rendition in the jobs function (docs/multitrack-recorder.md,
 * "Scale and structure"): the Studio's own takes say codec "pcm", an import
 * says so in its content type or its extension. `name` is the pathname or
 * the filename; one ending in .flac has been converted already.
 */
export function studioSourceWantsFlac(s: {
	codec: string | null;
	contentType?: string | null;
	name: string;
}): boolean {
	if (/\.flac$/i.test(s.name) || s.codec === "flac") return false;
	return (
		s.codec === "pcm" ||
		WAV_CONTENT_TYPES.includes((s.contentType ?? "").toLowerCase()) ||
		/\.wav$/i.test(s.name)
	);
}
