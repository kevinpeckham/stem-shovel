import { createStem } from "$lib/server/data";
import { STEM_CONTENT_TYPES, STEM_MAX_BYTES } from "$lib/slug";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of an upload: reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		songId?: string;
		filename?: string;
		contentType?: string;
		sizeBytes?: number;
	};
	const { songId, filename, contentType, sizeBytes } = body;
	if (!songId || !filename || !contentType || typeof sizeBytes !== "number") {
		error(400, "songId, filename, contentType and sizeBytes are required");
	}
	if (!STEM_CONTENT_TYPES.includes(contentType)) error(415, `Unsupported type ${contentType}`);
	if (sizeBytes > STEM_MAX_BYTES) error(413, "File is over the per-stem limit");

	const row = await createStem(locals.account.id, locals.user.id, songId, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Song not found");
	return json({ stemId: row.id, pathname: row.pathname });
};
