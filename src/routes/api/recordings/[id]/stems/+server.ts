import { accountOfRecording, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import {
	createRecordingStem,
	recordingStore,
	storageRoom,
	userOwnsRecording,
} from "#lib/server/data.js";
import { checkStorage } from "#lib/server/notifications.js";
import { DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
import { RECORDING_CODECS, type RecordingCodec } from "#lib/constants/recordingCodecs.js";
import { MAX_TAKE_BYTES } from "#lib/constants/takeLimits.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { MAX_STEMS_PER_SONG } from "#lib/constants/stemFormats.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of saving one source of a take (docs/demo-recording.md, "Takes with sources"): reserve the row under the take and return the pathname to upload to. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as {
		label?: string;
		sortOrder?: number;
		filename?: string;
		sizeBytes?: number;
		codec?: string;
	};
	const { label, filename, sizeBytes } = body;
	if (!label || !filename || typeof sizeBytes !== "number") {
		error(400, "label, filename and sizeBytes are required");
	}
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, MAX_TAKE_BYTES)) {
		if (typeof sizeBytes === "number" && sizeBytes > MAX_TAKE_BYTES)
			error(413, "A source is over the per-take limit");
		error(400, "sizeBytes must be the file's size in whole bytes");
	}
	// Its place among the take's sources: a small whole number.
	const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 0;
	if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > MAX_STEMS_PER_SONG)
		error(400, "sortOrder must be a whole number within a song's stems");
	const codec = RECORDING_CODECS.includes(body.codec as RecordingCodec)
		? (body.codec as RecordingCodec)
		: null;
	// The take is the user's own (ideas are theirs); its account's storage is what the source counts against.
	const user = requireUser(locals);
	const accountId = await accountOfRecording(params.id);
	if (!accountId || !(await userOwnsRecording(accountId, user.id, params.id)))
		error(404, "Recording not found");
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await createRecordingStem(accountId, params.id, {
		label: label.trim().slice(0, 60),
		sortOrder,
		filename,
		contentType,
		sizeBytes,
		codec,
	});
	if (!row) error(404, "Recording not found");
	return json({ stemId: row.id, pathname: row.pathname, access: recordingStore() });
};
