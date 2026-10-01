import { describe, expect, test } from "vite-plus/test";
import { parseMidi } from "$lib/audio/midi";
import { decodeDrumProject } from "./decodeDrumProject";
import { drumStepTime } from "./drumStepTime";
import { emptyDrumPattern } from "./emptyDrumPattern";
import { encodeDrumMidi } from "./encodeDrumMidi";
import { encodeDrumProject } from "./encodeDrumProject";
import { resizeDrumPattern } from "./resizeDrumPattern";
import { startingDrumProject } from "./startingDrumProject";
import { upgradeDrumProject } from "./upgradeDrumProject";
import { DEFAULT_DRUM_FX, DEFAULT_DRUM_SENDS } from "$lib/constants/drumMachine";
import type { DrumProject } from "$lib/val/DrumPatternSchema";

/**
 * Links that have been shared are pinned here and this list only grows: a
 * change to the codec that reads one of them differently breaks a link
 * someone has. A version 1 link opens as the project it always did (one
 * pattern, no pan, no humanize), a version 2 link as a 4/4 project, a
 * version 3 link with the 1/16 swing grid, a version 4 link with the
 * default effects; none is re-encoded. A link at
 * the current version round-trips exactly.
 */
/** The usual sends until v0.65.0 roughly doubled the reverb's: what the version 5 to 7 pinned links carry. */
const SENDS_BEFORE_V65: Record<string, { delaySend: number; reverbSend: number }> = {
	kick: { delaySend: 0, reverbSend: 0.05 },
	snare: { delaySend: 0.15, reverbSend: 0.4 },
	"hat-closed": { delaySend: 0.1, reverbSend: 0.15 },
	"hat-open": { delaySend: 0.15, reverbSend: 0.25 },
	clap: { delaySend: 0.2, reverbSend: 0.45 },
	rim: { delaySend: 0.45, reverbSend: 0.2 },
	"tom-low": { delaySend: 0.1, reverbSend: 0.3 },
	"tom-mid": { delaySend: 0.1, reverbSend: 0.3 },
	"tom-high": { delaySend: 0.1, reverbSend: 0.3 },
	ride: { delaySend: 0.1, reverbSend: 0.3 },
	crash: { delaySend: 0.1, reverbSend: 0.35 },
	cowbell: { delaySend: 0.35, reverbSend: 0.15 },
};

