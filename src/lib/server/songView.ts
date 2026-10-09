import {
	demosWantingPlayback,
	getSong,
	listComments,
	listMixComments,
	manifestFor,
	mixesWantingPlayback,
	presentSongFiles,
	stemsWantingPlayback,
} from "#lib/server/data.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { scheduleDemoPlayback, scheduleMixPlayback, schedulePlayback } from "#lib/server/jobs.js";

export type SongRow = NonNullable<Awaited<ReturnType<typeof getSong>>>;

/**
 * What a page needs to play, read and download a song: the song with file
 * URLs the browser may fetch, the player manifest, the comments and the
 * rendered documents. The song page and the home page's demos share it.
 * Missing renditions are rendered after the response as a backstop.
 */
export async function songView(song: SongRow) {
	schedulePlayback(stemsWantingPlayback(song.stems));
	scheduleDemoPlayback(demosWantingPlayback(song.demos));
	scheduleMixPlayback(mixesWantingPlayback(song.mixes));
	// Four independent lookups (file URLs, the manifest, the comments, the mixes' comments) run together.
	const [presented, manifest, comments, mixComments] = await Promise.all([
		presentSongFiles(song),
		manifestFor(song),
		listComments(song.id),
		listMixComments(song.id),
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
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
			notes: renderMarkdown(song.notesMarkdown),
		},
	};
}
export type SongView = Awaited<ReturnType<typeof songView>>;
