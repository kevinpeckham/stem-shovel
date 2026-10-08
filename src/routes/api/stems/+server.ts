import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { createStem, storageRoom } from "#lib/server/data.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { background } from "#lib/server/background.js";
import { checkStorage } from "#lib/server/notifications.js";
import {
	MAX_STEMS_PER_SONG,
	STEM_FORMAT_LIST,
	STEM_MAX_BYTES,
} from "#lib/constants/stemFormats.js";
import { stemContentType } from "#lib/utils/stemContentType.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of an upload: reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as {
		songId?: string;
		filename?: string;
		sizeBytes?: number;
	};
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	const contentType = stemContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported stem format (${STEM_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, STEM_MAX_BYTES)) {
		if (typeof sizeBytes === "number" && sizeBytes > STEM_MAX_BYTES)
			error(413, "File is over the per-stem limit");
		error(400, "sizeBytes must be the file's size in whole bytes");
	}

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	// The reservation may have crossed a warning line; the account's admins hear after the response.
	background(() => checkStorage(accountId));
	const row = await createStem(accountId, requireUser(locals).id, songId, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_STEMS_PER_SONG} stems`);
	return Response.json({
		stemId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
