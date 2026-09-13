import type { SongChange } from "$lib/val/SongChangeSchema";

/** How a change reads on the timeline: "120 bpm", "F#m", "6/8". */
export function formatSongChange(c: SongChange): string {
	return c.kind === "tempo" ? `${c.value} bpm` : c.value;
}
