import { CC_NAMES, type StudioLaneKind } from "#lib/constants/studioLanes.js";

/** An expression lane's name as the roll and the reports say it: "Sustain", "Pitch bend", "Pressure", "CC 17". */
export function laneLabel(lane: { kind: StudioLaneKind; controller?: number }): string {
	if (lane.kind === "bend") return "Pitch bend";
	if (lane.kind === "pressure") return "Pressure";
	const n = lane.controller ?? 0;
	return CC_NAMES[n] ?? `CC ${n}`;
}
