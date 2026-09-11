import { form, getRequestEvent } from "$app/server";
import { saveSongDoc, updateSong as update } from "$lib/server/data";
import { SongDocSaveSchema, SongSettingsSchema } from "$lib/val/SongSchema";
import { invalid, redirect } from "@sveltejs/kit";

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
		const { url } = getRequestEvent();
		const [, , projectSlug, currentSlug] = url.pathname.split("/");
		if (result.song.slug !== currentSlug)
			redirect(303, `/projects/${projectSlug}/${result.song.slug}`);
		return { saved: true };
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
