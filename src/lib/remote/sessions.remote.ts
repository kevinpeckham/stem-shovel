import { command, getRequestEvent } from "$app/server";
import {
	accountOfRecordingSession,
	accountOfSessionRecording,
	memberOf,
	requireUser,
} from "#lib/server/access.js";
import {
	createRecordingSession,
	deleteRecordingSession,
	deleteSessionRecording as removeRecording,
	updateRecordingSession,
	updateSessionRecording as saveRecording,
} from "#lib/server/data.js";
import {
	RecordingSessionCreateSchema,
	RecordingSessionDeleteSchema,
	RecordingSessionUpdateSchema,
	SessionRecordingDeleteSchema,
	SessionRecordingUpdateSchema,
} from "#lib/val/SessionRecordingSchema.js";
import { error } from "@sveltejs/kit";

/** A new session (docs/uploads-and-blob.md, "Sessions"), named before any recording is put in it; an editor of the account. */
export const createSession = command(RecordingSessionCreateSchema, async (input) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, async () => input.accountId, input.accountId);
	const row = await createRecordingSession(accountId, requireUser(locals).id, input);
	return { id: row.id };
});

/** A session's kind, name, day, place and notes; an editor of the account. */
export const updateSession = command(
	RecordingSessionUpdateSchema,
	async ({ id, kind, name, startsOn, place, notes }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfRecordingSession, id);
		const row = await updateRecordingSession(accountId, id, { kind, name, startsOn, place, notes });
		if (!row) error(404, "Session not found");
		return {
			kind: row.kind,
			name: row.name,
			startsOn: row.startsOn,
			place: row.place,
			notes: row.notes,
		};
	},
);

/** The session and every recording in it, files included. */
export const deleteSession = command(RecordingSessionDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfRecordingSession, id);
	if (!(await deleteRecordingSession(accountId, id))) error(404, "Session not found");
	return { deleted: true };
});

/** A recording's title, day and notes, and the session it belongs to (of its day or the day before); an editor of the account. */
export const updateRecording = command(
	SessionRecordingUpdateSchema,
	async ({ id, sessionId, title, recordedOn, notes }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSessionRecording, id);
		const row = await saveRecording(accountId, id, { sessionId, title, recordedOn, notes });
		if (row === "day")
			error(409, "A recording belongs to a session of its own day or the day before.");
		if (!row) error(404, "Recording or session not found");
		return {
			sessionId: row.sessionId,
			title: row.title,
			recordedOn: row.recordedOn,
			notes: row.notes,
		};
	},
);

/** The recording gone from the store and its session. */
export const deleteRecording = command(SessionRecordingDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSessionRecording, id);
	if (!(await removeRecording(accountId, id))) error(404, "Recording not found");
	return { deleted: true };
});
