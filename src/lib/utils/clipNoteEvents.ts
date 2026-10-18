import type { StudioClip } from "#lib/val/StudioSchema.js";

/** A note of a MIDI clip on the song's clock. */
export interface ClipNoteEvent {
	/** Song seconds. */
	at: number;
	duration: number;
	pitch: number;
	/** The note's velocity scaled by the clip's gain, at most 1. */
	velocity: number;
}

/**
 * The notes of a MIDI clip as the engine plays them (studio.svelte.ts,
 * `#queueMidi`): a note at `t` seconds into the clip's content sounds at
 * `start + (t − offset)`, never before the clip's start, never at or past
 * its end, cut short at the end. Only those in [from, to) when a window
 * is given. Sorted by time. The offline render feeds the instruments
 * from this (audio/midiRender.ts); the DAWproject writes the same notes.
 */
export function clipNoteEvents(
	clip: Pick<StudioClip, "notes" | "start" | "offset" | "duration" | "gain">,
	from = 0,
	to: number | null = null,
): ClipNoteEvent[] {
	if (!clip.notes?.length) return [];
	const clipEnd = clip.start + clip.duration;
	const ends = to === null ? clipEnd : Math.min(clipEnd, to);
	const origin = clip.start - clip.offset;
	const out: ClipNoteEvent[] = [];
	for (const n of clip.notes) {
		const at = origin + n.t;
		if (at < clip.start || at < from || at >= ends) continue;
		out.push({
			at,
			duration: Math.max(0.001, Math.min(n.d, ends - at)),
			pitch: n.p,
			velocity: Math.min(1, n.v * clip.gain),
		});
	}
	return out.sort((a, b) => a.at - b.at);
}
