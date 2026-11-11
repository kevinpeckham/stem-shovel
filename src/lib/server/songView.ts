import {
	demosWantingPeaks,
	demosWantingPlayback,
	getSong,
	listComments,
	listDemoComments,
	listMixComments,
	manifestFor,
	mixesWantingPlayback,
	presentSongFiles,
	stemsWantingMetadata,
	stemsWantingPlayback,
} from "#lib/server/data.js";
import { renderChartHtml, renderScoreChartHtml } from "#lib/server/chartHtml.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import {
	scheduleDemoPeaks,
	scheduleDemoPlayback,
	scheduleMixPlayback,
	schedulePlayback,
	scheduleStemMetadata,
} from "#lib/server/jobs.js";

export type SongRow = NonNullable<Awaited<ReturnType<typeof getSong>>>;

/** The uploaded score the chart was read from, as the Chart tab's Score view shows it. */
export interface ChartScoreFile {
	id: string;
	kind: "pdf" | "image";
	url: string;
	name: string;
}

/**
 * The PDF or image the chart was read from (`chartSource.kind === "file"`),
 * while it is still among the song's ready files: the band's approved
 * chart, which the Score view shows in place of an engraving of the read.
 * Null for any other source, or once the file is gone.
 */
function chartScoreFileOf(
	source: SongRow["chartSource"],
	files: {
		id: string;
		kind: string;
		url: string;
		title: string;
		filename: string;
		status: string;
	}[],
): ChartScoreFile | null {
	if (source?.kind !== "file" || !source.id) return null;
	const f = files.find((x) => x.id === source.id && x.status === "ready");
	if (!f || (f.kind !== "pdf" && f.kind !== "image")) return null;
	return { id: f.id, kind: f.kind, url: f.url, name: f.title || f.filename };
}

/**
 * What a page needs to play, read and download a song: the song with file
 * URLs the browser may fetch, the player manifest, the comments and the
 * rendered documents. The song page and the home page's demos share it.
 * Missing renditions are rendered after the response as a backstop, for
 * the stems loaded (Main's, or the alternate the page asked for).
 */
export async function songView(song: SongRow) {
	schedulePlayback(stemsWantingPlayback(song.stems));
	// A stem with no stored length, peaks or channels (an older upload path): measured in the jobs function.
	scheduleStemMetadata(stemsWantingMetadata(song.stems));
	scheduleDemoPlayback(demosWantingPlayback(song.demos));
	// A demo rendered before the review shipped has an MP3 and no waveform yet: measured in the jobs function.
	scheduleDemoPeaks(demosWantingPeaks(song.demos));
	scheduleMixPlayback(mixesWantingPlayback(song.mixes));
	// Five independent lookups (file URLs, the manifest, the comments, the mixes' and the demos' comments) run together.
	const [presented, manifest, comments, mixComments, demoComments] = await Promise.all([
		presentSongFiles(song),
		manifestFor(song),
		listComments(song.id),
		listMixComments(song.id),
		listDemoComments(song.id),
	]);
	const scoreFile = chartScoreFileOf(song.chartSource, presented.files);
	const chartColumns = song.chartColumns ?? "shared";
	return {
		// The mixes (docs/mixes.md) carry their notes rendered, as the documents are.
		song: {
			...presented,
			mixes: presented.mixes.map((m) => ({ ...m, notesHtml: renderMarkdown(m.notes) })),
			/** Where the chart came from (a score file or the stems), null for the band's own: the Chart tab's source line. */
			chartSource: song.chartSource ?? null,
			/** The PDF or image the chart was read from, still attached: the Score view shows it, and the chart is the plain grid. */
			chartScoreFile: scoreFile,
			/** How the chart sizes its columns (`row` per row, `shared` down a section): drawn here, and the ⋯ menu's switch. */
			chartColumns,
			/** The song's alternate arrangements (docs/arrangements.md), for the switcher; Main is the song itself. */
			arrangements: song.arrangements,
			/** The arrangement whose stems `stems` holds: an alternate's id, or null for Main. */
			arrangementId: song.arrangementId,
		},
		manifest,
		comments,
		/** Feedback on the mixes, every mix's together; the page splits them by `mixId`. */
		mixComments,
		/** Comments on the demo recordings, every demo's together; the Demos view keeps the current demo's. */
		demoComments,
		docs: {
			// A chart read from a PDF or image is the plain grid: the Chart tab's own switch shows the file as its score.
			chart: scoreFile
				? renderChartHtml(song.chartMarkdown, { columns: chartColumns })
				: renderScoreChartHtml(song.chartMarkdown, { columns: chartColumns }),
			lyrics: renderMarkdown(song.lyricsMarkdown),
			notes: renderMarkdown(song.notesMarkdown),
		},
	};
}
export type SongView = Awaited<ReturnType<typeof songView>>;
