import { accountOfEvent, memberOf, requireUser } from "#lib/server/access.js";
import { createEventFile, eventKindOf } from "#lib/server/data.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { MAX_EVENT_PHOTOS, type EventFileKind } from "#lib/constants/eventFiles.js";
import { FILE_KIND_LABELS, FILE_MAX_BYTES, fileKindOf } from "#lib/constants/fileFormats.js";
import { eventFileKindAllows } from "#lib/utils/eventFileKindAllows.js";
import { sizeCeilingMessage } from "#lib/utils/sizeCeilingMessage.js";
import { EventFileReserveSchema } from "#lib/val/EventFileSchema.js";
import { requireStorageRoom } from "#lib/server/requireStorageRoom.js";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { RequestHandler } from "./$types";

/** 415 for a file the kind does not take, 413 over its kind's ceiling, 400 for a size that is not one. */
function checkEventFile(kind: EventFileKind, filename: string, sizeBytes: number) {
	const fileKind = fileKindOf(filename);
	if (!eventFileKindAllows(kind, fileKind)) {
		error(415, kind === "poster" ? "A poster is a PDF or an image" : "A photo is an image");
	}
	const label = FILE_KIND_LABELS[fileKind];
	const refused = sizeCeilingMessage(
		sizeBytes,
		FILE_MAX_BYTES[fileKind],
		`${/^[AEIOU]/.test(label) ? "An" : "A"} ${label} file`,
	);
	if (refused) error(refused.status, refused.message);
}

/**
 * Step 1 of a poster's or photo's upload (docs/band-plan.md, "Posters,
 * pictures and video"): reserve the row under the event and return the
 * pathname to upload to, as `/api/files` does for an attachment. A poster
 * is a PDF or an image, a photo an image, by the filename's extension, which
 * also sets the size ceiling (the attachments'); the bytes are checked at
 * ready (`/api/event-files/<id>/ready`). An editor of the event's account.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const parsed = v.safeParse(EventFileReserveSchema, await request.json().catch(() => ({})));
	if (!parsed.success) error(400, "kind, filename and sizeBytes are required");
	const { kind, filename, sizeBytes } = parsed.output;
	checkEventFile(kind, filename, sizeBytes);

	const { accountId } = await memberOf(locals, accountOfEvent, params.id);
	await requireStorageRoom(accountId, sizeBytes);
	const row = await createEventFile({
		accountId,
		userId: requireUser(locals).id,
		eventId: params.id,
		kind,
		filename,
		sizeBytes,
	});
	if (!row) error(404, "Not found");
	if (row === "full") {
		const noun = (await eventKindOf(accountId, params.id)) === "practice" ? "practice" : "show";
		error(409, `A ${noun} can have at most ${MAX_EVENT_PHOTOS} photos`);
	}
	return Response.json({
		fileId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
	});
};
