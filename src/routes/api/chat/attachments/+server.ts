import {
	accountOfRecordingSession,
	accountOfSong,
	memberOf,
	requireUser,
} from "#lib/server/access.js";
import { createChatAttachment } from "#lib/server/data.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { FILE_KIND_LABELS, FILE_MAX_BYTES, fileKindOf } from "#lib/constants/fileFormats.js";
import { sizeCeilingMessage } from "#lib/utils/sizeCeilingMessage.js";
import { ChatAttachmentReserveSchema } from "#lib/val/ChatAttachmentSchema.js";
import { oneChatScope } from "#lib/val/ChatSchema.js";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { RequestHandler } from "./$types";

/**
 * Step 1 of a chat attachment's upload (docs/chat.md, "Attachments"):
 * reserve the row under the chat it was dropped into and return the
 * pathname to upload to, as `/api/files` does for an attachment. Any kind
 * of file goes, "other" included; the filename's extension sets the kind
 * and so the size ceiling (the attachments'), and the bytes are checked at
 * ready (`/api/chat-attachments/<id>/ready`). Anyone who may write in the
 * chat: a member of the song's account or a viewer of its project, any
 * member of the session's account. The reserve also clears the person's
 * stale unsent files (data.ts `createChatAttachment`).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = v.safeParse(ChatAttachmentReserveSchema, await request.json().catch(() => ({})));
	if (!parsed.success) error(400, "songId or sessionId, filename and sizeBytes are required");
	const { songId, sessionId, filename, sizeBytes } = parsed.output;
	if (!oneChatScope({ songId, sessionId })) error(400, "A song or a session, one of them");
	const kind = fileKindOf(filename);
	const refused = sizeCeilingMessage(
		sizeBytes,
		FILE_MAX_BYTES[kind],
		`A ${kind === "other" ? "file" : `${FILE_KIND_LABELS[kind]} file`}`,
	);
	if (refused) error(refused.status, refused.message);

	const { accountId } = sessionId
		? await memberOf(locals, accountOfRecordingSession, sessionId, { viewers: true })
		: await memberOf(locals, accountOfSong, songId, { viewers: true });
	await requireStorageRoom(accountId, sizeBytes);
	const row = await createChatAttachment({
		accountId,
		userId: requireUser(locals).id,
		...(sessionId ? { sessionId } : { songId }),
		filename,
		sizeBytes,
	});
	if (!row) error(404, sessionId ? "Session not found" : "Song not found");
	return Response.json({
		fileId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
