import { accountOfIdea, memberOf, requireUser } from "$lib/server/access";
import { createRecording, recordingStore, userOwnsIdea } from "$lib/server/data";
import { DEMO_FORMAT_LIST } from "$lib/constants/demoFormats";
import { demoContentType } from "$lib/utils/demoContentType";
import { MAX_TAKE_BYTES, MAX_TAKE_SECONDS } from "$lib/constants/takeLimits";
import { RECORDING_CODECS, type RecordingCodec } from "$lib/constants/recordingCodecs";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of saving a take: reserve the row under its idea (numbered next) and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		ideaId?: string;
		title?: string;
		filename?: string;
		sizeBytes?: number;
		codec?: string;
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
	if (sizeBytes > MAX_TAKE_BYTES) {
		error(
			413,
			`A take is at most ${Math.round(MAX_TAKE_BYTES / 1024 / 1024)} MB (about ${MAX_TAKE_SECONDS / 60} minutes)`,
		);
	}
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfIdea, ideaId);
	if (!(await userOwnsIdea(accountId, user.id, ideaId))) error(404, "Idea not found");
	const row = await createRecording(accountId, user.id, ideaId, {
		title: (title ?? "").trim().slice(0, 120),
		filename,
		contentType,
		sizeBytes,
		codec,
	});
	if (!row) error(404, "Idea not found");
	return json({
		recordingId: row.id,
		takeNumber: row.takeNumber,
		pathname: row.pathname,
		access: recordingStore(),
	});
};
