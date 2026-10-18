/** One breakpoint of an automation lane: `t` seconds on the timeline, `v` in the parameter's units. Lanes are sorted by `t`. */
export interface AutomationPoint {
	t: number;
	v: number;
}

/**
 * A lane's value at `t`: the first point's before it, the last point's
 * after it, a straight line between neighbors; `fallback` for an empty
 * lane (the parameter's static value).
 */
export function automationValueAt(
	points: readonly AutomationPoint[],
	t: number,
	fallback: number,
): number {
	if (points.length === 0) return fallback;
	if (t <= points[0]!.t) return points[0]!.v;
	const last = points[points.length - 1]!;
	if (t >= last.t) return last.v;
	// Binary search for the segment holding t.
	let lo = 0;
	let hi = points.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (points[mid]!.t <= t) lo = mid;
		else hi = mid;
	}
	const a = points[lo]!;
	const b = points[hi]!;
	if (b.t === a.t) return b.v;
	return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}
