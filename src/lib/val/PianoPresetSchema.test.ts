import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	ArpSettingsSchema,
	ChordPresetSettingsSchema,
	PianoPresetDataSchema,
	PianoPresetSaveSchema,
	PianoPresetSlotSchema,
} from "./PianoPresetSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("PianoPresetDataSchema", () => {
	it("fills an empty preset with the engine's defaults", () => {
		const data = v.parse(PianoPresetDataSchema, {});
		expect(data.instrument).toBe("grand");
		expect(data.reverb).toBe(0.25);
		expect(data.delay).toEqual({ time: 0.35, feedback: 0.35, level: 0, analog: false });
		expect(data.wah).toEqual({
			mode: "touch",
			sensitivity: 0.5,
			rate: 1,
			range: 0.7,
			resonance: 0.5,
			mix: 0,
		});
		expect(data.compressor).toEqual({ amount: 0, ratio: 4, attack: 0.01, release: 0.2, makeup: 0 });
		expect(data.bounce).toEqual({ depth: 0, division: "beat", glide: 0.5, centre: false });
		expect(data.arp).toBeUndefined();
		expect(data.chords).toBeUndefined();
	});
	it("fills a partial effect around what it names", () => {
		const data = v.parse(PianoPresetDataSchema, {
			delay: { level: 0.4 },
			tremolo: { shape: "square" },
		});
		expect(data.delay).toEqual({ time: 0.35, feedback: 0.35, level: 0.4, analog: false });
		expect(data.tremolo).toEqual({ rate: 5, depth: 0, shape: "square" });
	});
	it("refuses values past each effect's range", () => {
		expect(ok(PianoPresetDataSchema, { reverb: 1.1 })).toBe(false);
		expect(ok(PianoPresetDataSchema, { instrument: "banjo" })).toBe(false);
		expect(ok(PianoPresetDataSchema, { delay: { time: 0.01 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { delay: { feedback: 0.95 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { chorus: { rate: 6 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { tremolo: { rate: 0.4 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { tone: { tilt: -1.5 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { compressor: { ratio: 21 } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { bounce: { division: "triplet" } })).toBe(false);
		expect(ok(PianoPresetDataSchema, { rotary: { speed: "medium" } })).toBe(false);
	});
});

describe("ArpSettingsSchema", () => {
	const arp = { on: true, rate: "8", pattern: "up", octaves: 2, gate: 0.5, latch: false };
	it("takes the required fields and bounds octaves, gate and rate", () => {
		expect(ok(ArpSettingsSchema, arp)).toBe(true);
		expect(ok(ArpSettingsSchema, { ...arp, octaves: 4 })).toBe(false);
		expect(ok(ArpSettingsSchema, { ...arp, octaves: 1.5 })).toBe(false);
		expect(ok(ArpSettingsSchema, { ...arp, gate: 0.05 })).toBe(false);
		expect(ok(ArpSettingsSchema, { ...arp, rate: "32" })).toBe(false);
		expect(ok(ArpSettingsSchema, { ...arp, ratio: 4 })).toBe(false);
		expect(ok(ArpSettingsSchema, { ...arp, alignBars: 1, ratio: 0.5, swing: 1 })).toBe(true);
	});
});

describe("ChordPresetSettingsSchema", () => {
	const chords = { mode: "chords", style: "jazz", voicing: "spread", octave: 4, strum: "slow" };
	it("bounds the octave, the velocity and the style id", () => {
		expect(ok(ChordPresetSettingsSchema, chords)).toBe(true);
		expect(ok(ChordPresetSettingsSchema, { ...chords, octave: 7 })).toBe(false);
		expect(ok(ChordPresetSettingsSchema, { ...chords, velocity: 0.1 })).toBe(false);
		expect(ok(ChordPresetSettingsSchema, { ...chords, style: "x".repeat(49) })).toBe(false);
		expect(ok(ChordPresetSettingsSchema, { ...chords, voicing: "wide" })).toBe(false);
		const strum = (pattern: string) => ({
			...chords,
			autoStrum: { pattern, speed: "16", latch: true },
		});
		expect(ok(ChordPresetSettingsSchema, strum("folk"))).toBe(true);
		expect(ok(ChordPresetSettingsSchema, strum("nope"))).toBe(false);
	});
});

describe("PianoPresetSlotSchema and PianoPresetSaveSchema", () => {
	it("take slots 1 to 5, whole", () => {
		const slots = [0, 1, 5, 6, 2.5].map((slot) => ok(PianoPresetSlotSchema, slot));
		expect(slots).toEqual([false, true, true, false, false]);
	});
	it("default the instrument to the piano and let the slot be null", () => {
		const save = { accountId: id, name: " Bright ", slot: null, data: {} };
		const saved = v.parse(PianoPresetSaveSchema, save);
		expect(saved.instrument).toBe("piano");
		expect(saved.name).toBe("Bright");
		expect(saved.slot).toBeNull();
		expect(ok(PianoPresetSaveSchema, { ...save, instrument: "drums" })).toBe(false);
	});
});
