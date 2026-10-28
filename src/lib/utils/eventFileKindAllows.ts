import {
	EVENT_PHOTO_FILE_KINDS,
	EVENT_POSTER_FILE_KINDS,
	type EventFileKind,
} from "#lib/constants/eventFiles.js";
import type { FileKind } from "#lib/constants/fileFormats.js";

/** Whether a file of this kind (by its extension) may be an event file of `kind`: a poster a PDF or an image, a photo an image. */
export function eventFileKindAllows(kind: EventFileKind, fileKind: FileKind): boolean {
	const allowed: readonly FileKind[] =
		kind === "poster" ? EVENT_POSTER_FILE_KINDS : EVENT_PHOTO_FILE_KINDS;
	return allowed.includes(fileKind);
}
