import { accountOfFile, memberOf } from "#lib/server/access.js";
import { isOurBlobUrl } from "#lib/server/blob.js";
import { failFile, findFileById, markFileReady } from "#lib/server/data.js";
import { headOfBlob } from "#lib/server/headOfBlob.js";
import { pageCountOf, readyFormOf, storeFileThumbnail } from "#lib/server/readyForm.js";
import { FILE_KIND_LABELS, type FileKind } from "#lib/constants/fileFormats.js";
import {
	isPdfBytes,
	looksLikeText,
	startsLikeAudio,
	startsLikeImage,
	startsLikeMidi,
} from "#lib/utils/fileSignatures.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 3 of an attachment upload (docs/uploads-and-blob.md, "Attachments"):
 * the browser reports the blob URL and, when it rendered one, the page
 * count and the first page as an image (a WebP or PNG; a PDF's). The
 * server reads the file's first bytes from the store and checks them
 * against the row's kind before believing the name (a browser's content
 * type is a claim): a PDF must start `%PDF-`, an image, an audio file or
 * a MIDI file with its own signature, a text file must decode as UTF-8
 * without a NUL byte; "other" is checked by size alone. Anything else is
 * removed, row and file. The thumbnail is checked by its bytes too, then
 * stored beside the file in the same store; an image without one is fine
 * (the page shows the image itself).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { form, url, thumbnail } = await readyFormOf(request);
	const pageCount = pageCountOf(form);

	const { accountId } = await memberOf(locals, accountOfFile, params.id);
	const file = await findFileById(accountId, params.id);
	if (!file) error(404, "File not found");
	const { pathname, kind } = file;
	if (!isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");

	if (!(await startsLikeKind(url, kind))) {
		await failFile(accountId, params.id);
		error(
			415,
			`That file does not look like ${
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
									: `a ${FILE_KIND_LABELS[kind].toLowerCase()}`
			}`,
		);
	}

	const row = await markFileReady(accountId, params.id, {
		url,
		pageCount,
		...(await storeFileThumbnail(thumbnail, pathname)),
	});
	if (!row) error(404, "File not found");
	return Response.json({ ok: true, shareCode: row.shareCode, kind: row.kind });
};

/** Whether the file as stored starts the way its kind should; "other" needs only to be there. */
async function startsLikeKind(url: string, kind: FileKind): Promise<boolean> {
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
