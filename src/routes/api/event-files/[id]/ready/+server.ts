import { accountOfEventFile, memberOf } from "#lib/server/access.js";
import { deleteBlobs, isOurBlobUrl } from "#lib/server/blob.js";
import { failEventFile, findEventFileById, markEventFileReady } from "#lib/server/data.js";
import { headOfBlob } from "#lib/server/headOfBlob.js";
import { readyFormOf, storeFileThumbnail } from "#lib/server/readyForm.js";
import { fileKindOf } from "#lib/constants/fileFormats.js";
import { isPdfBytes, startsLikeImage } from "#lib/utils/fileSignatures.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** A measured side: a whole number of pixels the browser could have read, else null. */
function side(value: FormDataEntryValue | null): number | null {
	const n = Number(value);
	return value !== null && Number.isInteger(n) && n > 0 && n <= 100_000 ? n : null;
}

/**
 * Whether the file as stored starts the way its name says: a PDF with
 * `%PDF-`, anything else with an image's signature. Null when it does,
 * else the 415's message.
 */
async function eventFileBytesError(url: string, filename: string): Promise<string | null> {
	const pdf = fileKindOf(filename) === "pdf";
	const head = await headOfBlob(url);
	if (head && (pdf ? isPdfBytes(head) : startsLikeImage(head))) return null;
	return `That file does not look like ${pdf ? "a PDF" : "an image"}`;
}

/**
 * Step 3 of a poster's or photo's upload (docs/band-plan.md, "Posters,
 * pictures and video"): the browser reports the blob URL and, when it has
 * them, a thumbnail (a PDF poster's first page, or a smaller copy of an
 * image, as a WebP or PNG) and the size it measured. The server reads the
 * file's first bytes from the store before believing its name: a PDF
 * poster must start `%PDF-`, an image with an image's signature; anything
 * else is removed, row and file (415). The thumbnail is checked by its
 * bytes too and stored beside the file. A poster replaces the event's
 * earlier one: their rows go at ready and their blobs here.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { form, url, thumbnail } = await readyFormOf(request);

	const { accountId } = await memberOf(locals, accountOfEventFile, params.id);
	const file = await findEventFileById(accountId, params.id);
	if (!file) error(404, "File not found");
	if (!isOurBlobUrl(url, file.pathname)) error(400, "That is not the uploaded file's URL");

	const bytesError = await eventFileBytesError(url, file.filename);
	if (bytesError) {
		await failEventFile(accountId, params.id);
		error(415, bytesError);
	}

	const ready = await markEventFileReady(accountId, params.id, {
		url,
		...(await storeFileThumbnail(thumbnail, file.pathname)),
		width: side(form.get("width")),
		height: side(form.get("height")),
	});
	if (!ready) error(404, "File not found");
	if (ready.replaced.length > 0) {
		await deleteBlobs(ready.replaced.flatMap((r) => [r.url, r.thumbnailUrl ?? ""]));
	}
	return Response.json({ file: ready.file });
};
