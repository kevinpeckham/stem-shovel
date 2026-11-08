import { viewableDocumentationSong } from "#lib/server/songViewGate.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import { chartMidi } from "#lib/utils/chartMidi.js";
import { songChartTempo } from "#lib/utils/songChartTempo.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A song's chord chart as a Standard MIDI File (docs/uploads-and-blob.md,
 * "Documentation downloads"): `@barmark/midi` plays the barmark text's play
 * order as block chords, timed by the chart's `tempo:` or else the song's
 * declared tempo, sent as an attachment named after the song. Viewable like
 * the song itself: a private one needs membership or a share code (the
 * cookie rides along). A song with no chart, or a chart with errors to fix
 * first, is a 404, as is one that does not exist.
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const song = await viewableDocumentationSong(params.id, { locals, url, cookies });
	const bytes = chartMidi(song.chartMarkdown, song.title, songChartTempo(song.changes));
	if (!bytes) {
		error(
			404,
			"This song has no chart to export yet: write its bars between pipes, as | F | C7 |, and fix any errors the Chart tab lists.",
		);
	}
	return new Response(new Uint8Array(bytes), {
		headers: {
			"content-type": "audio/midi",
			"content-length": String(bytes.byteLength),
			"content-disposition": attachmentDisposition(`${song.title}.mid`),
			"cache-control": "private, no-store",
		},
	});
};
