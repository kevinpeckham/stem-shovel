import { laneDefault } from "#lib/constants/studioLanes.js";
import type { StudioClipLane } from "#lib/val/StudioSchema.js";
import { laneValueAt } from "./laneValueAt";

/**
 * The lanes of a take's piece [from, to) in content seconds, re-timed from
 * `from` (as `sliceNotes` cuts the notes): the value in force at `from`
 * becomes the piece's first point when it is not the lane's default, the
 * points inside follow. A lane with nothing in the piece is left out.
 */
export function sliceLanes(lanes: StudioClipLane[], from: number, to: number): StudioClipLane[] {
	const out: StudioClipLane[] = [];
	for (const lane of lanes) {
		const sorted = [...lane.points].sort((a, b) => a.t - b.t);
		const at = laneValueAt(sorted, from, laneDefault(lane.kind));
		const points = [];
		if (at !== laneDefault(lane.kind)) points.push({ t: 0, v: at });
		for (const p of sorted) {
			if (p.t <= from) continue;
			if (p.t >= to) break;
			points.push({ t: round4(p.t - from), v: p.v });
		}
		if (points.length) out.push({ ...lane, points });
	}
	return out;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
