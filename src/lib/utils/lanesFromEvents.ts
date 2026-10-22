import {
	laneDefault,
	MAX_STUDIO_LANE_POINTS,
	MAX_STUDIO_LANES,
	type StudioLaneKind,
} from "#lib/constants/studioLanes.js";
import type { StudioClipLane } from "#lib/val/StudioSchema.js";

/** An expression change as a file or an instrument reports it: seconds on some clock, the lane it belongs to, a normalized value. */
export interface LaneEvent {
	at: number;
	kind: StudioLaneKind;
	controller?: number;
	value: number;
}

/**
 * Expression lanes from a stream of changes (a MIDI file's controllers, a
 * take's pedal and wheel, a Reaper item's events): one lane per kind and
 * controller, its points at `at - origin`, rounded to 4 decimals. A change
 * before the origin becomes the lane's value at zero (the pedal already
 * down as the pass began); one at or past `end` (within half a
 * millisecond of it, through a tempo map's float noise) is dropped. A run of
 * changes at one time keeps the last; a value that repeats the one before
 * (or, first, the default) is dropped; a lane that only states the default
 * is left out. At most
 * `MAX_STUDIO_LANES` lanes (the earliest kept) and `MAX_STUDIO_LANE_POINTS`
 * points per lane, thinned evenly to fit. Sorted by time.
 */
export function lanesFromEvents(
	events: LaneEvent[],
	origin: number,
	end: number,
): StudioClipLane[] {
	const byKey = new Map<string, Gathering>();
	const sorted = [...events].sort((a, b) => a.at - b.at);
	for (const e of sorted) {
		const key = e.kind === "cc" ? `cc:${e.controller ?? 0}` : e.kind;
		let entry = byKey.get(key);
		if (!entry) {
			if (byKey.size >= MAX_STUDIO_LANES) continue;
			entry = {
				lane: {
					kind: e.kind,
					...(e.kind === "cc" ? { controller: e.controller ?? 0 } : {}),
					points: [],
				},
			};
			byKey.set(key, entry);
		}
		const v = round4(Math.max(0, Math.min(1, e.value)));
		const t = round4(e.at - origin);
		if (t < 0) entry.before = v;
		else if (e.at <= end - 0.0005) addPoint(entry, t, v);
	}
	const out: StudioClipLane[] = [];
	for (const entry of byKey.values()) {
		const lane = finishLane(entry);
		if (lane) out.push(lane);
	}
	return out;
}

/** A lane being gathered: its points so far, and the value a change before the origin left it at. */
interface Gathering {
	lane: StudioClipLane;
	before?: number;
}

/** A change at `t` onto the lane: the pre-origin value first when it matters, the last of a run at one time, a repeat dropped. */
function addPoint(entry: Gathering, t: number, v: number) {
	const { lane, before } = entry;
	const pts = lane.points;
	const fallback = laneDefault(lane.kind);
	if (pts.length === 0 && before !== undefined && t > 0 && before !== fallback)
		pts.push({ t: 0, v: before });
	const last = pts[pts.length - 1];
	if (last && last.t === t) last.v = v;
	else if (last ? last.v !== v : v !== fallback) pts.push({ t, v });
}

/** The gathered lane, or null when it only states the default; a lane past the point limit thinned evenly. */
function finishLane({ lane, before }: Gathering): StudioClipLane | null {
	const fallback = laneDefault(lane.kind);
	if (lane.points.length === 0 && before !== undefined && before !== fallback)
		lane.points.push({ t: 0, v: before });
	if (lane.points.every((p) => p.v === fallback)) return null;
	if (lane.points.length > MAX_STUDIO_LANE_POINTS) {
		const step = lane.points.length / MAX_STUDIO_LANE_POINTS;
		lane.points = Array.from(
			{ length: MAX_STUDIO_LANE_POINTS },
			(_, i) => lane.points[Math.floor(i * step)]!,
		);
	}
	return lane;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
