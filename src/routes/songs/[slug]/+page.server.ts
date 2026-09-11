import { deleteSong, loadSong } from "$lib/server/blob";
import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const manifest = await loadSong(params.slug);
	if (!manifest) error(404, `No stems found for "${params.slug}"`);
	return { manifest, slug: params.slug };
};

export const actions: Actions = {
	delete: async ({ params }) => {
		await deleteSong(params.slug);
		redirect(303, "/songs");
	},
};
