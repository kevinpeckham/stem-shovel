import { accountOfStem, memberOf } from "#lib/server/access.js";
import { reserveStemReplacement, storageRoom } from "#lib/server/data.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { background } from "#lib/server/background.js";
import { checkStorage } from "#lib/server/notifications.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { STEM_FORMAT_LIST, STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
import { stemContentType } from "#lib/utils/stemContentType.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Like POST /api/stems, but for an existing stem: reserves a new pathname for its next file. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as {
		filename?: string;
		sizeBytes?: number;
	};
	const { filename, sizeBytes } = body;
	if (!filename || typeof sizeBytes !== "number") error(400, "filename and sizeBytes are required");
	const contentType = stemContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported stem format (${STEM_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, STEM_MAX_BYTES)) {
		if (sizeBytes > STEM_MAX_BYTES) error(413, "File is over the per-stem limit");
		error(400, "sizeBytes must be the file's size in whole bytes");
	}
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	// The new file counts against the account like any upload (the old version stays until it is retired).
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await reserveStemReplacement(accountId, params.id, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Stem not found");
	return Response.json({
		stemId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
