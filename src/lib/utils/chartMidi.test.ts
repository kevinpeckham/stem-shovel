import { readSmf, type SmfEvent } from "@barmark/midi";
import { describe, expect, it } from "vite-plus/test";
import { chartMidi } from "./chartMidi.js";

const TEMPO = 0x51;
/** Microseconds a quarter from the file's first tempo meta event. */
function firstTempo(bytes: Uint8Array): number | null {
	const events = readSmf(bytes).smf?.tracks.flat() ?? [];
	const meta = events.find(
		(e): e is Extract<SmfEvent, { kind: "meta" }> => e.kind === "meta" && e.type === TEMPO,
	);
	return meta ? (meta.data[0]! << 16) | (meta.data[1]! << 8) | meta.data[2]! : null;
}

describe("chartMidi", () => {
	it("a chart with bars becomes a Standard MIDI File", () => {
		const bytes = chartMidi("# Song\nkey: C major\ntime: 4/4\n\n## Verse\n| C | F | G | C |", "x");
		expect(bytes).not.toBeNull();
		expect(new TextDecoder().decode(bytes!.slice(0, 4))).toBe("MThd");
	});
	it("the song's tempo times a chart with none of its own", () => {
		expect(firstTempo(chartMidi("| C | F |", "Song", 96)!)).toBe(625000);
		expect(firstTempo(chartMidi("| C | F |", "Song", null)!)).toBe(500000);
	});
	it("the chart's own tempo wins", () => {
		expect(firstTempo(chartMidi("tempo: 60\n| C | F |", "Song", 96)!)).toBe(1000000);
	});
	it("a blank chart, one without bars and one with an error are null", () => {
		expect(chartMidi("", "Song")).toBeNull();
		expect(chartMidi("  \n ", "Song")).toBeNull();
		expect(chartMidi("Title: Song\nkey: F", "Song")).toBeNull();
		expect(chartMidi("| C | Hb |", "Song")).toBeNull();
	});
});
