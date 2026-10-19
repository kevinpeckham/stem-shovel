import { form, getRequestEvent } from "$app/server";
import { parsePosition } from "#lib/audio/measures.js";
import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { notifyComment } from "#lib/server/notifications.js";
import {
	commentOwnership,
	createComment as create,
	deleteComment as remove,
	demoOwnership,
	mixOwnership,
	songGrid,
	updateComment as update,
} from "#lib/server/data.js";
import { parseTime } from "#lib/utils/parseTime.js";
import { CommentCreateSchema, CommentUpdateSchema } from "#lib/val/CommentSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error, invalid } from "@sveltejs/kit";

/**
 * Comments on a song. Any member of the song's account may post; a comment
 * is edited by its author and deleted by its author or an owner / admin.
 * The position is typed in any format (time, timecode, bars) and read
 * against the song's tempo grid here; on a demo recording, which has no
 * grid, it is time.
 */
const POSITION_HELP = "Not a position: use time (1:23.4), timecode (01:23:15.72) or bars (12|3).";
const TIME_HELP = "Not a position: use time, like 1:23.4.";

async function resolvePosition(
	songId: string,
	text: string,
	timeOnly = false,
): Promise<number | null | "invalid"> {
	if (!text) return null;
	if (timeOnly) {
		const seconds = parseTime(text);
		return seconds === null ? "invalid" : seconds;
	}
	const ctx = await songGrid(songId);
	const seconds = ctx ? parsePosition(text, ctx) : null;
	return seconds === null ? "invalid" : seconds;
}

export const createComment = form(
	CommentCreateSchema,
	async ({ songId, mixId, demoId, title, body, position }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		// A viewer may comment: that is what the role is for.
		const { accountId } = await memberOf(locals, accountOfSong, songId, { viewers: true });
		// Feedback on a mix (docs/mixes.md): the mix must be this song's; a demo's comment the same.
		const mix = mixId ? await mixOwnership(mixId) : null;
		if (mixId && mix?.songId !== songId) error(404, "Mix not found");
		const demo = demoId ? await demoOwnership(demoId) : null;
		if (demoId && demo?.songId !== songId) error(404, "Demo not found");
		const at = await resolvePosition(songId, position, !!demoId);
		if (at === "invalid") invalid(issue.position(demoId ? TIME_HELP : POSITION_HELP));
		const row = await create(accountId, songId, user.id, {
			title,
			body,
			at,
			mixId: mixId || "",
			demoId: demoId || "",
		});
		if (!row) error(404, "Song not found");
		background(() =>
			notifyComment(accountId, songId, user.id, mix ?? undefined, demo ?? undefined),
		);
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
		// Still allowed to see the song (a viewer who left the project is not), then the author.
		await memberOf(locals, accountOfSong, own.songId, { viewers: true });
		if (own.userId !== user.id) error(403, "Only the author can edit a comment");
		const at = await resolvePosition(own.songId, position, !!own.demoId);
		if (at === "invalid") invalid(issue.position(POSITION_HELP));
		await update(id, { title, body, at }, user.id);
		return { id };
	},
);

export const deleteComment = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await commentOwnership(id);
	if (!own) error(404, "Comment not found");
	await memberOf(locals, accountOfSong, own.songId, { viewers: true });
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a comment");
	await remove(id);
	return { deleted: true };
});
