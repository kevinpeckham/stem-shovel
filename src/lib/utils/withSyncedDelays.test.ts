import type { StudioInsert } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { delaySyncSeconds, withSyncedDelays } from "./withSyncedDelays";

describe("withSyncedDelays", () => {
	it("turns a note value into seconds at the tempo, within the delay's range", () => {
		expect(delaySyncSeconds(1, 120)).toBe(0.5);
		expect(delaySyncSeconds(0.75, 120)).toBe(0.375);
		expect(delaySyncSeconds(2, 40)).toBe(2);
		expect(delaySyncSeconds(0.25, 1000)).toBe(0.02);
	});
	it("sets a synced delay's time from the tempo and leaves the rest alone", () => {
		const inserts: StudioInsert[] = [
			{ id: "a", kind: "delay", settings: { time: 0.1, sync: 0.5, feedback: 0.3 } },
			{ id: "b", kind: "delay", settings: { time: 0.1, sync: 0, feedback: 0.3 } },
			{ id: "c", kind: "eq", settings: { lowGain: 2 } },
		];
		const out = withSyncedDelays(inserts, 100);
		expect(out[0]!.settings).toEqual({ time: 0.3, sync: 0.5, feedback: 0.3 });
		expect(out[1]).toBe(inserts[1]);
		expect(out[2]).toBe(inserts[2]);
	});
});
