import { SONG_CHANGE_KINDS, type SongChangeKind } from "$lib/constants/songChanges";
import type { SongChange } from "$lib/val/SongChangeSchema";

/**
 * The kinds worth a timeline lane: a kind with a single change at 0:00 is
 * the song's fixed tempo / key / meter (the header shows it), not a change.
 */
export function timelineKinds(changes: SongChange[]): SongChangeKind[] {
	return SONG_CHANGE_KINDS.filter((kind) => {
		const of = changes.filter((c) => c.kind === kind);
		return of.length > 1 || (of.length === 1 && of[0].start > 0);
	});
}
