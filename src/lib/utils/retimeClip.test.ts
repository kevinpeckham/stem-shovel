import { describe, expect, it } from "vite-plus/test";
import { studioGrid } from "./studioGrid";
import { retimeClip } from "./retimeClip";
import type { StudioClip } from "#lib/val/StudioSchema.js";

const midi: StudioClip = {
	id: "m",
	trackId: "t",
	notes: [
		{ t: 0, d: 0.5, p: 60, v: 1 },
		{ t: 1.5, d: 0.25, p: 64, v: 1 },
	],
	lanes: [{ kind: "cc", controller: 1, points: [{ t: 1, v: 0.5 }] }],
	start: 4,
	offset: 0.5,
	duration: 2,
	loop: { start: 0, end: 2.5 },
	gain: 1,
	fadeIn: 0,
	fadeOut: 0,
	name: "Keys",
	anchor: "beats",
};

describe("retimeClip", () => {
	it("keeps a MIDI clip's beats when the tempo halves: everything twice as late and twice as long", () => {
		const { clip, stretch } = retimeClip(
			midi,
			studioGrid({ bpm: 120, beatsPerBar: 4 }),
			studioGrid({ bpm: 60, beatsPerBar: 4 }),
		);
		expect(stretch).toBe(1);
		expect([clip.start, clip.offset, clip.duration]).toEqual([8, 1, 4]);
		expect(clip.notes).toEqual([
			{ t: 0, d: 1, p: 60, v: 1 },
			{ t: 3, d: 0.5, p: 64, v: 1 },
		]);
		expect(clip.lanes![0]!.points).toEqual([{ t: 2, v: 0.5 }]);
		expect(clip.loop).toEqual({ start: 0, end: 5 });
	});
	it("follows a tempo change placed inside the clip, note by note", () => {
		// 120 until 5 s, then 60: the clip starts at 4 s (beat 8), its second note at 5.5 s (beat 10.5) lands later.
		const after = studioGrid({ bpm: 120, beatsPerBar: 4, tempoChanges: [{ start: 5, bpm: 60 }] });
		const { clip } = retimeClip(midi, studioGrid({ bpm: 120, beatsPerBar: 4 }), after);
		expect(clip.start).toBe(4);
		// Beat 10.5 on the new map: 10 beats by 5 s, half a beat at 60 is 0.5 s → 5.5 s... the note sits at content 1.5 after
		// the origin 3.5 s (beat 7): beat 10 is 5 s, so content 1.5 (beat 7 → 10) stays 1.5 s long; its end at beat 10.5 is 5.5 s.
		expect(clip.notes![1]).toEqual({ t: 1.5, d: 0.5, p: 64, v: 1 });
		// The clip's end at beat 12: two beats past 5 s at 60 bpm are 2 s → 7 s, so the clip runs 3 s.
		expect(clip.duration).toBe(3);
	});
	it("moves an audio clip's start and hands back the factor its content must stretch by", () => {
		const audio: StudioClip = {
			...midi,
			notes: undefined,
			sourceId: "s",
			lanes: undefined,
			loop: undefined,
		};
		delete (audio as { notes?: unknown }).notes;
		const { clip, stretch } = retimeClip(
			audio,
			studioGrid({ bpm: 120, beatsPerBar: 4 }),
			studioGrid({ bpm: 90, beatsPerBar: 4 }),
		);
		expect(clip.start).toBeCloseTo(5.3333, 3);
		expect(clip.duration).toBe(2);
		expect(stretch).toBeCloseTo(4 / 3, 6);
	});
});
