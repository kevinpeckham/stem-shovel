import { getSong, manifestFor } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

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
