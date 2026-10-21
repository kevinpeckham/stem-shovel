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

describe("StudioAutomationSchema (D1)", () => {
	test("lanes in time order pass and stay on the track; out of order or past the cap fail", () => {
		const t = {
			...track("t1"),
			automation: {
				volume: [
					{ t: 0, v: 1 },
					{ t: 2, v: 0.5 },
				],
				pan: [{ t: 1, v: -1 }],
			},
		};
		const ok = v.safeParse(StudioArrangementSchema, arrangement([t], []));
		expect(ok.success).toBe(true);
		if (ok.success) expect(ok.output.tracks[0]!.automation?.volume).toHaveLength(2);
		const backwards = {
			...t,
			automation: {
				volume: [
					{ t: 2, v: 1 },
					{ t: 1, v: 1 },
				],
			},
		};
		expect(v.safeParse(StudioArrangementSchema, arrangement([backwards], [])).success).toBe(false);
		const tooMany = {
			...t,
			automation: { reverb: Array.from({ length: 1001 }, (_, i) => ({ t: i, v: 0.5 })) },
		};
		expect(v.safeParse(StudioArrangementSchema, arrangement([tooMany], [])).success).toBe(false);
		const loud = { ...t, automation: { volume: [{ t: 0, v: 3 }] } };
		expect(v.safeParse(StudioArrangementSchema, arrangement([loud], [])).success).toBe(false);
		// D2: a send's and an insert's lane by key; a key outside the shape fails.
		const keyed = {
			...t,
			automation: { "send:b1": [{ t: 0, v: 0.5 }], "insert:i1:level": [{ t: 1, v: 0.2 }] },
		};
		expect(v.safeParse(StudioArrangementSchema, arrangement([keyed], [])).success).toBe(true);
		const odd = { ...t, automation: { reverb: [{ t: 0, v: 0.5 }] } };
		expect(v.safeParse(StudioArrangementSchema, arrangement([odd], [])).success).toBe(false);
	});
});

describe("StudioArrangementSchema: inserts, buses and sends (D2)", () => {
	test("a bus, a track routed and sending to it, inserts on each and the master", () => {
		const bus = {
			id: "b1",
			name: "Drums",
			gain: 1,
			pan: 0,
			muted: false,
			inserts: [{ id: "i9", kind: "limiter", settings: { ceiling: -1, release: 0.1 } }],
		};
		const t = {
			...track("t1"),
			output: "b1",
			sends: [{ bus: "b1", level: 0.3, pre: true }],
			inserts: [
				{
					id: "i1",
					kind: "eq",
					settings: {
						lowGain: 2,
						lowFreq: 120,
						midGain: 0,
						midFreq: 1000,
						midQ: 1,
						highGain: -1,
						highFreq: 6000,
					},
				},
				{
					id: "i2",
					kind: "delay",
					bypass: true,
					settings: { time: 0.3, feedback: 0.4, level: 0.2, analog: true },
				},
			],
		};
		const a = {
			...arrangement([t], []),
			buses: [bus],
			masterInserts: [{ id: "m1", kind: "limiter", settings: { ceiling: -0.5, release: 0.2 } }],
		};
		const ok = v.safeParse(StudioArrangementSchema, a);
		expect(ok.success).toBe(true);
		if (ok.success) {
			expect(ok.output.buses?.[0]?.inserts?.[0]?.kind).toBe("limiter");
			expect(ok.output.tracks[0]!.inserts?.[1]?.bypass).toBe(true);
			expect(ok.output.masterInserts).toHaveLength(1);
		}
		const badKind = { ...t, inserts: [{ id: "i1", kind: "chorus", settings: {} }] };
		expect(v.safeParse(StudioArrangementSchema, arrangement([badKind], [])).success).toBe(false);
		const tooManyBuses = {
			...a,
			buses: Array.from({ length: 9 }, (_, i) => ({ ...bus, id: `b${i}` })),
		};
		expect(v.safeParse(StudioArrangementSchema, tooManyBuses).success).toBe(false);
	});
});

