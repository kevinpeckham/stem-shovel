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
import { renderMarkdown } from "#lib/server/markdown.js";
import {
	scheduleDemoPeaks,
	scheduleDemoPlayback,
	scheduleMixPlayback,
	schedulePlayback,
	scheduleStemMetadata,
} from "#lib/server/jobs.js";

export type SongRow = NonNullable<Awaited<ReturnType<typeof getSong>>>;

/**
 * What a page needs to play, read and download a song: the song with file
 * URLs the browser may fetch, the player manifest, the comments and the
 * rendered documents. The song page and the home page's demos share it.
 * Missing renditions are rendered after the response as a backstop.
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
	return {
		// The mixes (docs/mixes.md) carry their notes rendered, as the documents are.
		song: {
			...presented,
			mixes: presented.mixes.map((m) => ({ ...m, notesHtml: renderMarkdown(m.notes) })),
		},
		manifest,
		comments,
		/** Feedback on the mixes, every mix's together; the page splits them by `mixId`. */
		mixComments,
		/** Comments on the demo recordings, every demo's together; the Demos view keeps the current demo's. */
		demoComments,
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
			notes: renderMarkdown(song.notesMarkdown),
		},
	};
}
export type SongView = Awaited<ReturnType<typeof songView>>;
