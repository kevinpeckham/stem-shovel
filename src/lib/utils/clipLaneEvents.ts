import { laneDefault, type StudioLaneKind } from "#lib/constants/studioLanes.js";
import type { StudioClip } from "#lib/val/StudioSchema.js";
import { clipSegments } from "./clipSegments";
import { laneValueAt } from "./laneValueAt";

/** One expression change on the song's clock: the lane's kind and controller, its normalized value. */
export interface ClipLaneEvent {
	at: number;
	kind: StudioLaneKind;
	controller?: number;
	value: number;
}

/**
 * A clip's expression lanes as changes on the song's clock, the way
 * `clipNoteEvents` gives its notes: in each pass of the clip
 * (utils/clipSegments.ts) the value in force where the pass starts, then
 * every point inside it; at the clip's end each lane returns to its
 * default (the pedal up, the bend centered), so nothing rides on into the
 * next clip. Only those in [from, to) when a window is given. Sorted by
 * time; pure.
 */
export function clipLaneEvents(
	clip: Pick<StudioClip, "lanes" | "start" | "offset" | "duration" | "loop">,
	from = 0,
	to: number | null = null,
): ClipLaneEvent[] {
	const lanes = clip.lanes?.filter((l) => l.points.length) ?? [];
	if (!lanes.length) return [];
	const clipEnd = clip.start + clip.duration;
	const ends = to === null ? clipEnd : Math.min(clipEnd, to);
	const out: ClipLaneEvent[] = [];
	const push = (at: number, lane: (typeof lanes)[number], value: number) => {
		if (at < from || at >= ends) return;
		out.push({
			at,
			kind: lane.kind,
			...(lane.kind === "cc" ? { controller: lane.controller } : {}),
			value,
		});
	};
	for (const seg of clipSegments(clip)) {
		const segEnd = seg.start + seg.duration;
		for (const lane of lanes) {
			const points = [...lane.points].sort((a, b) => a.t - b.t);
			push(seg.start, lane, laneValueAt(points, seg.offset, laneDefault(lane.kind)));
			for (const p of points) {
				if (p.t <= seg.offset) continue;
				const at = seg.start + (p.t - seg.offset);
				if (at >= segEnd) break;
				push(at, lane, p.v);
			}
		}
	}
	if (clipEnd <= ends && clipEnd >= from)
		for (const lane of lanes)
			out.push({
				at: clipEnd,
				kind: lane.kind,
				...(lane.kind === "cc" ? { controller: lane.controller } : {}),
				value: laneDefault(lane.kind),
			});
	return out.sort((a, b) => a.at - b.at);
}
