import type { StudioBus } from "#lib/val/StudioSchema.js";

/**
 * A bus and every bus routed into it, directly or through others
 * (docs/multitrack-recorder.md "Folder tracks"): what a stem of the bus
 * sums, and what the bus must not be routed to (a loop). Safe on a file
 * whose outputs run in a circle: each bus is visited once.
 */
export function busDescendants(buses: readonly StudioBus[], busId: string): Set<string> {
	const out = new Set<string>([busId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const b of buses)
			if (b.output && out.has(b.output) && !out.has(b.id)) {
				out.add(b.id);
				grew = true;
			}
	}
	return out;
}
