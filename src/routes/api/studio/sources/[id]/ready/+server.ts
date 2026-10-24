import { requireStudioAccess } from "#lib/server/access.js";
import { isOurBlobUrl } from "#lib/server/blob.js";
import { markStudioSourceReady, studioSourceOwner } from "#lib/server/data.js";
import { scheduleStudioFlac } from "#lib/server/jobs.js";
import { parseJsonBody } from "#lib/server/parseJsonBody.js";
import { studioSourceWantsFlac } from "#lib/utils/studioSourceWantsFlac.js";
import { StudioSourceReadySchema } from "#lib/val/StudioSchema.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const config: Config = { maxDuration: 60 };

/** Step 3 of saving a Studio source (docs/multitrack-recorder.md): the browser reports the blob URL, the peaks and the length it decoded. Owned through its song (ideas are the user's own); the row's status is not checked, since the completion webhook may have marked it ready already. A WAV source is then handed to the jobs function for its FLAC (src/lib/server/transcode.ts `flacStudioSources`). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const ready = await parseJsonBody(request, StudioSourceReadySchema);
	const source = await studioSourceOwner(params.id);
	if (!source) error(404, "Song not found");
	const { accountId } = await requireStudioAccess(locals, source.ideaId);
	if (!isOurBlobUrl(ready.url, source.pathname)) error(400, "That is not the uploaded file's URL");
	const marked = await markStudioSourceReady(accountId, params.id, ready);
	if (marked && studioSourceWantsFlac({ ...source, name: source.pathname }))
		scheduleStudioFlac([params.id]);
	return Response.json({ ok: true });
};
