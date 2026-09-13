import { accountOfStem, memberOf } from "$lib/server/access";
import { reserveStemReplacement } from "$lib/server/data";
import { STEM_FORMAT_LIST, STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { stemContentType } from "$lib/utils/stemContentType";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Like POST /api/stems, but for an existing stem: reserves a new pathname for its next file. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { filename?: string; sizeBytes?: number };
	const { filename, sizeBytes } = body;
	if (!filename || typeof sizeBytes !== "number") error(400, "filename and sizeBytes are required");
	const contentType = stemContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported stem format (${STEM_FORMAT_LIST})`);
	if (sizeBytes > STEM_MAX_BYTES) error(413, "File is over the per-stem limit");
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	const row = await reserveStemReplacement(accountId, params.id, {
		filename,
		contentType,
		sizeBytes,
	});
	if (!row) error(404, "Stem not found");
	return json({ stemId: row.id, pathname: row.pathname });
};
