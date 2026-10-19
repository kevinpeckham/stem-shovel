import { command, getRequestEvent, query } from "$app/server";
import { requireStudioAccess, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import {
	createStudioComment as create,
	deleteStudioComment as remove,
	listStudioComments,
	studioCommentOwner,
} from "#lib/server/data.js";
import { notifyStudioComment } from "#lib/server/notifications.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { StudioCommentCreateSchema } from "#lib/val/StudioSchema.js";
import { error } from "@sveltejs/kit";

/**
 * Comments on a Dawn song (docs/dawn-daw-plan.md, D7): anyone who may work
 * on the song (its creator, or the band when it is shared) reads and
 * posts; a comment is deleted by its author or an owner / admin of the
 * account. A comment may pin a moment in the song.
 */
const access = (ideaId: string) => requireStudioAccess(getRequestEvent().locals, ideaId);

export const studioComments = query(IdSchema, async ({ id }) => {
	const { accountId } = await access(id);
	return listStudioComments(accountId, id);
});

export const createStudioComment = command(
	StudioCommentCreateSchema,
	async ({ ideaId, body, at }) => {
		const { accountId, userId } = await access(ideaId);
		const made = await create(accountId, ideaId, userId, { body, at });
		if (!made) error(404, "Song not found");
		background(() => notifyStudioComment(accountId, ideaId, userId));
		return made;
	},
);

export const deleteStudioComment = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await studioCommentOwner(id);
	if (!own) error(404, "Comment not found");
	await access(own.ideaId);
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a comment");
	return { deleted: await remove(own.accountId, id) };
});
