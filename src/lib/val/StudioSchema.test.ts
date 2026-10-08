import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { MAX_STUDIO_NOTES_PER_CLIP, MAX_STUDIO_TRACKS } from "../constants/studio";
import {
	StudioArrangementSchema,
	StudioSourceReserveSchema,
	StudioTrackFxSchema,
} from "./StudioSchema";

const sourceId = "V1StGXR8_Z5jdHi6B-myT";
const track = (id: string) => ({
	id,
	name: "Guitar",
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: { source: "mic", channel: "left" },
});
const clip = (duration: number) => ({
	id: "c1",
	trackId: "t1",
	sourceId,
	start: 4,
	offset: 0.5,
	duration,
	gain: 1,
	fadeIn: 0.01,
	fadeOut: 0.01,
	name: "Take 1",
});
const arrangement = (tracks: unknown[], clips: unknown[]) => ({
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: true,
	click: false,
	loop: null,
	master: 0.8,
	tracks,
	clips,
});

describe("StudioArrangementSchema", () => {
	test("a valid arrangement passes with its values intact", () => {
		const parsed = v.parse(StudioArrangementSchema, arrangement([track("t1")], [clip(8)]));
		expect(parsed.tracks[0].input).toEqual({ source: "mic", channel: "left" });
		expect(parsed.clips[0]).toMatchObject({ start: 4, offset: 0.5, duration: 8 });
	});
	test("more tracks than the cap fail", () => {
		const tracks = Array.from({ length: MAX_STUDIO_TRACKS + 1 }, (_, i) => track(`t${i}`));
		expect(v.safeParse(StudioArrangementSchema, arrangement(tracks, [])).success).toBe(false);
		expect(v.safeParse(StudioArrangementSchema, arrangement(tracks.slice(1), [])).success).toBe(
			true,
		);
	});
	test("a clip with no length fails", () => {
		expect(
			v.safeParse(StudioArrangementSchema, arrangement([track("t1")], [clip(0)])).success,
		).toBe(false);
	});
});

describe("StudioArrangementSchema: MIDI tracks and clips (phase 3)", () => {
	const midiTrack = { ...track("m1"), kind: "midi", input: { source: "piano", channel: "stereo" } };
	const midiClip = (notes: unknown[]) => ({
		...clip(2),
		id: "m-clip",
		trackId: "m1",
		sourceId: undefined,
		notes,
	});
	test("a MIDI track and a clip of notes pass, with the track's kind kept", () => {
		const parsed = v.parse(
			StudioArrangementSchema,
			arrangement([midiTrack], [midiClip([{ t: 0, d: 0.5, p: 60, v: 0.8 }])]),
		);
		expect(parsed.tracks[0].kind).toBe("midi");
		expect(parsed.clips[0].notes).toEqual([{ t: 0, d: 0.5, p: 60, v: 0.8 }]);
		expect(parsed.clips[0].sourceId).toBeUndefined();
	});
	test("a clip with both a source and notes, or neither, fails", () => {
		expect(
			v.safeParse(
				StudioArrangementSchema,
				arrangement([midiTrack], [{ ...midiClip([]), sourceId }]),
			).success,
		).toBe(false);
		expect(
			v.safeParse(
				StudioArrangementSchema,
				arrangement([track("t1")], [{ ...clip(2), sourceId: undefined }]),
			).success,
		).toBe(false);
	});
	test("a note's pitch, velocity and length are bounded, and a clip holds at most the cap", () => {
		const bad = [
			{ t: 0, d: 0.5, p: 128, v: 0.5 },
			{ t: 0, d: 0.5, p: 60.5, v: 0.5 },
			{ t: 0, d: 0.5, p: 60, v: 1.5 },
			{ t: 0, d: 0, p: 60, v: 0.5 },
			{ t: -1, d: 0.5, p: 60, v: 0.5 },
		];
		for (const note of bad)
			expect(
				v.safeParse(StudioArrangementSchema, arrangement([midiTrack], [midiClip([note])])).success,
			).toBe(false);
		const many = Array.from({ length: MAX_STUDIO_NOTES_PER_CLIP + 1 }, (_, i) => ({
			t: i * 0.01,
			d: 0.01,
			p: 60,
			v: 0.5,
		}));
		expect(
			v.safeParse(StudioArrangementSchema, arrangement([midiTrack], [midiClip(many)])).success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, arrangement([midiTrack], [midiClip(many.slice(1))]))
				.success,
		).toBe(true);
	});
	test("a track kind outside audio and midi fails", () => {
		expect(
			v.safeParse(StudioArrangementSchema, arrangement([{ ...track("t1"), kind: "video" }], []))
				.success,
		).toBe(false);
	});
});

describe("StudioSourceReserveSchema", () => {
	test("a recorded take, and a source with a bad channel count", () => {
		const reserve = {
			ideaId: sourceId,
			kind: "take",
			trackLabel: " Guitar ",
			takeNumber: 3,
			filename: "take-3.wav",
			sizeBytes: 1024,
			codec: "pcm",
			sampleRate: 48000,
			channels: 1,
			durationSeconds: 12.5,
		};
		expect(v.parse(StudioSourceReserveSchema, reserve).trackLabel).toBe("Guitar");
		expect(v.safeParse(StudioSourceReserveSchema, { ...reserve, channels: 3 }).success).toBe(false);
	});
});

describe("StudioTrackFxSchema", () => {
	test("accepts every effect at its zero and refuses a ratio under 1:1 or a reverb past full", () => {
		const off = {
			compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
			tone: { tilt: 0, air: 0, bottom: 0 },
			reverb: { level: 0, size: 0.5 },
		};
		expect(v.parse(StudioTrackFxSchema, off)).toEqual(off);
		expect(
			v.safeParse(StudioTrackFxSchema, { ...off, compressor: { ...off.compressor, ratio: 0.5 } })
				.success,
		).toBe(false);
		expect(
			v.safeParse(StudioTrackFxSchema, { ...off, reverb: { level: 1.5, size: 0.5 } }).success,
		).toBe(false);
	});
});
