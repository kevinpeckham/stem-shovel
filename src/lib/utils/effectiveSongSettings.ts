import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** A song's tempo, key and time signature changes with its start of bar 1 and its end, in seconds. */
export interface SongTimeSettings {
	changes: SongChange[];
	startAt: number | null;
	endAt: number | null;
}

/** An alternate arrangement's own settings: `changes` null while it uses the song's. */
export interface ArrangementTimeSettings {
	changes: SongChange[] | null;
	startAt: number | null;
	endAt: number | null;
}

/**
 * The settings in force for an arrangement (docs/arrangements.md, "Settings
 * of its own"): the song's for Main (`arrangement` null) and for an
 * alternate that inherits them (`changes` null), else the alternate's own
 * three, whatever the song's are; `own` says which.
 */
export function effectiveSongSettings(
	song: SongTimeSettings,
	arrangement: ArrangementTimeSettings | null,
): SongTimeSettings & { own: boolean } {
	if (!arrangement?.changes) {
		return { changes: song.changes, startAt: song.startAt, endAt: song.endAt, own: false };
	}
	return {
		changes: arrangement.changes,
		startAt: arrangement.startAt,
		endAt: arrangement.endAt,
		own: true,
	};
}
