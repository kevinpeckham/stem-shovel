import { beatsBetween, secondsAfterBeats, type BarGrid } from "#lib/audio/measures.js";
import type { StudioClip } from "#lib/val/StudioSchema.js";

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * A beats-anchored clip carried from one tempo map to another
 * (docs/multitrack-recorder.md "Beats-anchored clips"): every moment of it
 * (its start, its end, where its content begins, its loop, a MIDI clip's
 * notes and lane points) keeps the beat it had on `before` and lands on
 * that beat's second on `after`. A MIDI clip's content follows exactly,
 * through ramps and all; an audio clip's content is returned as a single
 * factor for the caller to stretch by (`stretch`: the new length over the
 * old), since a file cannot follow a ramp beat by beat. The clip itself is
 * not changed; the result is a new one, and `stretch` 1 when nothing moved.
 */
export function retimeClip(
	clip: StudioClip,
	before: BarGrid,
	after: BarGrid,
): { clip: StudioClip; stretch: number } {
	/** A second on the old map, moved to the same beat on the new one. */
	const move = (t: number) => secondsAfterBeats(after, 0, beatsBetween(before, 0, t));
	// The content's zero sits at start − offset on the timeline; content seconds map through that origin.
	const origin = clip.start - clip.offset;
	const content = (c: number) => move(origin + c) - move(origin);
	const from = move(clip.start);
	const start = round4(from);
	const end = move(clip.start + clip.duration);
	const duration = round4(Math.max(0.001, end - from));
	if (clip.notes) {
		const notes = clip.notes.map((n) => {
			const t = content(n.t);
			return {
				...n,
				t: round4(Math.max(0, t)),
				d: round4(Math.max(0.001, content(n.t + n.d) - t)),
			};
		});
		const lanes = clip.lanes?.map((l) => ({
			...l,
			points: l.points.map((p) => ({ ...p, t: round4(Math.max(0, content(p.t))) })),
		}));
		return {
			clip: {
				...clip,
				start,
				offset: round4(Math.max(0, content(clip.offset))),
				duration,
				notes,
				...(lanes ? { lanes } : {}),
				...(clip.loop
					? {
							loop: {
								start: round4(content(clip.loop.start)),
								end: round4(content(clip.loop.end)),
							},
						}
					: {}),
			},
			stretch: 1,
		};
	}
	// An audio clip: its start to the beat, its length by one factor (the caller stretches the content to match).
	const stretch = clip.duration > 0 ? (end - from) / clip.duration : 1;
	return { clip: { ...clip, start }, stretch };
}
