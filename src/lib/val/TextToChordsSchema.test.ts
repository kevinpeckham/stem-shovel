import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	TextToChordsReplySchema,
	TextToChordsSchema,
	TextToChordsSetupSchema,
} from "./TextToChordsSchema";

const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("TextToChordsSchema", () => {
	const ask = { prompt: "  lo-fi, late at night ", beatsPerBar: 4, key: 11, style: "plain" };
	it("trims the prompt and bounds its length, the meter and the key", () => {
		expect(v.parse(TextToChordsSchema, ask).prompt).toBe("lo-fi, late at night");
		expect(ok(TextToChordsSchema, { ...ask, prompt: " a " })).toBe(false);
		expect(ok(TextToChordsSchema, { ...ask, prompt: "x".repeat(301) })).toBe(false);
		expect(ok(TextToChordsSchema, { ...ask, beatsPerBar: 5 })).toBe(false);
		expect(ok(TextToChordsSchema, { ...ask, key: 12 })).toBe(false);
		expect(ok(TextToChordsSchema, { ...ask, style: "x".repeat(49) })).toBe(false);
	});
});

describe("TextToChordsReplySchema", () => {
	const reply = { chords: [{ degree: "I" }, { degree: "vi", seventh: true, beats: 2 }] };
	it("needs only the chords and trims the rest", () => {
		expect(v.parse(TextToChordsReplySchema, reply)).toEqual(reply);
		const named = v.parse(TextToChordsReplySchema, {
			...reply,
			name: " Night ",
			bpm: 72,
			key: "Db",
			style: "jazz",
			note: null,
		});
		expect(named.name).toBe("Night");
		expect(named.note).toBeNull();
	});
	it("bounds the chords and what the model may say about them", () => {
		const chords = (n: number) => Array.from({ length: n }, () => ({ degree: "V" }));
		expect(ok(TextToChordsReplySchema, { chords: [] })).toBe(false);
		expect(ok(TextToChordsReplySchema, { chords: chords(64) })).toBe(true);
		expect(ok(TextToChordsReplySchema, { chords: chords(65) })).toBe(false);
		expect(ok(TextToChordsReplySchema, { chords: [{ degree: " " }] })).toBe(false);
		expect(ok(TextToChordsReplySchema, { chords: [{ degree: "bVII7sus" }] })).toBe(false);
		expect(ok(TextToChordsReplySchema, { chords: [{ degree: "I", beats: 3 }] })).toBe(false);
		expect(ok(TextToChordsReplySchema, { ...reply, bpm: 241 })).toBe(false);
		expect(ok(TextToChordsReplySchema, { ...reply, key: "C#" })).toBe(false);
		expect(ok(TextToChordsReplySchema, { ...reply, style: "polka" })).toBe(false);
		expect(ok(TextToChordsReplySchema, { ...reply, name: "x".repeat(41) })).toBe(false);
	});
});

describe("TextToChordsSetupSchema", () => {
	it("takes nulls for anything and percentages for the effects and the gate", () => {
		expect(ok(TextToChordsSetupSchema, { sound: null, arp: null, effects: { reverb: null } })).toBe(
			true,
		);
		expect(ok(TextToChordsSetupSchema, { effects: { reverb: 100, delay: 0 } })).toBe(true);
		expect(ok(TextToChordsSetupSchema, { effects: { reverb: 101 } })).toBe(false);
		expect(ok(TextToChordsSetupSchema, { arp: { on: true, gate: 10 } })).toBe(true);
		expect(ok(TextToChordsSetupSchema, { arp: { on: true, gate: 5 } })).toBe(false);
		expect(ok(TextToChordsSetupSchema, { arp: { gate: 50 } })).toBe(false);
		expect(ok(TextToChordsSetupSchema, { octave: 7 })).toBe(false);
		expect(ok(TextToChordsSetupSchema, { strumPattern: "folk", strumSpeed: "8" })).toBe(true);
		expect(ok(TextToChordsSetupSchema, { sound: "banjo" })).toBe(false);
	});
});
