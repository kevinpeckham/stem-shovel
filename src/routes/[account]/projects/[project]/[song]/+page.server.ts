import { demosWantingPlayback, getSong, manifestFor, stemsWantingPlayback } from "$lib/server/data";
import { scheduleDemoPlayback, schedulePlayback } from "$lib/server/transcode";
import { renderMarkdown } from "$lib/server/markdown";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { PageServerLoad } from "./$types";

/** Missing renditions render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent }) => {
	const { account } = await parent();
	const song = await getSong(account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	// Backstop for renditions the upload request did not finish (or predating them).
	schedulePlayback(stemsWantingPlayback(song.stems));
	scheduleDemoPlayback(demosWantingPlayback(song.demos));
	return {
		song,
		manifest: manifestFor(song),
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
		},
	};
};
