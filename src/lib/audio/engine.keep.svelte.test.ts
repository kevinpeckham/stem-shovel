import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import type { StemSource } from "./types";

/**
 * "Keep on this device" in the engine (engine.svelte.ts with
 * audio/mediaCache.ts): the cache is a stand-in (OPFS needs a browser), the
 * context the same inert fake the StemPlayer tests use, and fetch answers
 * every rendition with a few bytes. A buffered load of a kept song reads
 * the cache first and keeps what it fetched; a streamed load hands the
 * worker each stem's key; `keepOnDevice` fetches only what is missing and
 * drops the rest.
 */
const cache = vi.hoisted(() => ({
	available: true,
	read: vi.fn<(key: string) => Promise<ArrayBuffer | null>>(async () => null),
	stat: vi.fn(async () => null),
	write: vi.fn<(key: string, bytes: ArrayBuffer, song: string) => Promise<boolean>>(
		async () => true,
	),
	songs: vi.fn<(timeoutMs?: number) => Promise<{ song: string; bytes: number; keys: string[] }[]>>(
		async () => [],
	),
	prune: vi.fn(async () => {}),
	forgetSong: vi.fn(async () => {}),
}));
vi.mock("#lib/audio/mediaCache.js", () => ({ mediaCache: cache }));

const { StemEngine } = await import("./engine.svelte");

function fakeNode() {
	return {
		connect() {},
		disconnect() {},
		gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} },
		pan: { value: 0, cancelScheduledValues() {}, setTargetAtTime() {} },
	};
}
class FakeAudioContext {
	state = "running";
	currentTime = 0;
	sampleRate: number;
	destination = {};
	audioWorklet = { addModule: async () => {} };
	constructor(o: { sampleRate?: number } = {}) {
		this.sampleRate = o.sampleRate ?? 32000;
	}
	createGain = fakeNode;
	createStereoPanner = fakeNode;
	createChannelMerger = fakeNode;
	createAnalyser = () => ({ ...fakeNode(), fftSize: 2048, getFloatTimeDomainData() {} });
	createBuffer(n: number, length: number, sampleRate: number) {
		return fakeAudioBuffer(
			Array.from({ length: n }, () => new Float32Array(length)),
			sampleRate,
		);
	}
	decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => {
		void bytes;
		return fakeAudioBuffer([new Float32Array(3200)]);
	});
	resume = async () => {};
	close = async () => {};
}
const fetchSpy = vi.fn(async (url: string) => ({
	ok: !url.includes("broken"),
	status: url.includes("broken") ? 500 : 200,
	statusText: url.includes("broken") ? "Server Error" : "OK",
	arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
}));

const src = (id: string): StemSource => ({
	id,
	label: id,
	url: `https://blob/accounts/a/songs/s/${id}-play-7.m4a?sig=x`,
	duration: 10,
});

beforeAll(() => {
	vi.stubGlobal("AudioContext", FakeAudioContext);
	vi.stubGlobal("fetch", fetchSpy);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
	fetchSpy.mockClear();
	for (const fn of Object.values(cache)) if (typeof fn === "function") fn.mockClear();
	cache.read.mockImplementation(async () => null);
	cache.write.mockImplementation(async () => true);
	cache.songs.mockImplementation(async () => []);
});

describe("buffered load and the kept copy", () => {
	it("a song not kept never asks the cache and fetches every stem", async () => {
		const engine = new StemEngine();
		await engine.load([src("a"), src("b")], { choice: "buffered" });
		expect(engine.status).toBe("ready");
		expect(cache.read).not.toHaveBeenCalled();
		expect(cache.write).not.toHaveBeenCalled();
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
	it("a kept song reads each stem from disk first; a hit is not fetched", async () => {
		const engine = new StemEngine();
		engine.keepSong = "song1";
		const disk = new Uint8Array([9, 9]).buffer;
		cache.read.mockImplementation(async (key) => (key === "a-play-7" ? disk : null));
		await engine.load([src("a"), src("b")], { choice: "buffered" });
		expect(engine.status).toBe("ready");
		expect(cache.read.mock.calls.map((c) => c[0]).sort()).toEqual(["a-play-7", "b-play-7"]);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]![0]).toContain("b-play-7");
	});
	it("a miss of a kept song is fetched and written under the song, a copy so the decode keeps its bytes", async () => {
		const engine = new StemEngine();
		engine.keepSong = "song1";
		await engine.load([src("b")], { choice: "buffered" });
		expect(cache.write).toHaveBeenCalledTimes(1);
		const [key, bytes, song] = cache.write.mock.calls[0]!;
		expect(key).toBe("b-play-7");
		expect(song).toBe("song1");
		expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3, 4]);
	});
});

