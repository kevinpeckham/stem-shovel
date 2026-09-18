import { requireMember, requireUser } from "$lib/server/access";
import { createRecording, recordingStore } from "$lib/server/data";
import { DEMO_FORMAT_LIST } from "$lib/constants/demoFormats";
import { demoContentType } from "$lib/utils/demoContentType";
import { STEM_MAX_BYTES } from "$lib/constants/stemFormats";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Step 1 of saving a scratch recording: reserve the row and return the pathname to upload to. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		accountId?: string;
		title?: string;
		notes?: string;
		filename?: string;
		sizeBytes?: number;
	};
	const { accountId, title, notes, filename, sizeBytes } = body;
	if (!accountId || !filename || typeof sizeBytes !== "number") {
		error(400, "accountId, filename and sizeBytes are required");
	}
	const contentType = demoContentType(filename);
	if (!contentType)
		error(415, `"${filename}" is not a supported audio format (${DEMO_FORMAT_LIST})`);
	if (sizeBytes > STEM_MAX_BYTES) error(413, "File is over the per-file limit");
	const user = requireUser(locals);
	requireMember(locals, accountId);
	const row = await createRecording(accountId, user.id, {
		title: (title ?? "").trim().slice(0, 120) || "Recording",
		notes: typeof notes === "string" ? notes.slice(0, 50_000) : "",
		filename,
		contentType,
		sizeBytes,
	});
	return json({ recordingId: row.id, pathname: row.pathname, access: recordingStore() });
};
