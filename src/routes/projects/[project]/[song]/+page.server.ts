import { deleteSong, deleteStem, getSong, manifestFor } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { formString } from "$lib/server/form";
import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const song = await getSong(locals.account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	return {
		song,
		manifest: manifestFor(song),
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
		},
	};
};

export const actions: Actions = {
	deleteStem: async ({ request, locals }) => {
		const id = formString(await request.formData(), "id");
		if (id) await deleteStem(locals.account.id, id);
	},
	delete: async ({ params, locals }) => {
		const song = await getSong(locals.account.id, params.project, params.song);
		if (!song) error(404);
		await deleteSong(locals.account.id, song.id);
		redirect(303, `/projects/${params.project}`);
	},
};
