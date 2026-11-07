import { headOfBlob } from "#lib/server/headOfBlob.js";
import { FILE_KIND_LABELS, type FileKind } from "#lib/constants/fileFormats.js";
import {
	isPdfBytes,
	looksLikeText,
	startsLikeAudio,
	startsLikeImage,
	startsLikeMidi,
} from "#lib/utils/fileSignatures.js";

/**
 * Whether the file as stored starts the way its kind should, for the ready
 * routes of an attachment (docs/uploads-and-blob.md, "Attachments") and a
 * chat attachment (docs/chat.md, "Attachments"): a PDF with `%PDF-`, an
 * image, an audio file or a MIDI file with its own signature, a text file
 * decoding as UTF-8 without a NUL byte, a DAWproject as a zip; "other"
 * needs only to be there. False when the store has nothing to read.
 */
export async function startsLikeKind(url: string, kind: FileKind): Promise<boolean> {
	const head = await headOfBlob(url);
	if (!head) return false;
	switch (kind) {
		case "pdf":
			return isPdfBytes(head);
		case "image":
			return startsLikeImage(head);
		case "audio":
			return startsLikeAudio(head);
		case "midi":
			return startsLikeMidi(head);
		case "text":
			return looksLikeText(head);
		case "dawproject":
			// A zip: "PK\u0003\u0004" (one uploaded by hand; the jobs function's own never passes here).
			return (
				head.length > 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4
			);
		case "other":
			return head.length > 0;
	}
}

/** The 415's message when `startsLikeKind` says no: "That file does not look like a PDF". */
export function notLikeKindMessage(kind: FileKind): string {
	const what =
		kind === "pdf"
			? "a PDF"
			: kind === "image"
				? "an image"
				: kind === "audio"
					? "audio"
					: kind === "text"
						? "text"
						: kind === "midi"
							? "MIDI"
							: `a ${FILE_KIND_LABELS[kind].toLowerCase()}`;
	return `That file does not look like ${what}`;
}
