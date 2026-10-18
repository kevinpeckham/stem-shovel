import { accountOfSessionRecording, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { isOurBlobUrl, readBlob } from "#lib/server/blob.js";
import { failSessionRecording, markSessionReady, reservedPathname } from "#lib/server/data.js";
import { scheduleSessionPlayback } from "#lib/server/jobs.js";
import { notifySessionRecording } from "#lib/server/notifications.js";
import { startsLikeAudio } from "#lib/utils/fileSignatures.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 3 of a session recording's upload (docs/uploads-and-blob.md,
 * "Sessions"): the browser reports the blob URL; the server reads the
 * file's first bytes from the store and believes it is audio only if they
 * say so, else the row and the file go. Then the MP3 is scheduled and the
 * account's members are told.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { url?: string };
	if (typeof body.url !== "string" || !body.url.startsWith("https://"))
		error(400, "url is required");
	const { accountId } = await memberOf(locals, accountOfSessionRecording, params.id);
	const pathname = await reservedPathname(accountId, "session", params.id);
	if (!pathname || !isOurBlobUrl(body.url, pathname))
		error(400, "That is not the uploaded file's URL");
	const head = await headOfBlob(body.url);
	if (!head || !startsLikeAudio(head)) {
		await failSessionRecording(accountId, params.id, body.url);
		error(415, "That file does not look like audio");
	}
	const row = await markSessionReady(accountId, params.id, body.url);
	if (!row) error(404, "Session recording not found");
	// The MP3 renders in the jobs function; the band hears after the response.
	scheduleSessionPlayback([params.id]);
	const uploader = requireUser(locals).id;
	background(() => notifySessionRecording(accountId, params.id, uploader));
	return Response.json({ ok: true, sessionId: row.sessionId });
};

/** The first bytes of the file as stored (a second try a moment later: the CDN can lag a fresh upload). */
async function headOfBlob(url: string): Promise<Uint8Array | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await readBlob(url).catch(() => null);
		if (res?.ok && res.body) {
			const reader = res.body.getReader();
			const { value } = await reader.read();
			await reader.cancel().catch(() => {});
			return value ?? null;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return null;
}
