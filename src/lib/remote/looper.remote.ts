import { getRequestEvent, query } from "$app/server";
import { accountOfRecording, requireUser } from "#lib/server/access.js";
import { loopSources as sources, userOwnsRecording } from "#lib/server/data.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/** The looper (docs/looper.md, "Export and Load"): a loop exported to the Idea Recorder loads back from its take's sources. */

/** The take's sources with URLs to fetch, and the loop's settings; the caller's own take. */
export const loopSources = query(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const accountId = await accountOfRecording(id);
	if (!accountId || !(await userOwnsRecording(accountId, user.id, id)))
		error(404, "Loop not found");
	const found = await sources(accountId, id);
	if (!found) error(404, "Loop not found");
	return found;
});
