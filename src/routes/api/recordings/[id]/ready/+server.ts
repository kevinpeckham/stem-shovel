import { accountOfRecording, memberOf } from "$lib/server/access";
import { isOurBlobUrl } from "$lib/server/blob";
import { markRecordingReady, reservedPathname } from "$lib/server/data";
import { scheduleRecordingPlayback } from "$lib/server/jobs";
import type { Config } from "@sveltejs/adapter-vercel";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** The MP3 renders after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/** Step 3 of saving a recording: the browser reports the blob URL and the length it timed. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { url?: string; durationSeconds?: number };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const duration =
		typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
			? Math.max(0, body.durationSeconds)
			: null;
	const { accountId } = await memberOf(locals, accountOfRecording, params.id);
	const pathname = await reservedPathname(accountId, "recording", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname)) {
		error(400, "That is not the uploaded file's URL");
	}
	const row = await markRecordingReady(accountId, params.id, body.url, duration);
	if (!row) error(404, "Recording not found");
	scheduleRecordingPlayback([params.id]);
	return json({ ok: true });
};
