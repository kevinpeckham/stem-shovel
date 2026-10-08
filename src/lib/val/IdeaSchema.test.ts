import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { startingDrumProject } from "#lib/utils/startingDrumProject.js";
import {
	IdeaCreateSchema,
	IdeaInstrumentsDataSchema,
	IdeaNotesSchema,
	LooperSettingsSchema,
	TakeNameSchema,
} from "./IdeaSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("IdeaCreateSchema, IdeaNotesSchema and TakeNameSchema", () => {
	it("make an idea by default and trim the title", () => {
		expect(v.parse(IdeaCreateSchema, { title: " Riff " })).toEqual({ title: "Riff", kind: "idea" });
		expect(ok(IdeaCreateSchema, { title: "Loop", kind: "loop" })).toBe(true);
		expect(ok(IdeaCreateSchema, { title: "Beat", kind: "beat" })).toBe(false);
		expect(ok(IdeaCreateSchema, { title: " " })).toBe(false);
	});
	it("cap the notes and let a take name be cleared", () => {
		expect(ok(IdeaNotesSchema, { id, markdown: "x".repeat(50_000) })).toBe(true);
		expect(ok(IdeaNotesSchema, { id, markdown: "x".repeat(50_001) })).toBe(false);
		expect(v.parse(TakeNameSchema, { id, title: "  " }).title).toBe("");
		expect(ok(TakeNameSchema, { id, title: "x".repeat(121) })).toBe(false);
	});
});

describe("LooperSettingsSchema", () => {
	const layer = { label: "Guitar", source: "line", gain: 0.8, muted: false };
	const looper = { bpm: 90, beatsPerBar: 4, bars: 2, layers: [layer] };
	const okWith = (patch: object) => ok(LooperSettingsSchema, { ...looper, ...patch });
	it("keeps a loop's tempo, length and layers within their choices", () => {
		expect(v.parse(LooperSettingsSchema, looper)).toEqual(looper);
		expect(okWith({ bpm: 39 })).toBe(false);
		expect(okWith({ bars: 3 })).toBe(false);
		expect(okWith({ beatsPerBar: 5 })).toBe(false);
		expect(okWith({ layers: [{ ...layer, source: "radio" }] })).toBe(false);
		expect(okWith({ layers: [{ ...layer, gain: 1.1 }] })).toBe(false);
		expect(okWith({ layers: [{ ...layer, label: "x".repeat(61) }] })).toBe(false);
		expect(okWith({ layers: Array(16).fill(layer) })).toBe(true);
		expect(okWith({ layers: Array(17).fill(layer) })).toBe(false);
	});
});

describe("IdeaInstrumentsDataSchema", () => {
	it("takes nulls until an instrument was used and fills a piano's defaults", () => {
		expect(v.parse(IdeaInstrumentsDataSchema, { drums: null, piano: null })).toEqual({
			drums: null,
			piano: null,
			looper: null,
			chords: null,
		});
		const parsed = v.parse(IdeaInstrumentsDataSchema, { drums: startingDrumProject(), piano: {} });
		expect(parsed.drums).toEqual(startingDrumProject());
		expect(parsed.piano?.instrument).toBe("grand");
		expect(ok(IdeaInstrumentsDataSchema, { drums: null })).toBe(false);
		const chords = { drums: null, piano: null, chords: { mode: "loud" } };
		expect(ok(IdeaInstrumentsDataSchema, chords)).toBe(false);
	});
});
