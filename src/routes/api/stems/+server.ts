import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { createStem } from "#lib/server/data.js";
import {
	MAX_STEMS_PER_SONG,
	STEM_FORMAT_LIST,
	STEM_MAX_BYTES,
} from "#lib/constants/stemFormats.js";
import { stemContentType } from "#lib/utils/stemContentType.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { NanoIdSchema } from "#lib/val/NanoIdSchema.js";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { RequestHandler } from "./$types";

/** The arrangement a stem joins: an alternate's id, or null (or absent) for the song's Main (docs/arrangements.md). */
const ArrangementIdSchema = v.optional(v.nullable(NanoIdSchema), null);

/**
 * Step 1 of an upload: reserve the row and return the pathname to upload to.
 * An `arrangementId` puts the stem in that alternate of the song; one that is
 * not the song's is a 404, like an unknown song.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as {
		songId?: string;
		filename?: string;
		sizeBytes?: number;
		arrangementId?: unknown;
	};
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	const arrangement = v.safeParse(ArrangementIdSchema, body.arrangementId);
	if (!arrangement.success) error(400, "arrangementId must be an arrangement's id or null");
	const contentType = stemContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported stem format (${STEM_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, STEM_MAX_BYTES)) {
		if (typeof sizeBytes === "number" && sizeBytes > STEM_MAX_BYTES)
			error(413, "File is over the per-stem limit");
		error(400, "sizeBytes must be the file's size in whole bytes");
	}

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	await requireStorageRoom(accountId, sizeBytes);
	const row = await createStem(
		accountId,
		requireUser(locals).id,
		songId,
		{ filename, contentType, sizeBytes },
		arrangement.output,
	);
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_STEMS_PER_SONG} stems`);
	return Response.json({
		stemId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
