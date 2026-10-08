import { command, getRequestEvent } from "$app/server";
import { accountOfFile, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import {
	attachFile as moveFile,
	createDemoFromFile,
	deleteFile as removeFile,
	updateFile as saveFile,
} from "#lib/server/data.js";
import { scheduleDemoPlayback } from "#lib/server/jobs.js";
import { notifyDemo } from "#lib/server/notifications.js";
import { MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
import { MAX_FILES_PER_PROJECT, MAX_FILES_PER_SONG } from "#lib/constants/fileFormats.js";
import {
	SongFileAttachSchema,
	SongFileDeleteSchema,
	SongFileUpdateSchema,
	SongFileUseAsDemoSchema,
} from "#lib/val/SongFileSchema.js";
import { error } from "@sveltejs/kit";

/** An attachment's title and description, and whether it is a score when `isNotation` is sent (docs/uploads-and-blob.md, "Attachments"); an editor of the account. */
export const updateFile = command(
	SongFileUpdateSchema,
	async ({ id, title, description, isNotation }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfFile, id);
		const row = await saveFile(accountId, id, { title, description, isNotation });
		if (!row) error(404, "File not found");
		return { title: row.title, description: row.description, isNotation: row.isNotation };
	},
);

/**
 * A file moved to a song of its project (`songId`), or back to the project
 * level (`songId` null): the project page's library and the song's
 * Attachments tab share the rows (docs/uploads-and-blob.md, "Attachments").
 * The blob stays put; a file leaving a song stops being a score of it.
 * An editor of the account.
 */
export const attachFile = command(SongFileAttachSchema, async ({ id, songId }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const row = await moveFile(accountId, id, songId);
	if (!row) error(404, songId ? "Song not found in this project" : "File not found");
	if (row === "full") {
		error(
			409,
			songId
				? `A song can have at most ${MAX_FILES_PER_SONG} attachments`
				: `A project can have at most ${MAX_FILES_PER_PROJECT} files of its own`,
		);
	}
	return { songId: row.songId, isNotation: row.isNotation };
});

/** The file and its thumbnail gone from the store and the song. */
export const deleteFile = command(SongFileDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	if (!(await removeFile(accountId, id))) error(404, "File not found");
	return { deleted: true };
});

/**
 * An audio attachment becomes a demo of its song: the file is copied to the
 * demo's place in the store, the demo is ready at once and its MP3 renders
 * in the jobs function, as after a demo upload. The attachment stays.
 */
export const useAsDemo = command(SongFileUseAsDemoSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const userId = requireUser(locals).id;
	const row = await createDemoFromFile(accountId, userId, id);
	if (!row) error(404, "Only a ready audio file can be a demo");
	if (row === "full") error(409, `A song can have at most ${MAX_DEMOS_PER_SONG} demo recordings`);
	scheduleDemoPlayback([row.id]);
	background(() => notifyDemo(accountId, row.id, userId));
	return { demoId: row.id };
});
