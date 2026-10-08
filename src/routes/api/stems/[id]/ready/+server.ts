import { accountOfStem, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { notifyStems } from "#lib/server/notifications.js";
import { isOurBlobUrl } from "#lib/server/blob.js";
import { markStemReady, reservedPathname } from "#lib/server/data.js";
import { schedulePlayback } from "#lib/server/jobs.js";
import { MAX_AUDIO_CHANNELS, MAX_AUDIO_SECONDS } from "#lib/constants/audioBounds.js";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** The rendition renders after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/** Step 3 of an upload: the browser decoded the file and reports what it learned. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as {
		url?: string;
		durationSeconds?: number;
		channels?: number;
		peaks?: number[];
	};
	const { url, durationSeconds, channels, peaks } = body;
	if (
		typeof url !== "string" ||
		!url.startsWith("https://") ||
		typeof durationSeconds !== "number" ||
		!Number.isFinite(durationSeconds) ||
		durationSeconds < 0 ||
		durationSeconds > MAX_AUDIO_SECONDS ||
		typeof channels !== "number" ||
		!Number.isInteger(channels) ||
		channels < 1 ||
		channels > MAX_AUDIO_CHANNELS ||
		!Array.isArray(peaks) ||
		peaks.length > 4096 ||
		!peaks.every((p) => typeof p === "number" && p >= 0 && p <= 1)
	) {
		error(
			400,
			"url, durationSeconds (up to a day), channels (1 to 8) and peaks (0..1) are required",
		);
	}
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	// Only the file this reservation was for, in one of our stores.
	const pathname = await reservedPathname(accountId, "stem", params.id);
	if (!pathname || !isOurBlobUrl(url, pathname)) error(400, "That is not the uploaded file's URL");
	const row = await markStemReady(accountId, params.id, {
		url,
		durationSeconds,
		channels,
		peaks,
	});
	if (!row) error(404, "Stem not found");
	schedulePlayback([params.id]);
	const uploader = requireUser(locals).id;
	background(() => notifyStems(accountId, row.songId, uploader));
	return Response.json({ ok: true });
};
