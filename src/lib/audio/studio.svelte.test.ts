import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";

/**
 * The Studio engine's range edits (docs/dawn-daw-plan.md, D4): deleteRange
 * and insertRange change the arrangement in one undo step, the clips
 * through utils/rangeDelete.ts and utils/rangeInsert.ts, and with them
 * (on a ripple or an insert) the markers, tempo changes, automation
 * points and loop region after the edit. Stopped, so no AudioContext.
 */
const { studio } = await import("./studio.svelte");

const clip = (id: string, trackId: string, start: number, duration: number): StudioClip => ({
	id,
	trackId,
	sourceId: "src_000000000000000000a",
	start,
	offset: 0,
	duration,
	gain: 1,
	fadeIn: 0,
	fadeOut: 0,
	name: id,
});
const track = (id: string) => ({
	id,
	name: id,
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: null,
});

function arrangement(): StudioArrangement {
	return {
		version: 1,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: false,
		loop: { on: true, start: 8, end: 10 },
		master: 1,
		tracks: [
			{
				...track("t1"),
				automation: {
					volume: [
						{ t: 1, v: 1 },
						{ t: 3, v: 0.5 },
						{ t: 6, v: 0.8 },
					],
				},
			},
			track("t2"),
		],
		clips: [clip("a", "t1", 0, 10), clip("b", "t2", 6, 2)],
		markers: [{ id: "m1", t: 7, name: "Chorus" }],
		tempoChanges: [{ start: 6, bpm: 100 }],
	};
}
const spans = () =>
	studio.arrangement.clips.map((c) => [c.id, c.trackId, c.start, c.duration, c.offset]);

beforeEach(() => {
	studio.arrangement = arrangement();
});

describe("studio.deleteRange", () => {
	it("cuts the range out of every track and leaves the rest of the timeline", () => {
		expect(studio.deleteRange(2, 5)).toBe(true);
		const [left, right] = studio.arrangement.clips;
		expect(left).toMatchObject({ id: "a", start: 0, duration: 2 });
		expect(right).toMatchObject({ trackId: "t1", start: 5, duration: 5, offset: 5 });
		expect(right?.id).not.toBe("a");
		expect(studio.arrangement.clips[2]).toMatchObject({ id: "b", start: 6 });
		expect(studio.arrangement.markers?.[0]?.t).toBe(7);
		expect(studio.arrangement.tracks[0]?.automation?.volume).toHaveLength(3);
		expect(studio.canUndo).toBe(true);
		studio.undo();
		expect(spans()).toEqual([
			["a", "t1", 0, 10, 0],
			["b", "t2", 6, 2, 0],
		]);
	});
	it("with ripple closes the gap: clips, markers, tempo, automation and loop move earlier", () => {
		expect(studio.deleteRange(2, 5, true)).toBe(true);
		expect(spans().slice(1)).toEqual([
			[expect.any(String), "t1", 2, 5, 5],
			["b", "t2", 3, 2, 0],
		]);
		expect(studio.arrangement.markers?.[0]?.t).toBe(4);
		expect(studio.arrangement.tempoChanges?.[0]?.start).toBe(3);
		expect(studio.arrangement.tracks[0]?.automation?.volume).toEqual([
			{ t: 1, v: 1 },
			{ t: 3, v: 0.8 },
		]);
		expect(studio.arrangement.loop).toEqual({ on: true, start: 5, end: 7 });
	});
	it("refuses a range under a millisecond, or an empty one without ripple", () => {
		expect(studio.deleteRange(2, 2.0005, true)).toBe(false);
		expect(studio.deleteRange(11, 12)).toBe(false);
		expect(spans()).toEqual([
			["a", "t1", 0, 10, 0],
			["b", "t2", 6, 2, 0],
		]);
	});
});

describe("studio.insertRange", () => {
	it("splits what crosses the point and moves everything after it later", () => {
		expect(studio.insertRange(4, 2)).toBe(true);
		expect(spans()).toEqual([
			["a", "t1", 0, 4, 0],
			[expect.any(String), "t1", 6, 6, 4],
			["b", "t2", 8, 2, 0],
		]);
		expect(studio.arrangement.markers?.[0]?.t).toBe(9);
		expect(studio.arrangement.tempoChanges?.[0]?.start).toBe(8);
		expect(studio.arrangement.tracks[0]?.automation?.volume?.map((p) => p.t)).toEqual([1, 3, 8]);
		expect(studio.arrangement.loop).toEqual({ on: true, start: 10, end: 12 });
	});
	it("refuses nothing inserted", () => {
		expect(studio.insertRange(4, 0)).toBe(false);
	});
});
