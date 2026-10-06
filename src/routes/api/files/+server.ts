import { accountOfProject, accountOfSong, memberOf, requireUser } from "$lib/server/access";
import { createFile, projectOfSong, storageRoom } from "$lib/server/data";
import { formatBytes } from "$lib/utils/formatBytes";
import { background } from "$lib/server/background";
import { checkStorage } from "$lib/server/notifications";
import {
	FILE_KIND_LABELS,
	FILE_MAX_BYTES,
	MAX_FILES_PER_PROJECT,
	MAX_FILES_PER_SONG,
	fileKindOf,
} from "$lib/constants/fileFormats";
import { accessOfPathname } from "$lib/server/relocate";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Step 1 of an attachment upload (docs/uploads-and-blob.md, "Attachments"):
 * reserve the row and return the pathname to upload to. With `songId` the
 * file is the song's (its project follows); with `projectId` alone it is
 * the project's own, for the project page's library. The kind comes from
 * the filename's extension and sets the size ceiling; `notation` marks a
 * song's PDF or image as a score and is ignored for the other kinds and
 * at the project level.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		songId?: string;
		projectId?: string;
		filename?: string;
		sizeBytes?: number;
		/** The file is a score: listed on the Chart tab's notation view as well (PDFs and images only). */
		notation?: boolean;
	};
	const { songId, filename, sizeBytes } = body;
	if ((!songId && !body.projectId) || !filename || typeof sizeBytes !== "number") {
		error(400, "songId or projectId, filename and sizeBytes are required");
	}
	const kind = fileKindOf(filename);
	if (sizeBytes <= 0) error(400, "The file is empty");
	if (sizeBytes > FILE_MAX_BYTES[kind]) {
		const what = kind === "other" ? "file" : `${FILE_KIND_LABELS[kind]} file`;
		error(413, `A ${what} can be up to ${formatBytes(FILE_MAX_BYTES[kind])}`);
	}

	const { accountId } = songId
		? await memberOf(locals, accountOfSong, songId)
		: await memberOf(locals, accountOfProject, body.projectId!);
	const projectId = songId ? (await projectOfSong(accountId, songId))?.projectId : body.projectId!;
	if (!projectId) error(404, "Song not found");
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
	const row = await createFile({
		accountId,
		userId: requireUser(locals).id,
		projectId,
		songId: songId ?? null,
		filename,
		sizeBytes,
		kind,
		isNotation: body.notation === true && (kind === "pdf" || kind === "image"),
	});
	if (!row) error(404, songId ? "Song not found" : "Project not found");
	if (row === "full") {
		error(
			409,
			songId
				? `A song can have at most ${MAX_FILES_PER_SONG} attachments`
				: `A project can have at most ${MAX_FILES_PER_PROJECT} files of its own`,
		);
	}
	return json({
		fileId: row.id,
		pathname: row.pathname,
		access: await accessOfPathname(row.pathname),
		kind: row.kind,
	});
};