describe("StudioArrangementSchema (D4): fade shapes and markers", () => {
	const base = () => ({
		version: 1 as const,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master: 1,
		tracks: [track("t1")],
		clips: [],
	});
	test("a clip may name its fade shape; an unknown shape is refused", () => {
		const clip = {
			id: "c1",
			trackId: "t1",
			sourceId,
			start: 0,
			offset: 0,
			duration: 1,
			gain: 1,
			fadeIn: 0.1,
			fadeOut: 0.1,
			name: "x",
		};
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), clips: [{ ...clip, fadeShape: "power" }] })
				.success,
		).toBe(true);
		expect(v.safeParse(StudioArrangementSchema, { ...base(), clips: [clip] }).success).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), clips: [{ ...clip, fadeShape: "log" }] })
				.success,
		).toBe(false);
	});
	test("markers carry an id, a time and a short name, at most 64", () => {
		const marker = (i: number) => ({ id: `m${i}`, t: i, name: `Mark ${i}` });
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), markers: [marker(1), marker(2)] }).success,
		).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), markers: [{ id: "m", t: -1, name: "x" }] })
				.success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				markers: [{ id: "m", t: 1, name: "x".repeat(41) }],
			}).success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				markers: Array.from({ length: 65 }, (_, i) => marker(i)),
			}).success,
		).toBe(false);
	});
});

describe("StudioArrangementSchema (D5): the tempo map and a track's feel", () => {
	const base = () => ({
		version: 1 as const,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master: 1,
		tracks: [track("t1")],
		clips: [],
	});
	test("tempo and meter changes carry a time and a value within the song's own limits", () => {
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				tempoChanges: [{ start: 8, bpm: 132 }],
				meterChanges: [{ start: 16, beatsPerBar: 3 }],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), tempoChanges: [{ start: 8, bpm: 10 }] })
				.success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				meterChanges: [{ start: 8, beatsPerBar: 4.5 }],
			}).success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				meterChanges: [{ start: -1, beatsPerBar: 4 }],
			}).success,
		).toBe(false);
	});
	test("a track's swing and humanize are 0 to 1", () => {
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				tracks: [{ ...track("t1"), swing: 0.5, humanize: 0.2 }],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, { ...base(), tracks: [{ ...track("t1"), swing: 1.5 }] })
				.success,
		).toBe(false);
	});
});

describe("StudioArrangementSchema (D6): the sampler", () => {
	const base = () => ({
		version: 1 as const,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master: 1,
		clips: [],
	});
	test("a sampler is an input, and a track's sampler names a recording, a root note and an envelope", () => {
		const t = {
			...track("t1"),
			kind: "midi" as const,
			input: { source: "sampler" as const, channel: "stereo" as const },
		};
		expect(v.safeParse(StudioArrangementSchema, { ...base(), tracks: [t] }).success).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				tracks: [
					{ ...t, sampler: { sourceId, root: 60, attack: 0.01, release: 0.2, loop: false } },
				],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				tracks: [{ ...t, sampler: { sourceId, root: 128, attack: 0, release: 0, loop: false } }],
			}).success,
		).toBe(false);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base(),
				tracks: [
					{
						...t,
						sampler: { sourceId: "not valid!", root: 60, attack: 0, release: 0, loop: false },
					},
				],
			}).success,
		).toBe(false);
	});
});

describe("StudioArrangementSchema (D8): a frozen track", () => {
	test("a frozen track keeps its clips and inserts; the clips must be clips", () => {
		const base = {
			version: 1 as const,
			bpm: 120,
			beatsPerBar: 4,
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master: 1,
			clips: [],
		};
		const clip = {
			id: "c1",
			trackId: "t1",
			sourceId,
			start: 0,
			offset: 0,
			duration: 1,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "x",
		};
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base,
				tracks: [
					{
						...track("t1"),
						frozen: { clips: [clip], inserts: [{ id: "i1", kind: "eq", settings: {} }] },
					},
				],
			}).success,
		).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, {
				...base,
				tracks: [{ ...track("t1"), frozen: { clips: [{ ...clip, duration: 0 }] } }],
			}).success,
		).toBe(false);
	});
});

describe("the song's sample rate", () => {
	test("one of the rates a song renders at passes; another fails; none is fine", () => {
		const ok = v.parse(StudioArrangementSchema, { ...arrangement([], []), sampleRate: 44100 });
		expect(ok.sampleRate).toBe(44100);
		expect(v.safeParse(StudioArrangementSchema, arrangement([], [])).success).toBe(true);
		expect(
			v.safeParse(StudioArrangementSchema, { ...arrangement([], []), sampleRate: 50000 }).success,
		).toBe(false);
	});
});
