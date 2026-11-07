import { accountOfChatAttachment, memberOf, requireUser } from "#lib/server/access.js";
import { isOurBlobUrl } from "#lib/server/blob.js";
import {
	failChatAttachment,
	findChatAttachmentById,
	markChatAttachmentReady,
} from "#lib/server/data.js";
import { measuredSizeOf, readyFormOf, storeFileThumbnail } from "#lib/server/readyForm.js";
import { notLikeKindMessage, startsLikeKind } from "#lib/server/startsLikeKind.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 3 of a chat attachment's upload (docs/chat.md, "Attachments"): the
 * uploader's browser reports the blob URL and, when it has them, a
 * thumbnail (a smaller copy of an image or a PDF's first page, as a WebP
 * or PNG) and the size it measured. Only the person who reserved the file
 * reports it, while it is still uploading (403 otherwise). The server reads
 * the file's first bytes from the store and checks them against the row's
 * kind before believing the name, as an attachment's ready does; anything
 * else is removed, row and file (415). The thumbnail is checked by its
 * bytes too and stored beside the file. The ready row comes back for the
 * composer's pending strip; it joins a message when one is sent with it.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { form, url, thumbnail } = await readyFormOf(request);

	const { accountId } = await memberOf(locals, accountOfChatAttachment, params.id, {
		viewers: true,
	});
	const file = await findChatAttachmentById(accountId, params.id);
	if (!file) error(404, "File not found");
	if (file.uploadedBy !== requireUser(locals).id || file.status !== "uploading")
		error(403, "That file is not yours to finish");
	const { pathname, kind } = file;
	if (!isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");

	if (!(await startsLikeKind(url, kind))) {
		await failChatAttachment(accountId, params.id);
		error(415, notLikeKindMessage(kind));
	}

	const attachment = await markChatAttachmentReady(accountId, params.id, {
		url,
		...(await storeFileThumbnail(thumbnail, pathname)),
		...measuredSizeOf(form),
	});
	if (!attachment) error(404, "File not found");
	return Response.json({ attachment });
};
