import { form, getRequestEvent } from "$app/server";
import { updateSong as update } from "$lib/server/data";
import { SongSettingsSchema } from "$lib/val/SongSchema";
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
