import { describe, expect, it } from "vite-plus/test";
import { decodeChordShare } from "./decodeChordShare";
import { encodeChordShare } from "./encodeChordShare";
import type { ChordShare } from "$lib/val/ChordShareSchema";

const chords: ChordShare["chords"] = {
	mode: "chords",
	style: "jazz",
	voicing: "rich",
	octave: 4,
	strum: "slow",
	arp: {
		on: true,
		rate: "8",
		pattern: "up",
		octaves: 2,
		gate: 0.6,
		latch: true,
		align: true,
		alignBars: 1,
		onBeat: true,
		swing: 0.3,
		ratio: 1,
	},
};

describe("chord share links", () => {
	it("round-trips the settings and fills in the defaults it dropped", () => {
		const share: ChordShare = {
			v: 1,
			piano: { instrument: "epiano", reverb: 0.4 } as ChordShare["piano"],
			chords,
			ui: { keyCenter: 11, layout: "circle" } as ChordShare["ui"],
			bpm: 96,
		};
		const encoded = encodeChordShare(share);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		const back = decodeChordShare(encoded);
		expect(back?.piano.instrument).toBe("epiano");
		expect(back?.piano.reverb).toBe(0.4);
		expect(back?.piano.delay.level).toBe(0);
		expect(back?.chords).toEqual(chords);
		expect(back?.ui).toEqual({
			keyCenter: 11,
			keyAtTop: false,
			layout: "circle",
			keyMap: "degree",
			showKeys: false,
			showSignatures: false,
			showNumerals: false,
			highlightKey: true,
			noteReadout: "both",
		});
		expect(back?.bpm).toBe(96);
	});
	it("keeps a plain setup short by leaving the defaults out", () => {
		const encoded = encodeChordShare({
			v: 1,
			piano: { instrument: "grand" } as ChordShare["piano"],
			chords: { ...chords, arp: { ...chords.arp!, on: false } },
			ui: {} as ChordShare["ui"],
		});
		expect(encoded.length).toBeLessThan(400);
	});
	it("refuses what is not a link", () => {
		expect(decodeChordShare("not a link")).toBeNull();
		expect(decodeChordShare(btoa('{"v":2}'))).toBeNull();
		expect(decodeChordShare(btoa('{"v":1,"chords":{"mode":"loud"}}'))).toBeNull();
	});
});
