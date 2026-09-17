import {
	demosWantingPlayback,
	getSong,
	listComments,
	manifestFor,
	presentSongFiles,
	stemsWantingPlayback,
} from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { scheduleDemoPlayback, schedulePlayback } from "$lib/server/transcode";

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
	return {
		song: await presentSongFiles(song),
		manifest: await manifestFor(song),
		comments: await listComments(song.id),
		docs: {
			chart: renderMarkdown(song.chartMarkdown),
			lyrics: renderMarkdown(song.lyricsMarkdown),
			notes: renderMarkdown(song.notesMarkdown),
		},
	};
}
export type SongView = Awaited<ReturnType<typeof songView>>;
