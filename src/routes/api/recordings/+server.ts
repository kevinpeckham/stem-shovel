import { accountOfIdea, requireUser } from "#lib/server/access.js";
import { createRecording, recordingStore, userOwnsIdea } from "#lib/server/data.js";
import { DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
import { demoContentType } from "#lib/utils/demoContentType.js";
import { MAX_TAKE_BYTES, MAX_TAKE_SECONDS } from "#lib/constants/takeLimits.js";
import { RECORDING_CODECS, type RecordingCodec } from "#lib/constants/recordingCodecs.js";
import { validSizeBytes } from "#lib/utils/validSizeBytes.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of saving a take: reserve the row under its idea (numbered next) and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		ideaId?: string;
		title?: string;
		filename?: string;
		sizeBytes?: number;
		codec?: string;
		trimSilence?: boolean;
	};
	const { ideaId, title, filename, sizeBytes } = body;
	const codec = RECORDING_CODECS.includes(body.codec as RecordingCodec)
		? (body.codec as RecordingCodec)
		: null;
	if (!ideaId || !filename || typeof sizeBytes !== "number") {
		error(400, "ideaId, filename and sizeBytes are required");
	}
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (!validSizeBytes(sizeBytes, MAX_TAKE_BYTES)) {
		if (typeof sizeBytes === "number" && sizeBytes > MAX_TAKE_BYTES)
			error(
				413,
				`A take is at most ${Math.round(MAX_TAKE_BYTES / 1024 / 1024)} MB (about ${MAX_TAKE_SECONDS / 60} minutes)`,
			);
		error(400, "sizeBytes must be the file's size in whole bytes");
	}
	const user = requireUser(locals);
	// The idea is the user's own (whichever account holds its files); its account's storage is what the take counts against.
	const accountId = await accountOfIdea(ideaId);
	if (!accountId || !(await userOwnsIdea(accountId, user.id, ideaId))) error(404, "Idea not found");
	await requireStorageRoom(accountId, sizeBytes);
	const row = await createRecording(accountId, user.id, ideaId, {
		title: (title ?? "").trim().slice(0, 120),
		filename,
		contentType,
		sizeBytes,
		codec,
		trimSilence: body.trimSilence === true,
	});
	if (!row) error(404, "Idea not found");
	return Response.json({
		recordingId: row.id,
		takeNumber: row.takeNumber,
		pathname: row.pathname,
		access: recordingStore(),
	});
};
