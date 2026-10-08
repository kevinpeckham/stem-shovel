import { describe, expect, it } from "vite-plus/test";
import { DRUM_PATTERN_VERSION } from "#lib/constants/drumMachine.js";
import type { DrumProject } from "#lib/val/DrumPatternSchema.js";
import { decodeDrumProject } from "./decodeDrumProject";
import { encodeDrumProject } from "./encodeDrumProject";
import { startingDrumProject } from "./startingDrumProject";

/** The starting project with every setting a link carries moved off its default. */
function busyProject(): DrumProject {
	const p = startingDrumProject();
	p.bpm = 173;
	p.swing = 0.33;
	p.swingGrid = 8;
	p.humanize = 0.2;
	p.kit = "room";
	p.fx = {
		delayTime: 8,
		delayFeedback: 0.75,
		delayReturn: 0.3,
		delayAnalog: true,
		reverbSize: 0.9,
		reverbReturn: 0.45,
		fuzzDrive: 0.6,
		fuzzTone: 0.2,
		wahBars: 0.25,
		wahRange: 0.5,
		wahResonance: 0.8,
		wahMix: 0.35,
		toneTilt: 0.25,
		toneAir: 0.4,
		toneBottom: 0.15,
	};
	const [kick, snare, hat] = p.patterns[0].rows;
	kick.pan = -0.4;
	kick.cells[2] = 1;
	kick.cells[15] = 3;
	snare.mute = true;
	snare.delaySend = 0.05;
	snare.reverbSend = 1;
	hat.level = 0.33;
	hat.pan = 1;
	p.patterns.push({
		meter: "6/8",
		steps: 24,
		rows: [
			{
				voice: "cowbell",
				level: 0.5,
				pan: 0.25,
				mute: false,
				delaySend: 0.7,
				reverbSend: 0.3,
				cells: Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? 2 : 0)),
			},
		],
	});
	p.timeline = [0, 1, 1, 0, 1];
	return p;
}

describe("encodeDrumProject", () => {
	it("makes a base64url string that opens with the current version byte", () => {
		const encoded = encodeDrumProject(startingDrumProject());
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(atob(encoded.slice(0, 4)).charCodeAt(0)).toBe(DRUM_PATTERN_VERSION);
		expect(DRUM_PATTERN_VERSION).toBe(9);
	});
	it("round-trips the starting project and one with every field off its default", () => {
		expect(decodeDrumProject(encodeDrumProject(startingDrumProject()))).toEqual(
			startingDrumProject(),
		);
		const busy = busyProject();
		expect(decodeDrumProject(encodeDrumProject(busy))).toEqual(busy);
	});
	it("spends 112 characters on the starting project (the encoder's comment still says 78)", () => {
		expect(encodeDrumProject(startingDrumProject())).toHaveLength(112);
	});
	it("stands the acoustic kit in for a custom kit, which has no code in a link", () => {
		const p = startingDrumProject();
		p.kit = "V1StGXR8_Z5jdHi6B-myT";
		expect(decodeDrumProject(encodeDrumProject(p))?.kit).toBe("acoustic");
	});
});
