import { describe, expect, it } from "vite-plus/test";
import { automationLanes, parseLaneKey } from "./automationLanes";

describe("automationLanes", () => {
	it("lists volume, pan, a send per bus and each insert's automatable parameters with their values", () => {
		const lanes = automationLanes({
			gain: 0.8,
			pan: -0.2,
			sends: [{ bus: "b1", level: 0.4 }],
			inserts: [
				{
					id: "i1",
					kind: "delay",
					settings: { time: 0.3, feedback: 0.5, level: 0.2, analog: true },
				},
				{ id: "i2", kind: "limiter", settings: { ceiling: -1, release: 0.1 } },
			],
			buses: [
				{ id: "b1", name: "Reverb bus" },
				{ id: "b2", name: "Drums" },
			],
		});
		expect(lanes.map((l) => l.key)).toEqual([
			"volume",
			"pan",
			"mute",
			"send:b1",
			"send:b2",
			"insert:i1:feedback",
			"insert:i1:level",
		]);
		expect(lanes[0]!.fallback).toBe(0.8);
		// The mute lane's fallback is on (0): the strip's own mute button stays the fader's.
		expect(lanes[2]!.fallback).toBe(0);
		expect(lanes[2]!.range.step).toBe(true);
		expect(lanes[3]!.fallback).toBe(0.4);
		expect(lanes[4]!.fallback).toBe(0);
		expect(lanes[3]!.range.label).toBe("Send: Reverb bus");
		expect(lanes[5]!.range.label).toBe("Delay: Feedback");
		expect(lanes[5]!.fallback).toBe(0.5);
	});
	it("a bus strip has no pan lane when none is given", () => {
		expect(automationLanes({ gain: 1, inserts: [], buses: [] }).map((l) => l.key)).toEqual([
			"volume",
			"mute",
		]);
	});
	it("parseLaneKey reads sends and inserts, and nothing else", () => {
		expect(parseLaneKey("send:b1")).toEqual({ kind: "send", bus: "b1" });
		expect(parseLaneKey("insert:i1:level")).toEqual({ kind: "insert", id: "i1", param: "level" });
		expect(parseLaneKey("volume")).toBeNull();
	});
});
