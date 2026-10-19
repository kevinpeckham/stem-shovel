import type { StudioArrangement, StudioClip, StudioTrack } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { diffArrangements } from "./diffArrangements";

const track = (id: string, name: string, over: Partial<StudioTrack> = {}): StudioTrack => ({
	id,
	name,
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: null,
	...over,
});
const clip = (
	id: string,
	trackId: string,
	start: number,
	over: Partial<StudioClip> = {},
): StudioClip => ({
	id,
	trackId,
	sourceId: "V1StGXR8_Z5jdHi6B-myT",
	start,
	offset: 0,
	duration: 4,
	gain: 1,
	fadeIn: 0,
	fadeOut: 0,
	name: `Clip ${id}`,
	...over,
});
const base = (): StudioArrangement => ({
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	tracks: [track("t1", "Guitar"), track("t2", "Bass")],
	clips: [clip("c1", "t1", 0), clip("c2", "t2", 2)],
});

describe("diffArrangements", () => {
	it("is empty when nothing differs", () => {
		expect(diffArrangements(base(), base())).toEqual([]);
	});
	it("reads tracks added, removed, renamed and re-set, and the tempo", () => {
		const after = base();
		after.bpm = 124;
		after.tracks = [
			track("t1", "Lead", { gain: 0.5, muted: true }),
			track("t3", "Keys", { kind: "midi" }),
		];
		expect(diffArrangements(base(), after)).toEqual([
			"Tempo 120 → 124 bpm",
			"Track Keys added",
			"Track Bass removed",
			"Track Lead: renamed from Guitar, level, muted",
		]);
	});
	it("reads clips added, removed, moved, trimmed and swapped", () => {
		const after = base();
		after.clips = [clip("c1", "t2", 1.5, { duration: 3, fadeIn: 0.2 }), clip("c3", "t1", 8)];
		expect(diffArrangements(base(), after)).toEqual([
			"1 clip added",
			"1 clip removed",
			"Clip Clip c1: moved to Bass, moved 0.00 s → 1.50 s, trimmed, fades",
		]);
	});
	it("reads buses, markers, routing, the tempo map and the master", () => {
		const after = base();
		after.master = 0.8;
		after.buses = [{ id: "b1", name: "Drums", gain: 1, pan: 0, muted: false }];
		after.markers = [{ id: "m1", t: 4, name: "Verse" }];
		after.tempoChanges = [{ start: 8, bpm: 90 }];
		after.tracks[0] = track("t1", "Guitar", { output: "b1" });
		expect(diffArrangements(base(), after)).toEqual([
			"Tempo map changed",
			"Master 100% → 80%",
			"Track Guitar: routing",
			"Bus Drums added",
			"1 marker added",
		]);
		const gone = base();
		gone.buses = [];
		expect(
			diffArrangements(after, { ...gone, master: 0.8, tempoChanges: after.tempoChanges }),
		).toEqual(["Track Guitar: routing", "Bus Drums removed", "1 marker removed"]);
	});
});
