import type { StudioClip } from "#lib/val/StudioSchema.js";
import { clipSegments } from "./clipSegments";

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
 * its end, cut short at the end; a looped clip's notes sound in every
 * pass. Only those in [from, to) when a window is given. Sorted by time. The offline render feeds the instruments
 * from this (audio/midiRender.ts); the DAWproject writes the same notes.
 */
export function clipNoteEvents(
	clip: Pick<StudioClip, "notes" | "start" | "offset" | "duration" | "gain" | "loop">,
	from = 0,
	to: number | null = null,
): ClipNoteEvent[] {
	if (!clip.notes?.length) return [];
	const clipEnd = clip.start + clip.duration;
	const ends = to === null ? clipEnd : Math.min(clipEnd, to);
	const out: ClipNoteEvent[] = [];
	// A note sounds in each pass of the clip it falls in (utils/clipSegments.ts); one that runs past the pass's end stops there.
	for (const seg of clipSegments(clip)) {
		const segEnd = Math.min(seg.start + seg.duration, ends);
		const origin = seg.start - seg.offset;
		for (const n of clip.notes) {
			const at = origin + n.t;
			if (at < seg.start || at < from || at >= segEnd) continue;
			out.push({
				at,
				duration: Math.max(0.001, Math.min(n.d, segEnd - at)),
				pitch: n.p,
				velocity: Math.min(1, n.v * clip.gain),
			});
		}
	}
	return out.sort((a, b) => a.at - b.at);
}