const PINNED_LINKS: {
	link: string;
	project: () => DrumProject;
	version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}[] = [
	{
		link: "ATwAkBaQEBAQA0ABAAEATxERERAGyAAAABCRgAAAAAsYAAAAANQAAAAAEUAAAAAA",
		// The starting pattern as it was shared then: no humanize (a version 1 link has none).
		project: () => {
			const p = startingDrumProject();
			p.humanize = 0;
			return p;
		},
		version: 1,
	},
	{
		link: "AaRkJhkQQQYCAAFsmJEA",
		version: 1,
		project: () =>
			upgradeDrumProject({
				v: 1,
				bpm: 204,
				swing: 0.5,
				steps: 8,
				kit: "electronic",
				rows: [
					{
						voice: "kick",
						level: 1,
						mute: false,
						cells: [2, 0, 0, 2, 0, 0, 2, 0],
					},
					{
						voice: "hat-open",
						level: 0,
						mute: true,
						cells: [0, 0, 0, 0, 0, 0, 0, 0],
					},
					{
						voice: "cowbell",
						level: 0.5,
						mute: false,
						cells: [3, 0, 1, 0, 2, 0, 2, 0],
					},
				],
			}),
	},
	{
		link: "AjwAZCEFoyQGANCWggQCjLIAEAA",
		version: 2,
		project: () => ({
			v: 2,
			bpm: 100,
			swing: 0,
			swingGrid: 16,
			humanize: 0.25,
			fx: { ...DEFAULT_DRUM_FX },
			kit: "acoustic",
			timeline: [],
			patterns: [
				{
					meter: "4/4",
					steps: 8,
					rows: [
						{
							voice: "kick",
							level: 0.9,
							pan: -0.5,
							mute: false,
							...DEFAULT_DRUM_SENDS["kick"],
							cells: [2, 0, 0, 0, 3, 0, 0, 0],
						},
						{
							voice: "snare",
							level: 0.8,
							pan: 0.5,
							mute: true,
							...DEFAULT_DRUM_SENDS["snare"],
							cells: [0, 0, 1, 0, 0, 0, 2, 0],
						},
					],
				},
				{
					meter: "4/4",
					steps: 8,
					rows: [
						{
							voice: "clap",
							level: 0.5,
							pan: 1,
							mute: false,
							...DEFAULT_DRUM_SENDS["clap"],
							cells: [0, 0, 0, 0, 2, 0, 0, 0],
						},
					],
				},
			],
		}),
	},
	{
		link: "A1wUASsgtMjAAACVEYAICAoI0EuqqqqqqqqA",
		version: 3,
		project: () => ({
			v: 2,
			bpm: 132,
			swing: 0.1,
			swingGrid: 16,
			humanize: 0,
			fx: { ...DEFAULT_DRUM_FX },
			kit: "electronic",
			timeline: [],
			patterns: [
				{
					meter: "3/4",
					steps: 12,
					rows: [
						{
							voice: "kick",
							level: 0.9,
							pan: 0,
							mute: false,
							...DEFAULT_DRUM_SENDS["kick"],
							cells: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
						},
						{
							voice: "ride",
							level: 0.4,
							pan: 0.4,
							mute: false,
							...DEFAULT_DRUM_SENDS["ride"],
							cells: [0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
						},
					],
				},
				{
					meter: "6/8",
					steps: 24,
					rows: [
						{
							voice: "snare",
							level: 0.8,
							pan: -0.25,
							mute: true,
							...DEFAULT_DRUM_SENDS["snare"],
							cells: Array(24).fill(1),
						},
					],
				},
			],
		}),
	},
	{
		link: "BETIOwCQWmRABEAEE8bkREREQA",
		version: 4,
		project: () => ({
			v: 2,
			bpm: 108,
			swing: 1,
			swingGrid: 8,
			humanize: 0.14,
			fx: { ...DEFAULT_DRUM_FX },
			kit: "room",
			timeline: [],
			patterns: [
				{
					meter: "4/4",
					steps: 16,
					rows: [
						{
							voice: "kick",
							level: 0.9,
							pan: 0,
							mute: false,
							...DEFAULT_DRUM_SENDS["kick"],
							cells: [2, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 2, 0],
						},
						{
							voice: "hat-closed",
							level: 0.6,
							pan: 0.1,
							mute: false,
							...DEFAULT_DRUM_SENDS["hat-closed"],
							cells: [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0],
						},
					],
				},
			],
		}),
	},
	{
		link: "BVQoONvGoPEAIMjIACoCAVkjIJkCCA",
		version: 5,
		project: () => ({
			v: 2,
			bpm: 124,
			swing: 0.2,
			swingGrid: 16,
			humanize: 0.14,
			fx: {
				delayTime: 6,
				delayFeedback: 0.55,
				delayReturn: 0.7,
				reverbSize: 0.8,
				reverbReturn: 0.6,
				delayAnalog: false,
				fuzzDrive: 0,
				fuzzTone: 0.5,
				wahBars: 1,
				wahRange: 0.7,
				wahResonance: 0.5,
				wahMix: 0,
			},
			kit: "electronic",
			timeline: [],
			patterns: [
				{
					meter: "4/4",
					steps: 8,
					rows: [
						{
							voice: "kick",
							level: 1,
							pan: 0,
							mute: false,
							delaySend: 0,
							reverbSend: 0.1,
							cells: [2, 0, 0, 0, 2, 0, 0, 0],
						},
						{
							voice: "rim",
							level: 0.5,
							pan: -0.3,
							mute: false,
							delaySend: 0.65,
							reverbSend: 0.25,
							cells: [0, 0, 0, 2, 0, 0, 2, 0],
						},
					],
				},
			],
		}),
	},
	{
		link: "Bk4UOFQAZAAhgLTIABYCAgIAaDIHqACAAIAnjIFD4iIiIA2TIHmQAAAAhIzIKLQAAAABYzIWlAAAAABqDIFHgAAAACKDIFHgAAAAAMBaZAAKAAAAADQZA9QAAAAHE8ZAoeAAAAAGyZA8yAAAAAJGZBRaAAAAALGZC0oAAAAANQZAo8AAAAARQZAo8AAAAACAAQAQ",
		version: 6,
		// The starting beat with a fill as a second pattern and an eight-bar timeline: three of the groove, the fill, again; the sends of its day.
		project: () => {
			const p = startingDrumProject();
			p.bpm = 118;
			p.swing = 0.1;
			const fill = emptyDrumPattern(p.patterns[0]!);
			fill.rows[1]!.cells[14] = 3;
			fill.rows[1]!.cells[15] = 2;
			p.patterns.push(fill);
			p.timeline = [0, 0, 0, 1, 0, 0, 0, 1];
			for (const pat of p.patterns)
				for (const r of pat.rows) Object.assign(r, SENDS_BEFORE_V65[r.voice]);
			return p;
		},
	},
	{
		link: "B04UOFQAZAJmMEMBaZAALAQEBADQZA9QAQABAE8ZAofERERAGyZA8yAAAAEJGZBRaAAAAALGZC0oAAAAANQZAo8AAAAARQZAo8AAAAABgLTIABQAAAAAaDIHqAAAAA4njIFDwAAAAA2TIHmQAAAABIzIKLQAAAABYzIWlAAAAABqDIFHgAAAACKDIFHgAAAAAQACACA",
		version: 7,
		// The same beat with the analog delay on and a fuzz, carrying the sends of its day (before the usual reverb sends rose in v0.65.0).
		project: () => {
			const p = startingDrumProject();
			p.bpm = 118;
			p.swing = 0.1;
			p.fx = { ...p.fx, delayAnalog: true, fuzzDrive: 0.25, fuzzTone: 0.7 };
			const fill = emptyDrumPattern(p.patterns[0]!);
			fill.rows[1]!.cells[14] = 3;
			fill.rows[1]!.cells[15] = 2;
			p.patterns.push(fill);
			p.timeline = [0, 0, 0, 1, 0, 0, 0, 1];
			for (const pat of p.patterns)
				for (const r of pat.rows) Object.assign(r, SENDS_BEFORE_V65[r.voice]);
			return p;
		},
	},
	{
		link: "CE4UOFQAZAJmM3lBkEMBaZA89AQEBADQZC2gAQABAE8ZB49ERERAGyZChkAAAAEJGZDK0AAAAALGZFBQAAAAANQZB54AAAAARQZB54AAAAABgLTIHngAAAAAaDIW0AAAAA4njIPHgAAAAA2TIUMgAAAABIzIZWgAAAABYzIoKAAAAABqDIPPAAAAACKDIPPAAAAAAQACACA",
		version: 8,
		// The same beat with a wah sweeping over two bars.
		project: () => {
			const p = startingDrumProject();
			p.bpm = 118;
			p.swing = 0.1;
			p.fx = {
				...p.fx,
				delayAnalog: true,
				fuzzDrive: 0.25,
				fuzzTone: 0.7,
				wahBars: 2,
				wahRange: 0.6,
				wahResonance: 0.8,
				wahMix: 0.5,
			};
			const fill = emptyDrumPattern(p.patterns[0]!);
			fill.rows[1]!.cells[14] = 3;
			fill.rows[1]!.cells[15] = 2;
			p.patterns.push(fill);
			p.timeline = [0, 0, 0, 1, 0, 0, 0, 1];
			return p;
		},
	},
];

describe("encodeDrumProject / decodeDrumProject", () => {
	test("round-trips the starting project in under 120 characters", () => {
		const p = startingDrumProject();
		const s = encodeDrumProject(p);
		expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(s.length).toBeLessThan(120);
		expect(decodeDrumProject(s)).toEqual(p);
	});
	test("keeps level and pan to a hundredth", () => {
		const p = startingDrumProject();
		p.patterns[0]!.rows[0]!.level = 0.3333;
		p.patterns[0]!.rows[0]!.pan = -0.3333;
		const back = decodeDrumProject(encodeDrumProject(p))!.patterns[0]!.rows[0]!;
		expect(back.level).toBe(0.33);
		expect(back.pan).toBeCloseTo(-0.33, 10);
	});
	test("eight patterns of 32 steps with nine rows, every kit and voice, about a thousand characters", () => {
		const p = startingDrumProject();
		p.kit = "electronic";
		p.humanize = 1;
		const big = resizeDrumPattern(p.patterns[0]!, 32);
		big.rows.push({
			voice: "cowbell",
			level: 1,
			pan: 0.25,
			mute: true,
			...DEFAULT_DRUM_SENDS["cowbell"],
			cells: Array(32).fill(3),
		});
		p.patterns = Array.from({ length: 8 }, () => structuredClone(big));
		const s = encodeDrumProject(p);
		expect(s.length).toBeLessThan(1300);
		expect(decodeDrumProject(s)).toEqual(p);
	});
	test("carries the effects and the sends", () => {
		const p = startingDrumProject();
		p.fx = {
			delayTime: 8,
			delayFeedback: 0.9,
			delayReturn: 0.33,
			reverbSize: 1,
			reverbReturn: 0,
			delayAnalog: false,
			fuzzDrive: 0,
			fuzzTone: 0.5,
			wahBars: 1,
			wahRange: 0.7,
			wahResonance: 0.5,
			wahMix: 0,
		};
		p.patterns[0]!.rows[1]!.delaySend = 0.45;
		p.patterns[0]!.rows[1]!.reverbSend = 1;
		expect(decodeDrumProject(encodeDrumProject(p))).toEqual(p);
		// Version 7: the analog delay and the fuzz travel too; a version 6 link opens with them off.
		p.fx = { ...p.fx, delayAnalog: true, fuzzDrive: 0.42, fuzzTone: 0.9 };
		expect(decodeDrumProject(encodeDrumProject(p))).toEqual(p);
		expect(decodeDrumProject("BVQoONvGoPEAIMjIACoCAVkjIJkCCA")?.fx).toMatchObject({
			delayAnalog: false,
			fuzzDrive: 0,
			fuzzTone: 0.5,
			wahBars: 1,
			wahRange: 0.7,
			wahResonance: 0.5,
			wahMix: 0,
		});
	});
	test("carries the timeline, and a link from before the timeline opens with none", () => {
		const p = startingDrumProject();
		p.patterns.push(emptyDrumPattern(p.patterns[0]!));
		p.timeline = Array.from({ length: 64 }, (_, i) => i % 2);
		const s = encodeDrumProject(p);
		expect(decodeDrumProject(s)).toEqual(p);
		expect(decodeDrumProject("BVQoONvGoPEAIMjIACoCAVkjIJkCCA")?.timeline).toEqual([]);
	});
	test("refuses what is not a link", () => {
		expect(decodeDrumProject("")).toBeNull();
		expect(decodeDrumProject("not a link")).toBeNull();
		expect(decodeDrumProject("AA")).toBeNull();
		// A version this build does not read
		expect(decodeDrumProject("Aw")).toBeNull();
	});
	test("pinned links still open as the projects they were", () => {
		for (const { link, project, version } of PINNED_LINKS) {
			const p = project();
			expect(decodeDrumProject(link)).toEqual(p);
			if (version === 8) expect(encodeDrumProject(p)).toBe(link);
		}
	});
});

describe("patterns", () => {
	test("resizing: growing repeats the bar, shrinking keeps the start", () => {
		const p = startingDrumProject().patterns[0]!;
		const two = resizeDrumPattern(p, 32);
		expect(two.steps).toBe(32);
		expect(two.rows[0]!.cells).toEqual([...p.rows[0]!.cells, ...p.rows[0]!.cells]);
		const half = resizeDrumPattern(p, 8);
		expect(half.rows[0]!.cells).toEqual(p.rows[0]!.cells.slice(0, 8));
		expect(resizeDrumPattern(p, 16)).toBe(p);
	});
	test("an empty pattern keeps the rows, levels and pans, with every cell off", () => {
		const p = startingDrumProject().patterns[0]!;
		p.rows[0]!.pan = 0.4;
		const e = emptyDrumPattern(p);
		expect(e.steps).toBe(16);
		expect(e.rows.map((r) => r.voice)).toEqual(p.rows.map((r) => r.voice));
		expect(e.rows[0]!.pan).toBe(0.4);
		expect(e.rows.every((r) => r.cells.every((c) => c === 0))).toBe(true);
	});
});

describe("drumStepTime", () => {
	test("sixteenths at the tempo", () => {
		expect(drumStepTime(0, 120, 0)).toBe(0);
		expect(drumStepTime(4, 120, 0)).toBeCloseTo(0.5);
		expect(drumStepTime(16, 60, 0)).toBeCloseTo(4);
	});
	test("swing pushes the off-sixteenths late, up to a third of a step", () => {
		expect(drumStepTime(1, 120, 0)).toBeCloseTo(0.125);
		expect(drumStepTime(1, 120, 1)).toBeCloseTo(0.125 + 0.125 / 3);
		expect(drumStepTime(2, 120, 1)).toBeCloseTo(0.25);
		expect(drumStepTime(3, 120, 0.5)).toBeCloseTo(0.375 + 0.125 / 6);
	});
});

describe("encodeDrumMidi", () => {
	test("a pattern reads back as General MIDI drum notes at the tempo, muted rows left out", async () => {
		const p = startingDrumProject();
		p.patterns[0]!.rows[1]!.mute = true; // the snare
		p.patterns[0]!.rows[0]!.cells[4] = 3; // an accent on beat 2
		const midi = parseMidi(await encodeDrumMidi(p.patterns[0]!, 100, 0).arrayBuffer());
		const kicks = midi.notes.filter((n) => n.pitch === 36);
		expect(kicks.map((n) => n.start)).toEqual([0, 0.6, 1.2, 1.8]); // a beat is 0.6 s at 100 bpm
		expect(kicks.map((n) => n.velocity)).toEqual([95, 121, 95, 95]); // level 0.9 scales 100 and 127
		expect(midi.notes.some((n) => n.pitch === 38)).toBe(false);
		expect(midi.notes.filter((n) => n.pitch === 42)).toHaveLength(7);
		expect(midi.notes.every((n) => n.channel === 9)).toBe(true);
	});
	test("swing moves the off-sixteenths late", async () => {
		const p = startingDrumProject().patterns[0]!;
		p.rows[2]!.cells = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const midi = parseMidi(await encodeDrumMidi(p, 120, 1).arrayBuffer());
		const hats = midi.notes.filter((n) => n.pitch === 42).map((n) => n.start);
		expect(hats[0]).toBe(0);
		expect(hats[1]).toBeCloseTo(0.125 + 0.125 / 3, 2);
	});
	test("on the 1/8 grid swing moves the off-beat eighths, not the sixteenths", async () => {
		const p = startingDrumProject().patterns[0]!;
		p.rows[2]!.cells = [2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const midi = parseMidi(await encodeDrumMidi(p, 120, 1, 8).arrayBuffer());
		const hats = midi.notes.filter((n) => n.pitch === 42).map((n) => n.start);
		expect(hats[0]).toBe(0);
		expect(hats[1]).toBeCloseTo(0.125, 2);
		expect(hats[2]).toBeCloseTo(0.25 + 0.25 / 3, 2);
	});
	test("a song writes its bars one after another, the time signature where it changes", async () => {
		const p = startingDrumProject();
		const waltz = resizeDrumPattern({ ...emptyDrumPattern(p.patterns[0]!), meter: "3/4" }, 12);
		waltz.rows[0]!.cells[0] = 2; // a kick on the one of the 3/4 bar
		const midi = parseMidi(
			await encodeDrumMidi([p.patterns[0]!, waltz, p.patterns[0]!], 120, 0).arrayBuffer(),
		);
		const kicks = midi.notes.filter((n) => n.pitch === 36).map((n) => n.start);
		// Bar 1: beats at 0.5 s; bar 2 (three beats) starts at 2 s and has one kick; bar 3 starts at 3.5 s.
		expect(kicks).toEqual([0, 0.5, 1, 1.5, 2, 3.5, 4, 4.5, 5]);
	});
});
