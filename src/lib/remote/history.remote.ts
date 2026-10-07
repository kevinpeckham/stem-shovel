import { command, getRequestEvent, query } from "$app/server";
import { accountOfSong, memberOf, requireUser, songViewerOf } from "$lib/server/access";
import {
	commentOwnership,
	commentVersionById,
	docVersionById,
	listCommentVersions,
	listDocVersions,
	saveSongDoc,
	saveUserNote,
	updateComment,
} from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { withSongMentions } from "$lib/server/songMentions";
import { isAccountAdmin } from "$lib/server/viewAccess";
import {
	CommentHistorySchema,
	CommentVersionRestoreSchema,
	DocHistorySchema,
	DocVersionRestoreSchema,
} from "$lib/val/HistorySchema";
import { MY_NOTES_KIND } from "$lib/val/SongDocKindSchema";
import { error } from "@sveltejs/kit";

/**
 * Version history of the song page's texts (docs/security.md, "Roles"):
 * the shared chart, lyrics and notes and the comments are read by anyone
 * signed in who may view the song (`songViewerOf`: members and project
 * viewers, or a share code the visitor carries); a private note's history
 * answers only to its owner. Restoring takes the permission of saving:
 * editor for a shared document, the owner for "mynotes", the author or an
 * account admin for a comment. A restore goes through the same save as an
 * edit, so the text it replaces becomes a revision in turn.
 */

/**
 * A document's saved revisions, newest first, at most ten: the markdown and
 * its rendering (made here, never stored twice), when and by whom. For
 * "mynotes" only the caller's own rows.
 */
export const docHistory = query(DocHistorySchema, async ({ songId, kind }) => {
	const { locals } = getRequestEvent();
	const { userId } = await songViewerOf(locals, songId);
	const rows = await listDocVersions(songId, kind, kind === MY_NOTES_KIND ? userId : null);
	return {
		versions: rows.map((r) => ({
			id: r.id,
			versionNumber: r.versionNumber,
			markdown: r.markdown,
			html: renderMarkdown(r.markdown),
			createdAt: r.createdAt,
			createdBy: r.createdBy,
		})),
	};
});

/**
 * Makes a revision the current text again, through the same save as the
 * editor's (`saveDoc`): it becomes a new revision, mentions are linked in
 * the answered `html`, and a revision identical to the current text changes
 * nothing (`changed: false`). An empty revision is restored without the
 * wipe guard: choosing it is the confirmation.
 */
export const restoreDocVersion = command(
	DocVersionRestoreSchema,
	async ({ songId, kind, versionId }) => {
		const { locals } = getRequestEvent();
		const opts = { confirmEmpty: true };
		if (kind === MY_NOTES_KIND) {
			const { accountId, userId } = await songViewerOf(locals, songId);
			const revision = await docVersionById(songId, kind, userId, versionId);
			if (!revision) error(404, "Revision not found");
			const result = await saveUserNote(
				songId,
				userId,
				accountId,
				revision.markdown,
				undefined,
				opts,
			);
			if (!result.ok) error(400, result.error);
			return {
				version: result.version,
				changed: result.changed,
				html: await withSongMentions(accountId, songId, result.html ?? ""),
			};
		}
		const { accountId } = await memberOf(locals, accountOfSong, songId);
		const revision = await docVersionById(songId, kind, null, versionId);
		if (!revision) error(404, "Revision not found");
		const result = await saveSongDoc(
			accountId,
			requireUser(locals).id,
			songId,
			kind,
			revision.markdown,
			opts,
		);
		if (!result.ok) error(400, result.error);
		return {
			version: result.version,
			changed: result.changed,
			html: await withSongMentions(accountId, songId, renderMarkdown(revision.markdown)),
		};
	},
);

/** The texts a comment had before each edit, newest first, with who replaced them. */
export const commentHistory = query(CommentHistorySchema, async ({ commentId }) => {
	const { locals } = getRequestEvent();
	const own = await commentOwnership(commentId);
	if (!own) error(404, "Comment not found");
	await songViewerOf(locals, own.songId);
	return { versions: await listCommentVersions(commentId) };
});

/**
 * Puts a revision's title, body and position back on the comment, through
 * `updateComment`, so what it replaces becomes a revision. The author or an
 * owner / admin of the account, as for deleting.
 */
export const restoreCommentVersion = command(
	CommentVersionRestoreSchema,
	async ({ commentId, versionId }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const own = await commentOwnership(commentId);
		if (!own) error(404, "Comment not found");
		// Still allowed to see the song, then the author or an admin.
		await memberOf(locals, accountOfSong, own.songId, { viewers: true });
		const membership = locals.memberships.find((m) => m.accountId === own.accountId);
		if (own.userId !== user.id && !isAccountAdmin(membership?.role ?? null))
			error(403, "Only the author or an admin can restore a comment");
		const revision = await commentVersionById(commentId, versionId);
		if (!revision) error(404, "Revision not found");
		await updateComment(
			commentId,
			{ title: revision.title, body: revision.body, at: revision.at },
			user.id,
		);
		return { ok: true as const };
	},
);
