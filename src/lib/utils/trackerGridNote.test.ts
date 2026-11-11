import { describe, expect, it } from "vite-plus/test";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { TrackerBarGrid } from "./trackerBarGrid";
import { trackerGridNote } from "./trackerGridNote";

const tracker = (meter: TrackerBarGrid["meter"], barSeconds: number): TrackerBarGrid => ({
	bars: [0, barSeconds, 2 * barSeconds, 3 * barSeconds, 4 * barSeconds],
	meter,
	barSeconds,
});

const set = (meter: string | null, tempo: string | null): SongChange[] => [
	...(meter === null ? [] : [{ kind: "meter" as const, start: 0, value: meter }]),
	...(tempo === null ? [] : [{ kind: "tempo" as const, start: 0, value: tempo }]),
];

describe("trackerGridNote", () => {
	it("null when the song declares nothing to disagree with", () => {
		expect(trackerGridNote(tracker("4/4", 2.5), [], null)).toBeNull();
		expect(
			trackerGridNote(tracker("4/4", 2.5), [{ kind: "key", start: 0, value: "F#m" }], null),
		).toBeNull();
	});

	it("null when the meter and the bar agree", () => {
		// 4/4 at 120: a bar every 2 s.
		expect(trackerGridNote(tracker("4/4", 2), set("4/4", "120"), null)).toBeNull();
	});

	it("null within 4% of the declared bar, a note past it", () => {
		expect(trackerGridNote(tracker("4/4", 2.07), set("4/4", "120"), null)).toBeNull();
		expect(trackerGridNote(tracker("4/4", 1.93), set("4/4", "120"), null)).toBeNull();
		expect(trackerGridNote(tracker("4/4", 2.09), set("4/4", "120"), null)).not.toBeNull();
		expect(trackerGridNote(tracker("4/4", 1.91), set("4/4", "120"), null)).not.toBeNull();
	});

	it("compares seconds a bar, so a 6/8 song's tempo unit never enters", () => {
		// 6/8 at 120 eighths: six eighths a bar, 3 s.
		expect(trackerGridNote(tracker("6/8", 3), set("6/8", "120"), null)).toBeNull();
	});

	it("the exact sentence when the tempo disagrees", () => {
		expect(trackerGridNote(tracker("4/4", 2.5), set("4/4", "120"), null)).toBe(
			"The recording plays 4/4 with a bar every 2.50 s; the song is set to 4/4 at 120 bpm (a bar every 2.00 s). The draft follows the recording, so its bar numbers will not match the player's count until the song's tempo and time signature are changed.",
		);
	});

	it("a note when only the meter disagrees", () => {
		// 3/4 at 90: a bar every 2 s, the tracker's bar length, but three beats against four.
		const note = trackerGridNote(tracker("4/4", 2), set("3/4", "90"), null);
		expect(note).toContain("The recording plays 4/4 with a bar every 2.00 s");
		expect(note).toContain("the song is set to 3/4 at 90 bpm (a bar every 2.00 s)");
	});

	it("a meter with no tempo: the meters alone are compared", () => {
		expect(trackerGridNote(tracker("4/4", 2.5), set("4/4", null), null)).toBeNull();
		expect(trackerGridNote(tracker("4/4", 2.5), set("3/4", null), null)).toContain(
			"the song is set to 3/4. The draft follows",
		);
	});

	it("a tempo with no meter makes no declared bar", () => {
		expect(trackerGridNote(tracker("4/4", 2.5), set(null, "120"), null)).toBeNull();
	});

	it("a later start keeps the declared bar the same length", () => {
		expect(trackerGridNote(tracker("4/4", 2), set("4/4", "120"), 3.25)).toBeNull();
	});
});
