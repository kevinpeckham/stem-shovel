import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";

/**
 * The Studio engine's range edits (docs/dawn-daw-plan.md, D4): deleteRange
 * and insertRange change the arrangement in one undo step, the clips
 * through utils/rangeDelete.ts and utils/rangeInsert.ts, and with them
 * (on a ripple or an insert) the markers, tempo changes, automation
 * points and loop region after the edit. Stopped, so no AudioContext.
 */
/** The look-ahead's callback, caught so a test drives it by hand (the clock is the fake context's). */
const lookahead = vi.hoisted(() => ({ tick: null as ((until: number) => void) | null }));
vi.mock("./lookahead", () => ({
	startLookahead: (_ctx: unknown, queueUntil: (until: number) => void) => {
		lookahead.tick = queueUntil;
		return () => {
			lookahead.tick = null;
		};
	},
}));
const { studio, STUDIO_SCHEDULE_HORIZON_S } = await import("./studio.svelte");

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

/**
 * Any Web Audio object as a stand-in: every property another stand-in,
 * every call answering one, awaiting one resolves; numbers read as 0.
 */
function stub(): never {
	const props = new Map<PropertyKey, unknown>();
	return new Proxy(function () {}, {
		get(_t, k) {
			if (k === "then") return undefined;
			if (k === Symbol.toPrimitive) return () => 0;
			if (!props.has(k)) props.set(k, stub());
			return props.get(k);
		},
		set(_t, k, v) {
			props.set(k, v);
			return true;
		},
		apply: () => stub(),
		construct: () => stub() as object,
	}) as never;
}
/** Each buffer source started, as (when, offset, duration). */
const starts: [number, number, number][] = [];
const clock = { now: 0 };
/** A context of stand-ins, but for its clock and its buffer sources, which log their starts. */
function fakeContext() {
	const base: Record<PropertyKey, unknown> = {
		get currentTime() {
			return clock.now;
		},
		sampleRate: 48000,
		state: "running",
		audioWorklet: { addModule: async () => {} },
		resume: async () => {},
		createBufferSource: () => {
			const src = stub() as unknown as Record<string, unknown>;
			src.start = (at: number, offset: number, duration: number) =>
				starts.push([at, offset, duration]);
			return src;
		},
	};
	return new Proxy(base, {
		get: (t, k) => (k in t ? t[k] : ((t[k] = stub()), t[k])),
	});
}
const fakeBuffer = {
	duration: 40,
	length: 40_000,
	sampleRate: 1000,
	numberOfChannels: 1,
	getChannelData: () => new Float32Array(40_000),
} as unknown as AudioBuffer;

/**
 * Windowed scheduling (docs/multitrack-recorder.md "Scale and structure"):
 * a pass starts the clips within STUDIO_SCHEDULE_HORIZON_S of its start
 * and the look-ahead the rest as they come within reach; a render still
 * schedules every clip at once.
 */
describe("studio clip scheduling", () => {
	const sourceId = "src_windowed000000000a";
	const at = (id: string, start: number, duration = 1) => ({
		...clip(id, "t1", start, duration),
		sourceId,
	});
	const song = (loop: StudioArrangement["loop"] = null): StudioArrangement => ({
		...arrangement(),
		loop,
		tracks: [track("t1")],
		clips: [at("c0", 0), at("c2", 2), at("c10", 10, 2), at("c30", 30)],
		markers: [],
		tempoChanges: [],
	});
	beforeEach(() => {
		vi.stubGlobal("AudioContext", function () {
			return fakeContext();
		});
		vi.stubGlobal("OfflineAudioContext", function () {
			return fakeContext();
		});
		for (const node of ["AudioWorkletNode", "GainNode", "ConstantSourceNode", "OscillatorNode"])
			vi.stubGlobal(node, function () {
				return stub();
			});
		vi.stubGlobal("requestAnimationFrame", () => 0);
		vi.stubGlobal("cancelAnimationFrame", () => {});
		clock.now = 0;
		starts.length = 0;
		studio.adoptSource(sourceId, fakeBuffer, { blob: new Blob(), filename: "a.wav" }, "A");
	});
	afterEach(() => {
		studio.stop();
		vi.unstubAllGlobals();
	});

	it("starts the clips within the horizon at play, and the rest as they come within reach", async () => {
		expect(STUDIO_SCHEDULE_HORIZON_S).toBeGreaterThan(1);
		studio.arrangement = song();
		await studio.play({ from: 0, ahead: 0.1 });
		expect(starts.map(([when]) => when)).toEqual([0.1, 2.1]);
		expect(studio.diagnostics().clipsQueued).toBe(2);
		clock.now = 5;
		lookahead.tick!(5.1);
		expect(starts).toHaveLength(2);
		clock.now = 6.5;
		lookahead.tick!(6.6);
		expect(starts[2]).toEqual([10.1, 0, 2]);
		expect(studio.diagnostics().clipsQueued).toBe(1);
	});
	it("a clip whose moment passed starts now, offset to where the pass has reached", async () => {
		studio.arrangement = song();
		await studio.play({ from: 0, ahead: 0.1 });
		clock.now = 10.6;
		lookahead.tick!(10.7);
		expect(starts[2]?.[0]).toBeCloseTo(10.6);
		expect(starts[2]?.[1]).toBeCloseTo(0.5);
		expect(starts[2]?.[2]).toBeCloseTo(1.5);
	});
	it("stop drops what was queued: nothing starts late", async () => {
		studio.arrangement = song();
		await studio.play({ from: 0, ahead: 0.1 });
		const tick = lookahead.tick!;
		studio.stop();
		expect(studio.diagnostics().clipsQueued).toBe(0);
		clock.now = 40;
		tick(40.1);
		expect(starts).toHaveLength(2);
	});
	it("a seek drops the old pass's queue and queues its own", async () => {
		studio.arrangement = song();
		await studio.play({ from: 0, ahead: 0.1 });
		studio.seek(9);
		// The 10 s clip is now within reach; the 30 s one waits; nothing of the old pass is left.
		expect(starts.slice(2).map(([when]) => when)).toEqual([1.02]);
		expect(studio.diagnostics().clipsQueued).toBe(1);
	});
	it("the loop's next pass queues its clips the same way", async () => {
		studio.arrangement = song({ on: true, start: 0, end: 12 });
		await studio.play({ from: 0, ahead: 0.1 });
		expect(starts).toHaveLength(2);
		clock.now = 6.5;
		lookahead.tick!(6.6);
		clock.now = 12.05;
		lookahead.tick!(12.15);
		// The first pass's 10 s clip, then the second pass (from 12.1) with its first two clips.
		expect(starts.slice(2).map(([when]) => when)).toEqual([10.1, 12.1, 14.1]);
		expect(studio.diagnostics().clipsQueued).toBe(1);
		clock.now = 18.5;
		lookahead.tick!(18.6);
		expect(starts[5]?.[0]).toBeCloseTo(22.1);
	});
	it("a render schedules every clip at once", async () => {
		studio.arrangement = song();
		await studio.render();
		expect(starts.map(([when]) => when)).toEqual([0, 2, 10, 30]);
	});
});
