import { songWantsChords } from "./songWantsChords";

/**
 * The ids of a project's songs whose chord-model read is missing or behind
 * the mix (`songWantsChords`): the project page's backstop, so a band's
 * older songs are read as their project is opened, before anyone presses
 * Detect chords on one.
 */
export function songsWantingChords(
	songs: {
		id: string;
		noAi: boolean;
		mixUrl: string | null;
		mixKey: string | null;
		chordsKey: string | null;
		beatsKey: string | null;
		chordsStartedAt: Date | null;
	}[],
	project: { noAi: boolean },
	now = Date.now(),
): string[] {
	return songs.filter((s) => songWantsChords({ ...s, project }, now)).map((s) => s.id);
}
