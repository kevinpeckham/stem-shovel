import { automationValueAt, type AutomationPoint } from "./automationValueAt";

/** The slice of an AudioParam the scheduler writes (a test hands it a recorder). */
export interface SchedulableParam {
	cancelScheduledValues(time: number): unknown;
	setValueAtTime(value: number, time: number): unknown;
	linearRampToValueAtTime(value: number, time: number): unknown;
}

/**
 * A lane onto an AudioParam for one playback pass (docs/dawn-daw-plan.md,
 * D1): song second `from` sounds at context time `when`, the pass ends at
 * song second `to` (null: the song's end). The value at `from` is set at
 * `when`, then every breakpoint inside the window is a linear ramp, so
 * the curve is sample-accurate between them and holds after the last.
 * `scale` maps a lane's units onto the param's (the reverb lane's 0..1 is
 * half that on the wet gain). An empty lane sets `fallback` and nothing
 * else. Returns the value set at `from`.
 */
export function scheduleAutomation(
	param: SchedulableParam,
	points: readonly AutomationPoint[],
	o: {
		from: number;
		when: number;
		to: number | null;
		fallback: number;
		scale?: (v: number) => number;
	},
): number {
	const scale = o.scale ?? ((v) => v);
	param.cancelScheduledValues(o.when);
	const start = automationValueAt(points, o.from, o.fallback);
	param.setValueAtTime(scale(start), o.when);
	for (const p of points) {
		if (p.t <= o.from) continue;
		if (o.to !== null && p.t > o.to) break;
		param.linearRampToValueAtTime(scale(p.v), o.when + (p.t - o.from));
	}
	return start;
}
