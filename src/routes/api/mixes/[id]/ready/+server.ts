import { PEAK_BINS } from "#lib/audio/peaks.js";
import { accountOfMix, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { isOurBlobUrl } from "#lib/server/blob.js";
import { markMixReady, reservedPathname } from "#lib/server/data.js";
import { scheduleMixPlayback } from "#lib/server/jobs.js";
import { notifyMix } from "#lib/server/notifications.js";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** The MP3 renders after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/**
 * Step 3 of a mix upload (docs/mixes.md): the browser reports the blob URL
 * and what it decoded (the length and the waveform peaks, or nulls when it
 * could not decode the file). The MP3 and the notification follow.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as {
		url?: string;
		durationSeconds?: number | null;
		peaks?: number[] | null;
	};
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const durationSeconds =
		typeof body.durationSeconds === "number" && body.durationSeconds > 0
			? body.durationSeconds
			: null;
	const peaks =
		Array.isArray(body.peaks) &&
		body.peaks.length === PEAK_BINS &&
		body.peaks.every((p) => typeof p === "number" && p >= 0 && p <= 1)
			? body.peaks
			: null;
	const { accountId } = await memberOf(locals, accountOfMix, params.id);
	const pathname = await reservedPathname(accountId, "mix", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname)) {
		error(400, "That is not the uploaded file's URL");
	}
	const row = await markMixReady(accountId, params.id, body.url, { durationSeconds, peaks });
	if (!row) error(404, "Mix not found");
	scheduleMixPlayback([params.id]);
	const uploader = requireUser(locals).id;
	background(() => notifyMix(accountId, params.id, uploader));
	return Response.json({ ok: true });
};
