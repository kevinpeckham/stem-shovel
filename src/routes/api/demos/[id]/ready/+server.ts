import { accountOfDemo, memberOf } from "$lib/server/access";
import { isOurBlobUrl } from "$lib/server/blob";
import { markDemoReady, reservedPathname } from "$lib/server/data";
import { scheduleDemoPlayback } from "$lib/server/jobs";
import type { Config } from "@sveltejs/adapter-vercel";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** The MP3 renders after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/** Step 3 of a demo upload: the browser reports the blob URL. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const { accountId } = await memberOf(locals, accountOfDemo, params.id);
	const pathname = await reservedPathname(accountId, "demo", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname)) {
		error(400, "That is not the uploaded file's URL");
	}
	const row = await markDemoReady(accountId, params.id, body.url);
	if (!row) error(404, "Demo not found");
	scheduleDemoPlayback([params.id]);
	return json({ ok: true });
};
