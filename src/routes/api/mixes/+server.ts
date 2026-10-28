import { MAX_MIXES_PER_SONG, MIX_FORMAT_LIST } from "#lib/constants/mixFormats.js";
import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { createMix } from "#lib/server/data.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of a mix upload (docs/mixes.md): reserve the row (the next version of the song's mixes) and return the pathname to upload to. A demo's rules: any audio a DAW exports, the stem size ceiling, the account's storage room. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { songId?: string; filename?: string; sizeBytes?: number };
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${MIX_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, STEM_MAX_BYTES)) {
		if (typeof sizeBytes === "number" && sizeBytes > STEM_MAX_BYTES)
			error(413, "File is over the per-file limit");
		error(400, "sizeBytes must be the file's size in whole bytes");
	}

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	await requireStorageRoom(accountId, sizeBytes);
	const row = await createMix(accountId, requireUser(locals).id, songId, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_MIXES_PER_SONG} mixes`);
	return Response.json({
		mixId: row.id,
		version: row.version,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
