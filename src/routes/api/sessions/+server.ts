import { memberOf, requireUser } from "#lib/server/access.js";
import { createSessionRecording, storageRoom } from "#lib/server/data.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { background } from "#lib/server/background.js";
import { checkStorage } from "#lib/server/notifications.js";
import { DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
import {
	MAX_SESSIONS_PER_ACCOUNT,
	SESSION_KINDS,
	SESSION_MAX_BYTES,
	type SessionKind,
} from "#lib/constants/sessionRecordings.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 1 of a session recording's upload (docs/uploads-and-blob.md,
 * "Sessions"): reserve the row in its session and return the pathname to
 * upload to. A member of the account; the file's own day comes with it,
 * and either the session it goes in or the kind and place a new session
 * of that day would take.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as {
		accountId?: string;
		/** The session to put it in; without one, the account's session of the file's day (or a new one). */
		sessionId?: string;
		kind?: string;
		/** The file's own day (the recorder's, from its modification time), `YYYY-MM-DD`. */
		recordedOn?: string;
		place?: string;
		/** Where the files were captured ("Room mic"), the same for the batch. */
		source?: string;
		/** A title typed before the upload (the session recorder); the filename's stem otherwise. */
		title?: string;
		filename?: string;
		sizeBytes?: number;
	};
	const { accountId, filename, sizeBytes } = body;
	if (!accountId || !filename || typeof sizeBytes !== "number")
		error(400, "accountId, filename and sizeBytes are required");
	const kind = (SESSION_KINDS as readonly string[]).includes(body.kind ?? "")
		? (body.kind as SessionKind)
		: "practice";
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, SESSION_MAX_BYTES)) {
		if (sizeBytes > SESSION_MAX_BYTES)
			error(413, `A session recording can be up to ${formatBytes(SESSION_MAX_BYTES)}`);
		error(400, "sizeBytes must be the file's size in whole bytes");
	}
	const recordedOn = /^\d{4}-\d{2}-\d{2}$/.test(body.recordedOn ?? "") ? body.recordedOn! : null;
	const place = typeof body.place === "string" ? body.place.trim().slice(0, 120) : "";
	const source = typeof body.source === "string" ? body.source.trim().slice(0, 120) : "";
	const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";

	await memberOf(locals, async () => accountId, accountId);
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await createSessionRecording(accountId, requireUser(locals).id, {
		sessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null,
		kind,
		recordedOn,
		place,
		source,
		title: title || undefined,
		filename,
		contentType,
		sizeBytes,
	});
	if (row === null) error(404, "Session not found");
	if (row === "full")
		error(409, `An account can keep at most ${MAX_SESSIONS_PER_ACCOUNT} session recordings`);
	return Response.json({
		recordingId: row.id,
		sessionId: row.sessionId,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
