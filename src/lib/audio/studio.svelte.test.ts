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
/** The disk cache (audio/pcmCache.ts), a stand-in whose reads a test sets. */
const disk = vi.hoisted(() => ({
	read: vi.fn(
		async (_key: string): Promise<{ sampleRate: number; channels: Float32Array[] } | null> => null,
	),
	write: vi.fn(async (_key: string, _buffer: AudioBuffer) => {}),
	forget: vi.fn(async (_key: string) => {}),
	/** Off but in the streaming tests, so the rest load and play from buffers as before. */
	available: false,
	stat: vi.fn(
		async (
			_key: string,
		): Promise<{ sampleRate: number; channels: number; frames: number; bytes: number } | null> =>
			null,
	),
	readRange: vi.fn(
		async (
			_key: string,
			fromFrame: number,
			frames: number,
		): Promise<{ fromFrame: number; sampleRate: number; channels: Float32Array[] } | null> => ({
			fromFrame,
			sampleRate: 48000,
			channels: [new Float32Array(frames)],
		}),
	),
}));
vi.mock("./pcmCache", () => ({ pcmCache: disk }));
/** The streaming voice (audio/streamVoice.ts), a stand-in that logs what the engine asks of it. */
interface FakeVoice {
	opts: { key: string; frames: number; read: (f: number, n: number) => Promise<unknown> };
	connected: unknown[];
	started: [number, number, number] | null;
	stopped: boolean;
	starved: number;
}
const voices = vi.hoisted(() => ({ made: [] as FakeVoice[], install: true }));
vi.mock("./streamVoice", () => ({
	StreamVoice: class {
		static supported = () => true;
		static install = async () => voices.install;
		onended: (() => void) | null = null;
		starved = 0;
		connected: unknown[] = [];
		started: [number, number, number] | null = null;
		stopped = false;
		constructor(
			_ctx: unknown,
			public opts: FakeVoice["opts"],
		) {
			voices.made.push(this);
		}
		connect<T>(node: T): T {
			this.connected.push(node);
			return node;
		}
		disconnect() {}
		start(at: number, offset: number, duration: number) {
			this.started = [at, offset, duration];
		}
		stop() {
			this.stopped = true;
		}
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

/** An AudioBuffer as the engine builds one from the disk copy. */
class FakeAudioBuffer {
	numberOfChannels: number;
	length: number;
	sampleRate: number;
	#data: Float32Array[];
	constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
		this.numberOfChannels = o.numberOfChannels;
		this.length = o.length;
		this.sampleRate = o.sampleRate;
		this.#data = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
	}
	get duration() {
		return this.length / this.sampleRate;
	}
	getChannelData(i: number) {
		return this.#data[i]!;
	}
	copyToChannel(src: Float32Array, i: number) {
		this.#data[i]!.set(src);
	}
}

/**
 * The disk cache (docs/multitrack-recorder.md "Scale and structure"): a
 * source the disk holds loads without a fetch, one fetched is copied to
 * disk, a source made here is written at once, and a source the song
 * drops is forgotten.
 */
describe("studio disk cache", () => {
	const id = "src_cached0000000000000";
	const view = {
		id,
		kind: "take",
		takeNumber: 1,
		trackLabel: "Keys",
		url: "https://blob.example/keys.wav",
		filename: "keys.wav",
		codec: null,
		sampleRate: 44100,
		channels: 1,
		durationSeconds: 1,
		sizeBytes: 1,
		peaks: [],
		createdAt: new Date(0),
	} as const;
	const song = () => ({
		current: { ...arrangement(), clips: [{ ...clip("k", "t1", 0, 1), sourceId: id }] },
		sources: [{ ...view }],
	});
	const fetchSpy = vi.fn(async () => new Response(new ArrayBuffer(8)));
	beforeEach(() => {
		disk.read.mockReset().mockResolvedValue(null);
		disk.write.mockClear();
		disk.forget.mockClear();
		fetchSpy.mockClear();
		vi.stubGlobal("fetch", fetchSpy);
		vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
		vi.stubGlobal("OfflineAudioContext", function () {
			return {
				decodeAudioData: async () =>
					new FakeAudioBuffer({ numberOfChannels: 1, length: 48000, sampleRate: 48000 }),
			};
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads a source the disk holds from the disk, at its own rate, with no fetch and no rewrite", async () => {
		disk.read.mockResolvedValue({
			sampleRate: 44100,
			channels: [new Float32Array(44100).fill(0.5)],
		});
		await studio.load(song() as never);
		expect(disk.read).toHaveBeenCalledWith(id);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(studio.sources[id]?.status).toBe("ready");
		const buffer = studio.bufferOf(id)!;
		expect(buffer.sampleRate).toBe(44100);
		expect(buffer.getChannelData(0)[100]).toBe(0.5);
		expect(disk.write).not.toHaveBeenCalled();
	});
	it("a miss fetches and decodes, then copies the source to disk", async () => {
		await studio.load(song() as never);
		expect(fetchSpy).toHaveBeenCalledWith(view.url);
		expect(studio.sources[id]?.status).toBe("ready");
		expect(disk.write).toHaveBeenCalledWith(id, studio.bufferOf(id));
	});
	it("a cold source fetched on demand is read from disk first", async () => {
		await studio.load({ ...song(), current: { ...arrangement(), clips: [] } } as never);
		expect(studio.sources[id]?.status).toBe("cold");
		disk.read.mockResolvedValue({ sampleRate: 48000, channels: [new Float32Array(10)] });
		expect(await studio.ensureSource(id)).not.toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
	it("an import is written to disk at once, and forgotten with the source", () => {
		const buffer = new FakeAudioBuffer({ numberOfChannels: 2, length: 480, sampleRate: 48000 });
		const take = studio.importBuffer(
			studio.arrangement.tracks[0]!,
			buffer as unknown as AudioBuffer,
			{ blob: new Blob(), filename: "drums.wav" },
			0,
		)!;
		expect(disk.write).toHaveBeenCalledWith(take.sourceId, buffer);
		studio.forgetSource(take.sourceId);
		expect(disk.forget).toHaveBeenCalledWith(take.sourceId);
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

/**
 * Playing from disk (docs/dawn-daw-plan.md D8): a source the disk holds is
 * ready without a decode and plays through a StreamVoice; what reads the
 * samples (a warp, a sampler, a render) still decodes, and so does a
 * source without saved peaks or a context without the worklet.
 */
describe("studio streaming from disk", () => {
	const id = "src_streamed00000000000";
	const other = "src_warped0000000000000";
	const view = (sourceId: string, peaks: number[] = [0.1, 0.2]) => ({
		id: sourceId,
		kind: "take",
		takeNumber: 1,
		trackLabel: "Keys",
		url: `https://blob.example/${sourceId}.wav`,
		filename: "keys.wav",
		codec: null,
		sampleRate: 44100,
		channels: 1,
		durationSeconds: 10,
		sizeBytes: 1,
		peaks,
		createdAt: new Date(0),
	});
	const on = (sourceId: string, extra: Partial<StudioClip> = {}): StudioClip => ({
		...clip(`c_${sourceId}`, "t1", 0, 2),
		sourceId,
		offset: 1,
		...extra,
	});
	const song = (clips: StudioClip[], sources = [view(id)], tracks: unknown[] = [track("t1")]) => ({
		current: { ...arrangement(), loop: null, markers: [], tempoChanges: [], tracks, clips },
		sources,
	});
	const fetchSpy = vi.fn(async () => new Response(new ArrayBuffer(8)));
	const flush = () => new Promise((r) => setTimeout(r, 0));
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
		vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
		vi.stubGlobal("requestAnimationFrame", () => 0);
		vi.stubGlobal("cancelAnimationFrame", () => {});
		vi.stubGlobal("fetch", fetchSpy);
		clock.now = 0;
		starts.length = 0;
		voices.made.length = 0;
		voices.install = true;
		fetchSpy.mockClear();
		disk.available = true;
		disk.stat.mockReset().mockResolvedValue({
			sampleRate: 48000,
			channels: 1,
			frames: 480_000,
			bytes: 1_920_016,
		});
		disk.readRange.mockClear();
		disk.read.mockReset().mockResolvedValue({
			sampleRate: 48000,
			channels: [new Float32Array(480_000)],
		});
		disk.write.mockClear();
	});
	afterEach(() => {
		studio.stop();
		disk.available = false;
		vi.unstubAllGlobals();
	});

	it("loads a source the disk holds with no decode: ready, on disk, nothing in memory", async () => {
		await studio.load(song([on(id)]) as never);
		expect(disk.stat).toHaveBeenCalledWith(id);
		expect(disk.read).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(studio.sources[id]).toMatchObject({
			status: "ready",
			durationSeconds: 10,
			onDisk: { sampleRate: 48000, channels: 1, frames: 480_000 },
		});
		expect(studio.bufferOf(id)).toBeNull();
		expect(studio.memoryBytes).toBe(0);
		expect(studio.diskBytes).toBe(1_920_000);
	});
	it("plays the clip through a StreamVoice reading the disk copy, started like a buffer source", async () => {
		await studio.load(song([on(id)]) as never);
		await studio.play({ from: 0, ahead: 0.1 });
		expect(starts).toHaveLength(0);
		expect(voices.made).toHaveLength(1);
		const voice = voices.made[0]!;
		expect(voice.opts).toMatchObject({ key: id, frames: 480_000 });
		expect(voice.started).toEqual([0.1, 1, 2]);
		expect(voice.connected).toHaveLength(1);
		expect(studio.diagnostics()).toMatchObject({ streaming: 1, starved: 0, playing: 1 });
		await voice.opts.read(4800, 12000);
		expect(disk.readRange).toHaveBeenCalledWith(id, 4800, 12000);
		expect(studio.sources[id]?.onDisk).toBeDefined();
		studio.stop();
		expect(voice.stopped).toBe(true);
		expect(studio.diagnostics().streaming).toBe(0);
	});
	it("a warped clip's source still decodes, and plays from its rendering", async () => {
		await studio.load(
			song([
				on(id, {
					warp: [
						{ at: 0, source: 0 },
						{ at: 4, source: 2 },
					],
				}),
			]) as never,
		);
		expect(disk.read).toHaveBeenCalledWith(id);
		expect(studio.bufferOf(id)).not.toBeNull();
	});
	it("a sampler's source still decodes", async () => {
		const sampler = { sourceId: id, root: 60, attack: 0, release: 0.2, loop: false };
		await studio.load(song([], [view(id)], [{ ...track("t1"), sampler }]) as never);
		expect(studio.bufferOf(id)).not.toBeNull();
		await studio.play({ from: 0, ahead: 0.1 });
		expect(studio.bufferOf(id)).not.toBeNull();
	});
	it("a source without saved peaks decodes for the lane", async () => {
		await studio.load(song([on(id)], [view(id, [])]) as never);
		expect(disk.read).toHaveBeenCalledWith(id);
		expect(studio.bufferOf(id)).not.toBeNull();
		expect(studio.sources[id]?.peaks.length).toBeGreaterThan(0);
	});
	it("releaseUnused lets go of a playing source's buffer when it can stream, and keeps a warped one's", async () => {
		const warp = [
			{ at: 0, source: 0 },
			{ at: 4, source: 2 },
		];
		await studio.load(
			song([on(id), { ...on(other, { warp }), id: "w" }], [view(id), view(other)]) as never,
		);
		expect(await studio.ensureSource(id)).not.toBeNull();
		expect(studio.bufferOf(other)).not.toBeNull();
		expect(studio.releaseUnused()).toBe(1);
		expect(studio.bufferOf(id)).toBeNull();
		expect(studio.bufferOf(other)).not.toBeNull();
		expect(studio.sources[id]?.status).toBe("ready");
	});
	it("a render decodes what streams, and plays it from the buffer", async () => {
		await studio.load(song([on(id)]) as never);
		await studio.render();
		expect(disk.read).toHaveBeenCalledWith(id);
		expect(studio.bufferOf(id)).not.toBeNull();
		expect(starts).toEqual([[0, 1, 2]]);
	});
	it("a copy whose first window does not come was evicted: decoded, and the pass restarts from the buffer", async () => {
		await studio.load(song([on(id)]) as never);
		await studio.play({ from: 0, ahead: 0.1 });
		const voice = voices.made[0]!;
		disk.readRange.mockResolvedValueOnce(null);
		expect(await voice.opts.read(48000, 12000)).toBeNull();
		expect(studio.sources[id]?.onDisk).toBeUndefined();
		await flush();
		expect(disk.read).toHaveBeenCalledWith(id);
		expect(voice.stopped).toBe(true);
		expect(starts).toHaveLength(1);
		expect(voices.made).toHaveLength(1);
	});
	it("a context that will not take the worklet decodes sources on disk to play them", async () => {
		vi.resetModules();
		voices.install = false;
		const fresh = (await import("./studio.svelte")).studio;
		await fresh.load(song([on(id)]) as never);
		expect(fresh.bufferOf(id)).toBeNull();
		await fresh.play({ from: 0, ahead: 0.1 });
		expect(fresh.bufferOf(id)).not.toBeNull();
		expect(voices.made).toHaveLength(0);
		expect(starts).toEqual([[0.1, 1, 2]]);
		fresh.stop();
	});
});
