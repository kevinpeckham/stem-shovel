import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	ProgressionDataSchema,
	ProgressionEntrySchema,
	ProgressionSaveSchema,
} from "./ProgressionSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;
const chord = { kind: "chord", label: "Am7", wedge: "Am", notes: [57, 60, 64, 67], beats: 2 };
const rest = { kind: "rest", beats: 1 };

describe("ProgressionEntrySchema", () => {
	it("is a chord with notes or a rest, with beats of 1, 2 or 4", () => {
		expect(v.parse(ProgressionEntrySchema, chord)).toEqual(chord);
		expect(v.parse(ProgressionEntrySchema, rest)).toEqual(rest);
		expect(ok(ProgressionEntrySchema, { ...chord, beats: 3 })).toBe(false);
		expect(ok(ProgressionEntrySchema, { ...chord, notes: [] })).toBe(false);
		expect(ok(ProgressionEntrySchema, { ...chord, notes: Array(13).fill(60) })).toBe(false);
		expect(ok(ProgressionEntrySchema, { ...chord, notes: [128] })).toBe(false);
		expect(ok(ProgressionEntrySchema, { ...chord, label: "x".repeat(17) })).toBe(false);
		expect(ok(ProgressionEntrySchema, { kind: "pause", beats: 1 })).toBe(false);
	});
});

describe("ProgressionDataSchema", () => {
	const data = { bpm: 96, beatsPerBar: 4, entries: [chord, rest] };
	const okWith = (patch: object) => ok(ProgressionDataSchema, { ...data, ...patch });
	it("keeps the tempo, meter, entries and an optional style", () => {
		expect(v.parse(ProgressionDataSchema, data)).toEqual(data);
		expect(v.parse(ProgressionDataSchema, { ...data, style: "custom:abc" }).style).toBe(
			"custom:abc",
		);
		expect(okWith({ entries: [] })).toBe(true);
	});
	it("bounds the tempo, the meter and the entry count", () => {
		expect(okWith({ bpm: 29 })).toBe(false);
		expect(okWith({ bpm: 301 })).toBe(false);
		expect(okWith({ beatsPerBar: 7 })).toBe(false);
		expect(okWith({ beatsPerBar: 4.5 })).toBe(false);
		expect(okWith({ entries: Array(401).fill(rest) })).toBe(false);
		expect(okWith({ style: "x".repeat(49) })).toBe(false);
	});
});

describe("ProgressionSaveSchema", () => {
	it("trims the name and gives the notes an empty default", () => {
		const data = { bpm: 120, beatsPerBar: 3, entries: [] };
		const saved = v.parse(ProgressionSaveSchema, { accountId: id, name: " Waltz ", data });
		expect(saved).toEqual({ accountId: id, name: "Waltz", data, notes: "" });
		const long = { accountId: id, name: "W", data, notes: "x".repeat(50_001) };
		expect(ok(ProgressionSaveSchema, long)).toBe(false);
	});
});
