import { form, getRequestEvent } from "$app/server";
import { parsePosition } from "$lib/audio/measures";
import { accountOfSong, memberOf, requireUser } from "$lib/server/access";
import {
	commentOwnership,
	createComment as create,
	deleteComment as remove,
	songGrid,
	updateComment as update,
} from "$lib/server/data";
import { CommentCreateSchema, CommentUpdateSchema } from "$lib/val/CommentSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { error, invalid } from "@sveltejs/kit";

/**
 * Comments on a song. Any member of the song's account may post; a comment
 * is edited by its author and deleted by its author or an owner / admin.
 * The position is typed in any format (time, timecode, bars) and read
 * against the song's tempo grid here.
 */
const POSITION_HELP = "Not a position: use time (1:23.4), timecode (01:23:15.72) or bars (12|3).";

async function resolvePosition(songId: string, text: string): Promise<number | null | "invalid"> {
	if (!text) return null;
	const ctx = await songGrid(songId);
	const seconds = ctx ? parsePosition(text, ctx) : null;
	return seconds === null ? "invalid" : seconds;
}

export const createComment = form(
	CommentCreateSchema,
	async ({ songId, title, body, position }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfSong, songId);
		const at = await resolvePosition(songId, position);
		if (at === "invalid") invalid(issue.position(POSITION_HELP));
		const row = await create(accountId, songId, user.id, { title, body, at });
		if (!row) error(404, "Song not found");
		return { id: row.id };
	},
);

export const updateComment = form(
	CommentUpdateSchema,
	async ({ id, title, body, position }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const own = await commentOwnership(id);
		if (!own) error(404, "Comment not found");
		if (own.userId !== user.id) error(403, "Only the author can edit a comment");
		const at = await resolvePosition(own.songId, position);
		if (at === "invalid") invalid(issue.position(POSITION_HELP));
		await update(id, { title, body, at });
		return { id };
	},
);

export const deleteComment = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await commentOwnership(id);
	if (!own) error(404, "Comment not found");
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a comment");
	await remove(id);
	return { deleted: true };
});
