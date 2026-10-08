import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DRUM_FX } from "#lib/constants/drumMachine.js";
import type { DrumProject, DrumRow } from "#lib/val/DrumPatternSchema.js";
import { decodeDrumProject } from "./decodeDrumProject";

/**
 * One project encoded by every encoder there has been, each string taken
 * from that version's own encoder in git (v1 ec5c1e9 … v9 2f6df0f) on
 * 2026-10-07. These are what old share links carry: a change that stops
 * any of them opening breaks links out in the world.
 */
const links = {
	1: "AVBkJBaQmQNCEBI",
	2: "AlBkOQEFqCQmQNAyhASA",
	3: "A1BkOSAgtQSEyBoGUICVjLKMQQQQAA",
	4: "BFBkOpAQWoJCZA0DKEBKxllGIIIIAA",
	5: "BVBkOtuejFEgILUEMwYTIGgZRVoICVjLKMHnkEEEAA",
	6: "BlBkOtuejFEgILUEMwYTIGgZRVoICVjLKMHnkEEEAQEg",
	7: "B1BkOtuejFLw8kBBaghmDCZA0DKKtBASsZZRg88ggggCAkA",
	8: "CFBkOtuejFLw86ChkkBBaghmDCZA0DKKtBASsZZRg88ggggCAkA",
	9: "CVBkOtuejFLw86ChkZHiiQEFqCGYMJkDQMoq0EBKxllGDzyCCCAICQA",
};

const kick: DrumRow = {
	voice: "kick",
	level: 0.9,
	pan: 0.3,
	mute: false,
	delaySend: 0.25,
	reverbSend: 0.65,
	cells: [2, 0, 1, 0, 3, 0, 2, 0],
};
const snare: DrumRow = {
	voice: "snare",
	level: 0.8,
	pan: -0.5,
	mute: true,
	delaySend: 0.1,
	reverbSend: 0.9,
	cells: [0, 0, 2, 0, 0, 0, 2, 1],
};
const ride: DrumRow = {
	voice: "ride",
	level: 0.5,
	pan: 0.4,
	mute: false,
	delaySend: 0.3,
	reverbSend: 0.6,
	cells: [2, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0, 0],
};
/** Rows from before version 5 carry no sends: the voice's usual ones fill in. */
const usualSends = {
	kick: { delaySend: 0.15, reverbSend: 0.3 },
	snare: { delaySend: 0.45, reverbSend: 0.8 },
};
const fx = {
	delayTime: 6,
	delayFeedback: 0.55,
	delayReturn: 0.3,
	reverbSize: 0.7,
	reverbReturn: 0.2,
	delayAnalog: true,
	fuzzDrive: 0.6,
	fuzzTone: 0.3,
	wahBars: 2,
	wahRange: 0.8,
	wahResonance: 0.4,
	wahMix: 0.5,
	toneTilt: -0.5,
	toneAir: 0.3,
	toneBottom: 0.2,
} as const;
const fxTo = (version: number) => ({
	...DEFAULT_DRUM_FX,
	...(version >= 5 && {
		delayTime: fx.delayTime,
		delayFeedback: fx.delayFeedback,
		delayReturn: fx.delayReturn,
		reverbSize: fx.reverbSize,
		reverbReturn: fx.reverbReturn,
	}),
	...(version >= 7 && { delayAnalog: true, fuzzDrive: fx.fuzzDrive, fuzzTone: fx.fuzzTone }),
	...(version >= 8 && {
		wahBars: fx.wahBars,
		wahRange: fx.wahRange,
		wahResonance: fx.wahResonance,
		wahMix: fx.wahMix,
	}),
	...(version >= 9 && { toneTilt: fx.toneTilt, toneAir: fx.toneAir, toneBottom: fx.toneBottom }),
});
const full: DrumProject = {
	v: 2,
	bpm: 120,
	swing: 0.5,
	humanize: 0.14,
	swingGrid: 8,
	fx: { ...fx },
	kit: "electronic",
	patterns: [
		{ meter: "4/4", steps: 8, rows: [kick, snare] },
		{ meter: "3/4", steps: 12, rows: [ride] },
	],
	timeline: [0, 1, 1, 0],
};

describe("decodeDrumProject", () => {
	it("opens the current version in full", () => {
		expect(decodeDrumProject(links[9])).toEqual(full);
	});
	it("opens a version 1 link as a one-pattern project with the pans centred", () => {
		expect(decodeDrumProject(links[1])).toEqual({
			...full,
			humanize: 0,
			swingGrid: 16,
			fx: DEFAULT_DRUM_FX,
			timeline: [],
			patterns: [
				{
					meter: "4/4",
					steps: 8,
					rows: [
						{ ...kick, pan: 0, ...usualSends.kick },
						{ ...snare, pan: 0, ...usualSends.snare },
					],
				},
			],
		});
	});
	it("opens versions 2 to 8 with what each lacked at its default", () => {
		const v2pattern = {
			meter: "4/4",
			steps: 8,
			rows: [
				{ ...kick, ...usualSends.kick },
				{ ...snare, ...usualSends.snare },
			],
		};
		const noSends = [v2pattern, { meter: "3/4", steps: 12, rows: [ride] }];
		expect(decodeDrumProject(links[2])).toEqual({
			...full,
			swingGrid: 16,
			fx: DEFAULT_DRUM_FX,
			timeline: [],
			patterns: [v2pattern],
		});
		expect(decodeDrumProject(links[3])).toEqual({
			...full,
			swingGrid: 16,
			fx: DEFAULT_DRUM_FX,
			timeline: [],
			patterns: noSends,
		});
		expect(decodeDrumProject(links[4])).toEqual({
			...full,
			fx: DEFAULT_DRUM_FX,
			timeline: [],
			patterns: noSends,
		});
		expect(decodeDrumProject(links[5])).toEqual({ ...full, fx: fxTo(5), timeline: [] });
		expect(decodeDrumProject(links[6])).toEqual({ ...full, fx: fxTo(6) });
		expect(decodeDrumProject(links[7])).toEqual({ ...full, fx: fxTo(7) });
		expect(decodeDrumProject(links[8])).toEqual({ ...full, fx: fxTo(8) });
	});
	it("returns null for what is not a link", () => {
		expect(decodeDrumProject("")).toBeNull();
		expect(decodeDrumProject("not a link!")).toBeNull();
		expect(decodeDrumProject(links[9].slice(0, 20))).toBeNull();
		// A version byte this build does not read: 0 and the next one up.
		expect(decodeDrumProject("AA" + links[9].slice(2))).toBeNull();
		expect(decodeDrumProject("Cg" + links[9].slice(2))).toBeNull();
	});
	it("returns null when a field is out of the schema's range", () => {
		// The second byte is the tempo above 40: 210 puts it at 250, past the maximum.
		const bytes = Uint8Array.from(atob(links[9]), (c) => c.charCodeAt(0));
		bytes[1] = 210;
		const fast = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
		expect(decodeDrumProject(fast)).toBeNull();
		bytes[1] = 80;
		const ok = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
		expect(decodeDrumProject(ok)?.bpm).toBe(120);
	});
});
