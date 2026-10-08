import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DRUM_FX } from "#lib/constants/drumMachine.js";
import { upgradeDrumProject } from "./upgradeDrumProject";

describe("upgradeDrumProject", () => {
	it("wraps a version 1 pattern in a project with centred pans and the voice's usual sends", () => {
		const up = upgradeDrumProject({
			v: 1,
			bpm: 128,
			swing: 0.2,
			steps: 8,
			kit: "room",
			rows: [{ voice: "clap", level: 0.7, mute: true, cells: [0, 0, 2, 0, 0, 0, 2, 0] }],
		});
		expect(up).toEqual({
			v: 2,
			bpm: 128,
			swing: 0.2,
			swingGrid: 16,
			humanize: 0,
			fx: DEFAULT_DRUM_FX,
			kit: "room",
			timeline: [],
			patterns: [
				{
					meter: "4/4",
					steps: 8,
					rows: [
						{
							voice: "clap",
							level: 0.7,
							mute: true,
							pan: 0,
							delaySend: 0.5,
							reverbSend: 0.9,
							cells: [0, 0, 2, 0, 0, 0, 2, 0],
						},
					],
				},
			],
		});
		expect(up.fx).not.toBe(DEFAULT_DRUM_FX);
	});
});
