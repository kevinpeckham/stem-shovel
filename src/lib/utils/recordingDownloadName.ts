import { slugify } from "./slugify";

/**
 * The filename a session recording downloads under (docs/uploads-and-blob.md,
 * "Sessions"): its title slugified ("Battle of the Bands set 2" →
 * "battle-of-the-bands-set-2"), the filename minus its extension when there
 * is no title, "recording" when neither leaves anything; the input source
 * slugified after it ("…-room-mic"), so one performance's recordings from
 * several devices stay apart; then `ext` (the MP3's) or the file's own
 * extension.
 */
export function recordingDownloadName(
	title: string,
	filename: string,
	ext?: string,
	source = "",
): string {
	const base = slugify(title || filename.replace(/\.[^.]+$/, "")) || "recording";
	const from = slugify(source);
	const stem = from ? `${base}-${from}` : base;
	const extension = ext ?? filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
	return extension ? `${stem}.${extension}` : stem;
}
