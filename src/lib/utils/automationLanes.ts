import { STUDIO_AUTOMATION, type AutomationRange } from "#lib/constants/studioAutomation.js";
import {
	INSERT_LABELS,
	INSERT_PARAMS,
	insertLaneKey,
	sendLaneKey,
} from "#lib/constants/studioInserts.js";
import type { StudioBus, StudioInsert } from "#lib/val/StudioSchema.js";

/** A lane a strip can show (docs/dawn-daw-plan.md, D2): its key on the track's `automation`, its range and its static value. */
export interface LaneChoice {
	key: string;
	range: AutomationRange;
	/** The value without a lane: the knob's, the send's, the insert's setting. */
	fallback: number;
}

/**
 * Every lane a strip can automate, in the order the picker lists them:
 * the volume, the pan (not on the master, which has none), the mute, a
 * send per bus, then each insert's automatable parameters. `inserts` are
 * the strip's effective inserts (`insertsOf`). The mute lane's fallback
 * is 0 (on): the strip's own mute button is the fader's business, not the
 * lane's.
 */
export function automationLanes(strip: {
	gain: number;
	pan?: number;
	sends?: { bus: string; level: number }[];
	inserts: StudioInsert[];
	buses: Pick<StudioBus, "id" | "name">[];
}): LaneChoice[] {
	const out: LaneChoice[] = [
		{ key: "volume", range: STUDIO_AUTOMATION.volume, fallback: strip.gain },
	];
	if (strip.pan !== undefined)
		out.push({ key: "pan", range: STUDIO_AUTOMATION.pan, fallback: strip.pan });
	out.push({ key: "mute", range: STUDIO_AUTOMATION.mute, fallback: 0 });
	for (const bus of strip.buses) {
		const send = strip.sends?.find((s) => s.bus === bus.id);
		out.push({
			key: sendLaneKey(bus.id),
			range: {
				label: `Send: ${bus.name}`,
				min: 0,
				max: 1,
				initial: 0,
				format: (v) => `${Math.round(v * 100)}%`,
			},
			fallback: send?.level ?? 0,
		});
	}
	for (const insert of strip.inserts) {
		for (const p of INSERT_PARAMS[insert.kind]) {
			if (!p.automatable) continue;
			const value = (insert.settings as Record<string, number | boolean>)[p.key];
			out.push({
				key: insertLaneKey(insert.id, p.key),
				range: {
					label: `${INSERT_LABELS[insert.kind]}: ${p.label}`,
					min: p.min,
					max: p.max,
					initial: typeof value === "number" ? value : p.min,
					format: p.format,
					bipolar: p.bipolar,
				},
				fallback: typeof value === "number" ? value : p.min,
			});
		}
	}
	return out;
}

/** How a lane's value lands on its param: the mute lane's 1 is a gain of 0, and it steps; everything else rides as it is. */
export function laneTransfer(key: string): { scale: (v: number) => number; hold: boolean } {
	if (key === "mute") return { scale: (v) => 1 - v, hold: true };
	return { scale: (v) => v, hold: false };
}

/** The parts of a lane key: a send's bus, or an insert's id and parameter; null for volume, pan and mute. */
export function parseLaneKey(
	key: string,
): { kind: "send"; bus: string } | { kind: "insert"; id: string; param: string } | null {
	const send = /^send:(.+)$/.exec(key);
	if (send) return { kind: "send", bus: send[1]! };
	const insert = /^insert:([^:]+):(.+)$/.exec(key);
	if (insert) return { kind: "insert", id: insert[1]!, param: insert[2]! };
	return null;
}
