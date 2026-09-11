import { command, form, getRequestEvent } from "$app/server";
import {
	createSong as create,
	deleteSong as removeSong,
	deleteStem as removeStem,
	projectSlug,
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

/** Who is acting. Until sign-in exists this is the seeded owner (hooks.server.ts). */
function requireAccount() {
	const { locals } = getRequestEvent();
	return { accountId: locals.account.id, userId: locals.user.id };
}

/**
 * Song settings: title, URL slug and description. Same shape as the project
 * form: schema validates the fields, the handler reports uniqueness through
 * `invalid()`, and a slug change redirects to the song's new address.
 */
export const updateSong = form(
	SongSettingsSchema,
	async ({ id, title, slug, description }, issue) => {
		const { accountId } = requireAccount();
		const result = await update(accountId, id, { title, slug, description });
		if (!result.ok) invalid(issue[result.field](result.error));
		// Land on the (possibly new) address; derived from data, not the request URL.
		const slugs = await songSlugs(accountId, id);
		if (!slugs) error(404, "Song not found");
		redirect(303, `/projects/${slugs.project}/${slugs.song}`);
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
		const { accountId, userId } = requireAccount();
		const result = await saveSongDoc(accountId, userId, songId, kind, markdown, {
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
	const { accountId, userId } = requireAccount();
	const slug = await projectSlug(accountId, projectId);
	if (!slug) error(404, "Project not found");
	const row = await create(accountId, userId, projectId, title);
	redirect(303, `/projects/${slug}/${row.slug}`);
});

/** Deletes the song, its stems and their blobs; lands on the project. */
export const deleteSong = form(IdSchema, async ({ id }) => {
	const { accountId } = requireAccount();
	const slugs = await songSlugs(accountId, id);
	if (!slugs) error(404, "Song not found");
	await removeSong(accountId, id);
	redirect(303, `/projects/${slugs.project}`);
});

/** Deletes one stem and its blob. Used with `.for(stem.id)` in the Files list. */
export const deleteStem = form(IdSchema, async ({ id }) => {
	const { accountId } = requireAccount();
	if (!(await removeStem(accountId, id))) error(404, "Stem not found");
	return { deleted: true };
});

/** Relabels a stem. A command (not a form): called from the row menu's prompt. */
export const renameStem = command(StemRenameSchema, async ({ id, label }) => {
	const { accountId } = requireAccount();
	const row = await rename(accountId, id, label);
	if (!row) error(404, "Stem not found");
	return row;
});
