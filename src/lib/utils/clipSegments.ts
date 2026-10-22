import type { StudioClip } from "#lib/val/StudioSchema.js";

/** One pass of a clip over its content: `duration` seconds of the source from `offset`, placed at `start` on the timeline. */
export interface ClipSegment {
	start: number;
	offset: number;
	duration: number;
}

/**
 * What a clip plays, pass by pass (docs/multitrack-recorder.md, "Looping a
 * clip"): a clip without a loop is one segment, its `duration` of content
 * from `offset`. A looped clip plays from `offset` to the loop's end, then
 * the loop from its start to its end again and again until the clip's
 * duration is up; an `offset` at or past the loop's end starts inside the
 * loop. The engine schedules a source per segment, the renders and the
 * timeline draw them, the writers unroll by them. Pure.
 */
export function clipSegments(
	clip: Pick<StudioClip, "start" | "offset" | "duration" | "loop">,
): ClipSegment[] {
	const loop = clip.loop;
	if (!loop || !(loop.end > loop.start))
		return [{ start: clip.start, offset: clip.offset, duration: clip.duration }];
	const out: ClipSegment[] = [];
	let at = 0;
	let offset = clip.offset < loop.end ? clip.offset : loop.start;
	while (at < clip.duration - 1e-6 && out.length < 10000) {
		const span = Math.min(loop.end - offset, clip.duration - at);
		out.push({ start: clip.start + at, offset, duration: span });
		at += span;
		offset = loop.start;
	}
	return out;
}

/** The content second a clip plays `t` seconds in (0 ≤ t < duration): `offset + t` for a clip without a loop, else through its passes. */
export function clipContentTime(
	clip: Pick<StudioClip, "start" | "offset" | "duration" | "loop">,
	t: number,
): number {
	if (!clip.loop) return clip.offset + t;
	let last = clip.offset;
	for (const s of clipSegments(clip)) {
		const rel = s.start - clip.start;
		if (t < rel + s.duration) return s.offset + (t - rel);
		last = s.offset + s.duration;
	}
	return last;
}
