import { accountOfStem, memberOf } from "#lib/server/access.js";
import { reserveStemReplacement } from "#lib/server/data.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { STEM_FORMAT_LIST, STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
import { stemContentType } from "#lib/utils/stemContentType.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
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
	await requireStorageRoom(accountId, sizeBytes);
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
