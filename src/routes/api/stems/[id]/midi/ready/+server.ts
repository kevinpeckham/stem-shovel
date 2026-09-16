import { accountOfStem, memberOf } from "$lib/server/access";
import { isOurBlobUrl } from "$lib/server/blob";
import { markStemMidiReady, reservedPathname } from "$lib/server/data";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 3 of a MIDI upload: the browser reports the blob URL. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	const pathname = await reservedPathname(accountId, "midi", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname)) {
		error(400, "That is not the uploaded file's URL");
	}
	const row = await markStemMidiReady(accountId, params.id, body.url);
	if (!row) error(404, "Stem not found");
	return json({ ok: true });
};
