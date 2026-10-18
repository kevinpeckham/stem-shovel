import { command, getRequestEvent } from "$app/server";
import { accountOfSession, memberOf } from "#lib/server/access.js";
import {
	deleteSessionRecording as removeSession,
	updateSessionRecording as saveSession,
} from "#lib/server/data.js";
import {
	SessionRecordingDeleteSchema,
	SessionRecordingUpdateSchema,
} from "#lib/val/SessionRecordingSchema.js";
import { error } from "@sveltejs/kit";

/** A session recording's kind, title, day, place and notes (docs/uploads-and-blob.md, "Sessions"); an editor of the account. */
export const updateSession = command(
	SessionRecordingUpdateSchema,
	async ({ id, kind, title, recordedOn, place, notes }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSession, id);
		const row = await saveSession(accountId, id, { kind, title, recordedOn, place, notes });
		if (!row) error(404, "Session recording not found");
		return {
			kind: row.kind,
			title: row.title,
			recordedOn: row.recordedOn,
			place: row.place,
			notes: row.notes,
		};
	},
);

/** The recording gone from the store and the account. */
export const deleteSession = command(SessionRecordingDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSession, id);
	if (!(await removeSession(accountId, id))) error(404, "Session recording not found");
	return { deleted: true };
});