describe("keptOnDevice", () => {
	it("is null when the cache holds nothing of the song", async () => {
		const engine = new StemEngine();
		cache.songs.mockImplementation(async () => [{ song: "other", bytes: 5, keys: ["x"] }]);
		expect(await engine.keptOnDevice("song1")).toBeNull();
	});
	it("is complete when every loaded stem's rendition is held, and counts the missing ones", async () => {
		const engine = new StemEngine();
		await engine.load([src("a"), src("b")], { choice: "buffered" });
		cache.songs.mockImplementation(async () => [
			{ song: "song1", bytes: 42, keys: ["a-play-7", "b-play-7"] },
		]);
		expect(await engine.keptOnDevice("song1")).toEqual({ bytes: 42, complete: true, missing: 0 });
		cache.songs.mockImplementation(async () => [
			{ song: "song1", bytes: 21, keys: ["a-play-7", "old-play-1"] },
		]);
		expect(await engine.keptOnDevice("song1", { timeoutMs: 1000 })).toEqual({
			bytes: 21,
			complete: false,
			missing: 1,
		});
		expect(cache.songs).toHaveBeenLastCalledWith(1000);
	});
});

describe("keepOnDevice and forgetDevice", () => {
	it("fetches only the missing renditions, writes them under the song, prunes the rest and reports the size", async () => {
		const engine = new StemEngine();
		await engine.load([src("a"), src("b"), src("c")], { choice: "buffered" });
		fetchSpy.mockClear();
		const held = new Set(["a-play-7", "old-play-1"]);
		cache.songs.mockImplementation(async () => [{ song: "song1", bytes: 30, keys: [...held] }]);
		cache.write.mockImplementation(async (key) => {
			held.add(key);
			return true;
		});
		cache.prune.mockImplementation(async () => {
			held.delete("old-play-1");
		});
		const seen: ({ done: number; total: number } | null)[] = [];
		cache.write.mockImplementationOnce(async (key) => {
			seen.push(engine.keeping);
			held.add(key);
			return true;
		});
		expect(await engine.keepOnDevice("song1")).toEqual({ bytes: 30 });
		expect(engine.keepSong).toBe("song1");
		expect(fetchSpy.mock.calls.map((c) => c[0]).sort()).toEqual([src("b").url, src("c").url]);
		expect(
			cache.write.mock.calls.map((c) => [c[0], c[2]]).sort((x, y) => x[0].localeCompare(y[0])),
		).toEqual([
			["b-play-7", "song1"],
			["c-play-7", "song1"],
		]);
		expect(seen[0]).toEqual({ done: 0, total: 2 });
		expect(cache.prune).toHaveBeenCalledWith("song1", ["a-play-7", "b-play-7", "c-play-7"]);
		expect(engine.keeping).toBeNull();
	});
	it("a failed fetch throws and clears the progress", async () => {
		const engine = new StemEngine();
		await engine
			.load([{ ...src("a"), url: "https://blob/s/broken-play-1.m4a" }], {
				choice: "buffered",
			})
			.catch(() => {});
		await expect(engine.keepOnDevice("song1")).rejects.toThrow(/500/);
		expect(engine.keeping).toBeNull();
		expect(cache.prune).not.toHaveBeenCalled();
	});
	it("throws when the cache would not keep every stem", async () => {
		const engine = new StemEngine();
		await engine.load([src("a")], { choice: "buffered" });
		cache.write.mockImplementation(async () => false);
		await expect(engine.keepOnDevice("song1")).rejects.toThrow(/would not keep every stem/);
	});
	it("forgetDevice drops the song's files and stops keeping it", async () => {
		const engine = new StemEngine();
		engine.keepSong = "song1";
		await engine.forgetDevice("song1");
		expect(cache.forgetSong).toHaveBeenCalledWith("song1");
		expect(engine.keepSong).toBeNull();
	});
});

describe("streamed load", () => {
	let posted: { type: string; stems?: unknown }[] = [];
	class FakeWorker {
		onmessage: ((e: MessageEvent) => void) | null = null;
		onerror: ((e: unknown) => void) | null = null;
		postMessage(m: { type: string; stems?: { id: string }[] }) {
			posted.push(m);
			if (m.type !== "load") return;
			queueMicrotask(() => {
				for (const s of m.stems ?? [])
					this.onmessage?.({
						data: { type: "stem", id: s.id, duration: 10, channels: 2, sampleRate: 48000 },
					} as MessageEvent);
				this.onmessage?.({ data: { type: "ready" } } as MessageEvent);
			});
		}
		terminate() {}
	}
	class FakeWorkletNode {
		port = { postMessage() {}, onmessage: null };
		connect() {}
		disconnect() {}
	}
	class FakeChannel {
		port1 = {};
		port2 = {};
	}
	beforeEach(() => {
		posted = [];
		vi.stubGlobal("Worker", FakeWorker);
		vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
		vi.stubGlobal("AudioDecoder", class {});
		vi.stubGlobal("MessageChannel", FakeChannel);
	});

	it("hands the worker each stem's key, and marks a kept song's files used", async () => {
		const engine = new StemEngine();
		engine.keepSong = "song1";
		await engine.load([src("a"), { ...src("b"), url: "https://blob/s/bad name.m4a" }], {
			choice: "streamed",
		});
		expect(engine.mode).toBe("streamed");
		expect(engine.status).toBe("ready");
		const load = posted.find((m) => m.type === "load");
		expect(load?.stems).toEqual([
			{ id: "a", url: src("a").url, key: "a-play-7" },
			{ id: "b", url: "https://blob/s/bad name.m4a", key: null },
		]);
		expect(cache.stat).toHaveBeenCalledWith("a-play-7");
		expect(cache.read).not.toHaveBeenCalled();
		expect(cache.write).not.toHaveBeenCalled();
	});
});
