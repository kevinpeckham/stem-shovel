import {
	demosWantingPlayback,
	getSong,
	listComments,
	manifestFor,
	presentSongFiles,
	stemsWantingPlayback,
} from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { scheduleDemoPlayback, schedulePlayback } from "$lib/server/jobs";

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
	// Three independent lookups (file URLs, the manifest, the comments) run together.
	const [presented, manifest, comments] = await Promise.all([
		presentSongFiles(song),
		manifestFor(song),
		listComments(song.id),
	]);
	return {
		song: presented,
		manifest,
		comments,
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
			notes: renderMarkdown(song.notesMarkdown),
		},
	};
}
export type SongView = Awaited<ReturnType<typeof songView>>;
