import { command, form, getRequestEvent } from "$app/server";
import { accountOfProject, accountOfSong, accountOfStem, memberOf } from "$lib/server/access";
import {
	createSong as create,
	deleteSong as removeSong,
	deleteStem as removeStem,
	projectSlugs,
	renameStem as rename,
	saveSongDoc,
	songSlugs,
	updateSong as update,
} from "$lib/server/data";
import {
	IdSchema,
	SongCreateSchema,
	SongDocSaveSchema,
	SongSettingsSchema,
	StemRenameSchema,
} from "$lib/val/SongSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Song mutations. The account is never taken from the request: each handler
 * looks up the entity's account and checks the caller's membership
 * (src/lib/server/access.ts), then scopes the data call by it.
 */

/** Title, URL slug and description; a slug change redirects to the new address. */
export const updateSong = form(
	SongSettingsSchema,
	async ({ id, title, slug, description }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, id);
		const result = await update(accountId, id, { title, slug, description });
		if (!result.ok) invalid(issue[result.field](result.error));
		const slugs = await songSlugs(accountId, id);
		if (!slugs) error(404, "Song not found");
		redirect(303, `/${slugs.account}/projects/${slugs.project}/${slugs.song}`);
	},
);

/**
 * Save a song document (chart or lyrics) from the editor. Returns the new
 * version number; a no-op save reports `changed: false`. Blanking a document
 * that has content is refused once (`needsConfirm`) so a second submit with
 * `confirmEmpty` is required.
 */
export const saveDoc = form(
	SongDocSaveSchema,
	async ({ songId, kind, markdown, confirmEmpty }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, songId);
		const result = await saveSongDoc(accountId, locals.user.id, songId, kind, markdown, {
			confirmEmpty: confirmEmpty === "true",
		});
		if (!result.ok) {
			if (result.needsConfirm) return { needsConfirm: true as const, error: result.error };
			invalid(issue.markdown(result.error));
		}
		return { version: result.version, changed: result.changed };
	},
);

/** New song in a project; lands on its page. */
export const createSong = form(SongCreateSchema, async ({ projectId, title }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, projectId);
	const slugs = await projectSlugs(accountId, projectId);
	if (!slugs) error(404, "Project not found");
	const row = await create(accountId, locals.user.id, projectId, title);
	redirect(303, `/${slugs.account}/projects/${slugs.project}/${row.slug}`);
});

/** Deletes the song, its stems and their blobs; lands on the project. */
export const deleteSong = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const slugs = await songSlugs(accountId, id);
	if (!slugs) error(404, "Song not found");
	await removeSong(accountId, id);
	redirect(303, `/${slugs.account}/projects/${slugs.project}`);
});

/** Deletes one stem and its blob. Used with `.for(stem.id)` in the row menu. */
export const deleteStem = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	if (!(await removeStem(accountId, id))) error(404, "Stem not found");
	return { deleted: true };
});

/** Relabels a stem. A command (not a form): called from the row menu's prompt. */
export const renameStem = command(StemRenameSchema, async ({ id, label }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	const row = await rename(accountId, id, label);
	if (!row) error(404, "Stem not found");
	return row;
});
