import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { createNotation, storageRoom } from "#lib/server/data.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { background } from "#lib/server/background.js";
import { checkStorage } from "#lib/server/notifications.js";
import {
	MAX_NOTATION_PER_SONG,
	NOTATION_MAX_BYTES,
	notationFormatOf,
} from "#lib/constants/notationFormats.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of a notation upload (docs/uploads-and-blob.md, "Notation files"): reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { songId?: string; filename?: string; sizeBytes?: number };
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	const format = notationFormatOf(filename);
	if (!format) error(415, `"${filename}" is not a MusicXML file (.mxl, .musicxml or .xml)`);
	if (sizeBytes <= 0) error(400, "The file is empty");
	if (sizeBytes > NOTATION_MAX_BYTES)
		error(413, `A notation file can be up to ${formatBytes(NOTATION_MAX_BYTES)}`);

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await createNotation(accountId, requireUser(locals).id, songId, {
		filename,
		sizeBytes,
		format,
	});
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_NOTATION_PER_SONG} notation files`);
	return Response.json({
		notationId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
