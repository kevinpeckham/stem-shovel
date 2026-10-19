import { barAt, secondsAtBar, type BarGrid } from "#lib/audio/measures.js";
import type { ClipNoteEvent } from "./clipNoteEvents";

/**
 * Swing and humanize for a MIDI track's notes (docs/dawn-daw-plan.md, D5),
 * applied as they are queued or rendered, never to the clip's notes. Swing
 * delays the off-beat eighth (the second half of every beat) by `swing` of
 * the way toward a triplet feel: at 1 the "and" lands two thirds through
 * the beat. A note within an eighth of the off-beat moves with it; the
 * on-beats stay. Humanize scatters every note a little in time (up to
 * `humanize` × 30 ms either way) and in velocity (up to ±`humanize` × 0.2),
 * from `random` (0..1), which a test pins.
 */
export function swingNotes(
	events: ClipNoteEvent[],
	o: { grid: BarGrid; swing?: number; humanize?: number; random?: () => number },
): ClipNoteEvent[] {
	const swing = Math.max(0, Math.min(1, o.swing ?? 0));
	const humanize = Math.max(0, Math.min(1, o.humanize ?? 0));
	const random = o.random ?? Math.random;
	if (swing === 0 && humanize === 0) return events;
	return events
		.map((e) => {
			let at = e.at;
			let velocity = e.velocity;
			if (swing > 0) {
				const pos = barAt(o.grid, e.at);
				const beatStart = secondsAtBar(o.grid, pos.bar, pos.beat);
				const beatEnd = secondsAtBar(o.grid, pos.bar, pos.beat, 1);
				const beat = beatEnd - beatStart;
				const into = e.at - beatStart;
				// The off-beat eighth sits at half the beat; swung, it moves toward two thirds.
				const off = beat / 2;
				if (Math.abs(into - off) < beat / 8) at = beatStart + off + (beat / 6) * swing;
			}
			if (humanize > 0) {
				at += (random() * 2 - 1) * 0.03 * humanize;
				velocity = Math.max(0.05, Math.min(1, velocity + (random() * 2 - 1) * 0.2 * humanize));
			}
			return { ...e, at: Math.max(0, at), velocity };
		})
		.sort((a, b) => a.at - b.at);
}
