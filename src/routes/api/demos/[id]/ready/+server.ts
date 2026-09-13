import { accountOfDemo, memberOf } from "$lib/server/access";
import { markDemoReady } from "$lib/server/data";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 3 of a demo upload: the browser reports the blob URL. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const { accountId } = await memberOf(locals, accountOfDemo, params.id);
	const row = await markDemoReady(accountId, params.id, body.url);
	if (!row) error(404, "Demo not found");
	return json({ ok: true });
};
