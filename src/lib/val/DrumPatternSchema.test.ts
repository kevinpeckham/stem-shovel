import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	DEFAULT_DRUM_FX,
	DRUM_BPM_MAX,
	DRUM_VELOCITY_MAX,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_ROWS,
	MAX_DRUM_TIMELINE,
} from "#lib/constants/drumMachine.js";
import { startingDrumProject } from "#lib/utils/startingDrumProject.js";
import {
	DrumFxSchema,
	DrumPatternSchema,
	DrumProjectSchema,
	DrumProjectV1Schema,
	DrumRowSchema,
} from "./DrumPatternSchema";

const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;
const row = { voice: "snare", level: 0.8, pan: 0, mute: false, cells: [0, 2, 0, 2] };
const pattern = (rows = 1) => ({ steps: 8, rows: Array.from({ length: rows }, () => row) });

describe("DrumRowSchema", () => {
	it("fills the voice's usual sends when a row has none", () => {
		expect(v.parse(DrumRowSchema, row)).toEqual({ ...row, delaySend: 0.45, reverbSend: 0.8 });
		expect(v.parse(DrumRowSchema, { ...row, delaySend: 0 }).delaySend).toBe(0);
	});
	it("bounds the level, the pan and each cell's velocity", () => {
		expect(ok(DrumRowSchema, { ...row, cells: [DRUM_VELOCITY_MAX] })).toBe(true);
		expect(ok(DrumRowSchema, { ...row, cells: [DRUM_VELOCITY_MAX + 1] })).toBe(false);
		expect(ok(DrumRowSchema, { ...row, cells: [1.5] })).toBe(false);
		expect(ok(DrumRowSchema, { ...row, pan: 1.5 })).toBe(false);
		expect(ok(DrumRowSchema, { ...row, level: -0.1 })).toBe(false);
		expect(ok(DrumRowSchema, { ...row, voice: "gong" })).toBe(false);
	});
});

describe("DrumFxSchema", () => {
	const fx = { delayTime: 3, delayFeedback: 0.4, delayReturn: 0, reverbSize: 0.5, reverbReturn: 0 };
	it("gives the newer effects their off values and caps the feedback at 0.9", () => {
		expect(v.parse(DrumFxSchema, fx)).toEqual(DEFAULT_DRUM_FX);
		expect(ok(DrumFxSchema, { ...fx, delayFeedback: 0.9 })).toBe(true);
		expect(ok(DrumFxSchema, { ...fx, delayFeedback: 0.91 })).toBe(false);
		expect(ok(DrumFxSchema, { ...fx, delayTime: 5 })).toBe(false);
		expect(ok(DrumFxSchema, { ...fx, wahBars: 3 })).toBe(false);
		expect(ok(DrumFxSchema, { ...fx, toneTilt: -1 })).toBe(true);
	});
});

describe("DrumPatternSchema", () => {
	it("reads 4/4 when there is no meter and bounds the steps and the rows", () => {
		expect(v.parse(DrumPatternSchema, pattern()).meter).toBe("4/4");
		expect(ok(DrumPatternSchema, { ...pattern(), meter: "6/8", steps: 24 })).toBe(true);
		expect(ok(DrumPatternSchema, { ...pattern(), steps: 10 })).toBe(false);
		expect(ok(DrumPatternSchema, pattern(0))).toBe(false);
		expect(ok(DrumPatternSchema, pattern(MAX_DRUM_ROWS))).toBe(true);
		expect(ok(DrumPatternSchema, pattern(MAX_DRUM_ROWS + 1))).toBe(false);
	});
});

describe("DrumProjectSchema", () => {
	const project = { v: 2, bpm: 120, swing: 0, humanize: 0, kit: "acoustic", patterns: [pattern()] };
	const okWith = (patch: object) => ok(DrumProjectSchema, { ...project, ...patch });
	it("passes the starting project and fills in what an older project lacks", () => {
		expect(v.parse(DrumProjectSchema, startingDrumProject())).toEqual(startingDrumProject());
		const parsed = v.parse(DrumProjectSchema, project);
		expect(parsed.fx).toEqual(DEFAULT_DRUM_FX);
		expect(parsed.swingGrid).toBe(16);
		expect(parsed.timeline).toEqual([]);
	});
	it("bounds the tempo, the pattern count, the timeline and the kit id", () => {
		expect(okWith({ bpm: DRUM_BPM_MAX })).toBe(true);
		expect(okWith({ bpm: DRUM_BPM_MAX + 1 })).toBe(false);
		expect(okWith({ bpm: 100.5 })).toBe(false);
		expect(okWith({ v: 1 })).toBe(false);
		expect(okWith({ swingGrid: 4 })).toBe(false);
		const many = Array.from({ length: MAX_DRUM_PATTERNS + 1 }, () => pattern());
		expect(okWith({ patterns: many })).toBe(false);
		expect(okWith({ patterns: many.slice(1) })).toBe(true);
		expect(okWith({ timeline: [MAX_DRUM_PATTERNS - 1] })).toBe(true);
		expect(okWith({ timeline: [MAX_DRUM_PATTERNS] })).toBe(false);
		expect(okWith({ timeline: Array(MAX_DRUM_TIMELINE).fill(0) })).toBe(true);
		expect(okWith({ timeline: Array(MAX_DRUM_TIMELINE + 1).fill(0) })).toBe(false);
		expect(okWith({ kit: "V1StGXR8_Z5jdHi6B-myT" })).toBe(true);
		expect(okWith({ kit: "x".repeat(41) })).toBe(false);
		expect(okWith({ kit: "" })).toBe(false);
	});
});

describe("DrumProjectV1Schema", () => {
	it("takes the old shape with its three step counts and rows without pan or sends", () => {
		const { pan: _pan, ...v1row } = row;
		const v1 = { v: 1, bpm: 120, swing: 0.5, steps: 32, kit: "acoustic", rows: [v1row] };
		expect(ok(DrumProjectV1Schema, v1)).toBe(true);
		expect(ok(DrumProjectV1Schema, { ...v1, steps: 12 })).toBe(false);
		expect(ok(DrumProjectV1Schema, { ...v1, rows: [] })).toBe(false);
	});
});
