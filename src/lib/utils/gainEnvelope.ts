import type { StudioGainPoint } from "#lib/val/StudioSchema.js";

/**
 * A clip's gain envelope (docs/multitrack-recorder.md "Clip gain
 * envelopes"): breakpoints over the clip's content seconds (like a note's
 * `t`), each a gain factor on top of the clip's gain, a straight line
 * between points and held flat before the first and after the last. No
 * points (or none at all) means a factor of one throughout. Pure: the
 * engine schedules it, the consolidate tool bakes it and the timeline
 * draws it from the same functions.
 */
export const GAIN_ENVELOPE_MAX = 2;

/** The factor at content second `t`. */
export function gainEnvelopeAt(points: readonly StudioGainPoint[] | undefined, t: number): number {
	if (!points?.length) return 1;
	const first = points[0]!;
	if (t <= first.t) return first.v;
	const last = points[points.length - 1]!;
	if (t >= last.t) return last.v;
	for (let i = 1; i < points.length; i++) {
		const b = points[i]!;
		if (t > b.t) continue;
		const a = points[i - 1]!;
		if (b.t === a.t) return b.v;
		return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
	}
	return last.v;
}

/**
 * The envelope over the content span [from, to) as the ramps a stretch of
 * audio needs: a point at `from`, every breakpoint strictly inside, and a
 * point at `to`, in time order. Empty when the envelope is flat at one.
 */
export function gainEnvelopeRamps(
	points: readonly StudioGainPoint[] | undefined,
	from: number,
	to: number,
): StudioGainPoint[] {
	if (!points?.length || to <= from) return [];
	if (points.every((p) => p.v === 1)) return [];
	const inside = points.filter((p) => p.t > from && p.t < to);
	return [
		{ t: from, v: gainEnvelopeAt(points, from) },
		...inside,
		{ t: to, v: gainEnvelopeAt(points, to) },
	];
}

/** The envelope with a point set at `t` (replacing one within a hair), in time order, values within range. */
export function gainEnvelopeWith(
	points: readonly StudioGainPoint[] | undefined,
	point: StudioGainPoint,
	epsilon = 0.0005,
): StudioGainPoint[] {
	const v = Math.max(0, Math.min(GAIN_ENVELOPE_MAX, point.v));
	const t = Math.max(0, point.t);
	const kept = (points ?? []).filter((p) => Math.abs(p.t - t) > epsilon);
	return [...kept, { t, v }].sort((a, b) => a.t - b.t);
}
