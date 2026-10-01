import { requireUser } from "$lib/server/access";
import { isOurBlobUrl } from "$lib/server/blob";
import {
	markRecordingStemReady,
	recordingStemById,
	reservedPathname,
	userOwnsRecording,
} from "$lib/server/data";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 3 of saving a multitrack take's source (docs/demo-recording.md, "Multitrack takes"): the browser reports the blob URL and the length it timed. Owned through its take (ideas are the user's own). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string; durationSeconds?: number };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const duration =
		typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
			? Math.max(0, body.durationSeconds)
			: null;
	const user = requireUser(locals);
	const source = await recordingStemById(params.id);
	if (!source || !(await userOwnsRecording(source.accountId, user.id, source.recordingId)))
		error(404, "Recording not found");
	const pathname = await reservedPathname(source.accountId, "recording-stem", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname)) {
		error(400, "That is not the uploaded file's URL");
	}
	const row = await markRecordingStemReady(source.accountId, params.id, body.url, duration);
	if (!row) error(404, "Recording not found");
	return json({ ok: true });
};
