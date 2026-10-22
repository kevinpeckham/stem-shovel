import type { StudioLanePoint } from "#lib/val/StudioSchema.js";

/** The value an expression lane holds at content second `t`: the last point at or before it, `fallback` before the first. Points are sorted by time. */
export function laneValueAt(points: StudioLanePoint[], t: number, fallback: number): number {
	let v = fallback;
	for (const p of points) {
		if (p.t > t) break;
		v = p.v;
	}
	return v;
}
