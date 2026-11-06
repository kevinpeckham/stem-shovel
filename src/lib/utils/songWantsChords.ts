import { CHORDS_STALE_MS } from "#lib/constants/chordsStale.js";

/**
 * Whether a song's chords from the chord model (src/lib/server/chords.ts)
 * are missing or behind its mix: the page-side check before posting a
 * chords job, the same rules `ensureSongChords` applies, minus the claim.
 * A run that started within CHORDS_STALE_MS is presumed in flight.
 */
export function songWantsChords(
	song: {
		noAi: boolean;
		mixUrl: string | null;
		mixKey: string | null;
		chordsKey: string | null;
		chordsStartedAt: Date | null;
		project: { noAi: boolean };
	},
	now = Date.now(),
): boolean {
	if (song.noAi || song.project.noAi) return false;
	if (!song.mixUrl || !song.mixKey) return false;
	if (song.chordsStartedAt && now - song.chordsStartedAt.getTime() < CHORDS_STALE_MS) return false;
	return song.chordsKey !== song.mixKey;
}
