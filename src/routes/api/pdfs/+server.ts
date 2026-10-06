import { accountOfSong, memberOf, requireUser } from "$lib/server/access";
import { createPdf, storageRoom } from "$lib/server/data";
import { formatBytes } from "$lib/utils/formatBytes";
import { background } from "$lib/server/background";
import { checkStorage } from "$lib/server/notifications";
import { MAX_PDFS_PER_SONG, PDF_MAX_BYTES } from "$lib/constants/pdfFormats";
import { accessOfPathname } from "$lib/server/relocate";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of a PDF upload (docs/uploads-and-blob.md, "PDFs"): reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		songId?: string;
		filename?: string;
		sizeBytes?: number;
		/** The PDF is a score: listed on the Chart tab's notation view as well. */
		notation?: boolean;
	};
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	if (!/[.]pdf$/i.test(filename)) error(415, `"${filename}" is not a PDF`);
	if (sizeBytes <= 0) error(400, "The file is empty");
	if (sizeBytes > PDF_MAX_BYTES) error(413, `A PDF can be up to ${formatBytes(PDF_MAX_BYTES)}`);

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await createPdf(accountId, requireUser(locals).id, songId, {
		filename,
		sizeBytes,
		isNotation: body.notation === true,
	});
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_PDFS_PER_SONG} PDFs`);
	return json({
		pdfId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
