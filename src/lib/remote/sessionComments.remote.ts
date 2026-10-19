import { form, getRequestEvent } from "$app/server";
import { accountOfSessionRecording, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { notifySessionComment } from "#lib/server/notifications.js";
import {
	createSessionComment as create,
	deleteSessionComment as remove,
	sessionCommentOwnership,
	updateSessionComment as update,
} from "#lib/server/data.js";
import { parseTime } from "#lib/utils/parseTime.js";
import {
	SessionCommentCreateSchema,
	SessionCommentUpdateSchema,
} from "#lib/val/SessionCommentSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error, invalid } from "@sveltejs/kit";

/**
 * Comments on a session's recordings (docs/uploads-and-blob.md, "Sessions"
 * review). Any member of the account may post; a comment is edited by its
 * author and deleted by its author or an owner / admin. A position is
 * time ("1:23.4"): a recording has no tempo grid.
 */
const POSITION_HELP = "Not a position: use time, like 1:23.4.";

function resolvePosition(text: string): number | null | "invalid" {
	if (!text) return null;
	const seconds = parseTime(text);
	return seconds === null ? "invalid" : seconds;
}

export const createSessionComment = form(
	SessionCommentCreateSchema,
	async ({ recordingId, title, body, position }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfSessionRecording, recordingId, {
			viewers: true,
		});
		const at = resolvePosition(position);
		if (at === "invalid") invalid(issue.position(POSITION_HELP));
		const row = await create(accountId, recordingId, user.id, { title, body, at });
		if (!row) error(404, "Recording not found");
		background(() => notifySessionComment(accountId, recordingId, user.id));
		return { id: row.id };
	},
);

export const updateSessionComment = form(
	SessionCommentUpdateSchema,
	async ({ id, title, body, position }, issue) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const own = await sessionCommentOwnership(id);
		if (!own) error(404, "Comment not found");
		await memberOf(locals, accountOfSessionRecording, own.recordingId, { viewers: true });
		if (own.userId !== user.id) error(403, "Only the author can edit a comment");
		const at = resolvePosition(position);
		if (at === "invalid") invalid(issue.position(POSITION_HELP));
		await update(id, { title, body, at });
		return { id };
	},
);

export const deleteSessionComment = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await sessionCommentOwnership(id);
	if (!own) error(404, "Comment not found");
	await memberOf(locals, accountOfSessionRecording, own.recordingId, { viewers: true });
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a comment");
	await remove(id);
	return { deleted: true };
});
