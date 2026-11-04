import { songForDocumentation } from "#lib/server/data.js";
import { requireSongView } from "#lib/server/songViewGate.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import { chartMusicXml } from "#lib/utils/chartMusicXml.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A song's chord chart as MusicXML 4.0 (docs/uploads-and-blob.md,
 * "Documentation downloads"): `@barmark/musicxml` writes the barmark text as
 * a score that MuseScore, Dorico, Sibelius and Finale open, with the chart's
 * bars, chords, repeats, sections and parts, sent as an attachment named
 * after the song. Viewable like the song itself: a private one needs
 * membership or a share code (the cookie rides along). A song with no chart,
 * or a chart with errors to fix first, is a 404, as is one that does not
 * exist.
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const song = await songForDocumentation(params.id);
	if (!song) error(404, "Not found");
	await requireSongView(song, song.accountId, { locals, url, cookies });
	const xml = chartMusicXml(song.chartMarkdown, song.title);
	if (!xml) {
		error(
			404,
			"This song has no chart to export yet: write its bars between pipes, as | F | C7 |, and fix any errors the Chart tab lists.",
		);
	}
	const bytes = new TextEncoder().encode(xml);
	return new Response(bytes, {
		headers: {
			"content-type": "application/vnd.recordare.musicxml+xml; charset=utf-8",
			"content-length": String(bytes.byteLength),
			"content-disposition": attachmentDisposition(`${song.title}.musicxml`),
			"cache-control": "private, no-store",
		},
	});
};
