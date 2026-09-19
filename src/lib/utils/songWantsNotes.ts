import { NOTES_STALE_MS } from "$lib/constants/notesStale";
import type { PlaybackStatus } from "$lib/val/PlaybackStatusSchema";

/**
 * Whether a song's notes (src/lib/server/notes.ts) are missing, behind its
 * stems, or stuck: the page-side check before posting a notes job, the same
 * rules `ensureSongNotes` applies, minus the claim. A run that started
 * within NOTES_STALE_MS is presumed in flight and left alone.
 */
export function songWantsNotes(
	song: {
		noAi: boolean;
		notesKey: string | null;
		notesDoneSeconds: number;
		notesStartedAt: Date | null;
		project: { noAi: boolean };
		stems: {
			id: string;
			status: string;
			url: string;
			playbackStatus: PlaybackStatus | null;
			playbackUrl: string | null;
			gain: number;
			durationSeconds: number | null;
		}[];
	},
	keyOf: (stems: (typeof song)["stems"]) => string,
	now = Date.now(),
): boolean {
	if (song.noAi || song.project.noAi) return false;
	const stems = song.stems.filter((s) => s.status === "ready" && s.url);
	if (stems.length === 0 || stems.some((s) => s.playbackStatus === "pending")) return false;
	const duration = Math.max(...stems.map((s) => s.durationSeconds ?? 0));
	if (duration <= 0) return false;
	if (song.notesStartedAt && now - song.notesStartedAt.getTime() < NOTES_STALE_MS) return false;
	return song.notesKey !== keyOf(stems) || song.notesDoneSeconds < duration;
}
