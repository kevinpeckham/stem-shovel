/** Where one song of an admin chord batch stands: not yet claimed, claimed by the job, or read. */
export type ChordReadState = "waiting" | "reading" | "done";

/**
 * The state from the song's chord columns: done when the chords and the
 * tracker's beats were read from the current mix, reading while the job's claim is fresh (younger
 * than `staleMs`), else waiting.
 */
export function chordReadState(
	row: {
		chordsKey: string | null;
		beatsKey: string | null;
		mixKey: string | null;
		chordsStartedAt: Date | null;
	},
	now: number,
	staleMs: number,
): ChordReadState {
	if (row.chordsKey != null && row.chordsKey === row.mixKey && row.beatsKey === row.mixKey)
		return "done";
	if (row.chordsStartedAt && row.chordsStartedAt.getTime() >= now - staleMs) return "reading";
	return "waiting";
}
