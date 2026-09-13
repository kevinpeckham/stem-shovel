import { accountOfSong, memberOf, requireUser } from "$lib/server/access";
import { createDemo } from "$lib/server/data";
import { DEMO_FORMAT_LIST, MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { demoContentType } from "$lib/utils/demoContentType";
import { STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of a demo upload: reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { songId?: string; filename?: string; sizeBytes?: number };
	const { songId, filename, sizeBytes } = body;
	if (!songId || !filename || typeof sizeBytes !== "number") {
		error(400, "songId, filename and sizeBytes are required");
	}
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (sizeBytes > STEM_MAX_BYTES) error(413, "File is over the per-file limit");

	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const row = await createDemo(accountId, requireUser(locals).id, songId, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Song not found");
	if (row === "full") error(409, `A song can have at most ${MAX_DEMOS_PER_SONG} demo recordings`);
	return json({ demoId: row.id, pathname: row.pathname });
};
