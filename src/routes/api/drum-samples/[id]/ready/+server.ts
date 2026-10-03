import { isEditor, memberOf, requireSystemAdmin, requireUser } from "$lib/server/access";
import { isOurBlobUrl } from "$lib/server/blob";
import { drumSampleOwner, markDrumSampleReady } from "$lib/server/data";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 3 of a drum sample upload: the browser reports the blob URL; the voice's older file goes. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const owner = await drumSampleOwner(params.id);
	if (!owner) error(404, "Sample not found");
	requireUser(locals);
	if (owner.accountId) {
		const m = await memberOf(locals, async () => owner.accountId, owner.accountId);
		if (!isEditor(m.role)) error(404, "Sample not found");
	} else requireSystemAdmin(locals);
	if (!isOurBlobUrl(body.url, owner.pathname)) error(400, "That is not the uploaded file's URL");
	const row = await markDrumSampleReady(params.id, body.url);
	if (!row) error(404, "Sample not found");
	return json({ ok: true });
};
