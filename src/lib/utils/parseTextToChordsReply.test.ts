import { describe, expect, it } from "vite-plus/test";
import { parseTextToChordsReply } from "./parseTextToChordsReply";

describe("parseTextToChordsReply", () => {
	it("reads numerals, their case, sevenths and beats", () => {
		const r = parseTextToChordsReply(
			`Here you go:\n{"name":"Doo-wop","bpm":110,"key":"Eb","style":"jazz","chords":[{"degree":"I","beats":2},{"degree":"vi","beats":2},{"degree":"ii","seventh":true},{"degree":"V","seventh":true,"beats":4}]}`,
			4,
		);
		expect(r.name).toBe("Doo-wop");
		expect(r.bpm).toBe(110);
		expect(r.keyCenter).toBe(9);
		expect(r.style).toBe("jazz");
		expect(r.chords).toEqual([
			{ fifths: 0, quality: "major", beats: 2, seventh: false },
			{ fifths: 3, quality: "minor", beats: 2, seventh: false },
			{ fifths: 2, quality: "minor", beats: 4, seventh: true },
			{ fifths: 1, quality: "major", beats: 4, seventh: true },
		]);
	});
	it("takes borrowed degrees, a stated quality over the case, and two beats a bar in three", () => {
		const r = parseTextToChordsReply(
			`{"chords":[{"degree":"bVII"},{"degree":"#iv"},{"degree":"VI","quality":"minor"},{"degree":"♭III"}]}`,
			3,
		);
		expect(r.chords.map((c) => [c.fifths, c.quality, c.beats])).toEqual([
			[10, "major", 2],
			[6, "minor", 2],
			[3, "minor", 2],
			[9, "major", 2],
		]);
		expect(r.name).toBe("From a description");
		expect(r.keyCenter).toBeNull();
	});
	it("reads the player's setup, percentages to levels, nulls left out", () => {
		const r = parseTextToChordsReply(
			`{"chords":[{"degree":"I"}],"setup":{"mode":"chords","sound":"epiano","voicing":"rich","strum":"slow","strumPattern":"folk","arp":{"on":true,"rate":"16","gate":60,"swing":25,"latch":null},"octave":3,"sustain":true,"effects":{"reverb":40,"delay":null,"chorus":20}}}`,
			4,
		);
		expect(r.setup).toEqual({
			mode: "chords",
			instrument: "epiano",
			voicing: "rich",
			strum: "slow",
			strumPattern: "folk",
			arp: { on: true, rate: "16", gate: 0.6, swing: 0.25 },
			octave: 3,
			sustain: true,
			effects: { reverb: 0.4, chorusMix: 0.2 },
		});
		expect(parseTextToChordsReply(`{"chords":[{"degree":"I"}]}`, 4).setup).toEqual({});
	});
	it("refuses what it cannot read, with a reason", () => {
		expect(() => parseTextToChordsReply("no json here", 4)).toThrow("no JSON object");
		expect(() => parseTextToChordsReply(`{"chords":[]}`, 4)).toThrow();
		expect(() => parseTextToChordsReply(`{"chords":[{"degree":"VIII"}]}`, 4)).toThrow(
			"not a degree",
		);
		expect(() => parseTextToChordsReply(`{"chords":[{"degree":"I","beats":3}]}`, 4)).toThrow();
	});
});
