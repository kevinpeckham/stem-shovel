import { STEM_FORMATS } from "$lib/constants/stemFormats";

/** Content type for a filename, or null if the extension is not a stem format. */
export function stemContentType(filename: string): string | null {
	const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	return ext ? (STEM_FORMATS[ext] ?? null) : null;
}
