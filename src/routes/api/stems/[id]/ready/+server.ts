import { accountOfStem, memberOf } from "$lib/server/access";
import { markStemReady } from "$lib/server/data";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

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
		typeof channels !== "number" ||
		!Array.isArray(peaks) ||
		peaks.length > 4096 ||
		!peaks.every((p) => typeof p === "number" && p >= 0 && p <= 1)
	) {
		error(400, "url, durationSeconds, channels and peaks (0..1) are required");
	}
	const { accountId } = await memberOf(locals, accountOfStem, params.id);
	const row = await markStemReady(accountId, params.id, {
		url,
		durationSeconds,
		channels,
		peaks,
	});
	if (!row) error(404, "Stem not found");
	return json({ ok: true });
};
