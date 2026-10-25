import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { encodePcmFile } from "#lib/utils/pcmFile.js";
import type { PcmCacheReply, PcmCacheRequest } from "#lib/workers/pcmCache.worker.js";
import { PcmCache } from "./pcmCache";

/**
 * The disk cache's page side (audio/pcmCache.ts): requests to the worker
 * by id, the samples transferred both ways, and every failure (no OPFS,
 * an error from the worker, a worker that dies or never answers) a miss.
 * The worker is a stand-in that answers as `answer` says.
 */
let posted: { req: PcmCacheRequest; transfer: Transferable[] }[] = [];
let answer: (req: PcmCacheRequest) => Omit<PcmCacheReply, "id"> | "silent" | "crash";
let workers: FakeWorker[] = [];
class FakeWorker {
	onmessage: ((e: MessageEvent<PcmCacheReply>) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	terminated = false;
	constructor() {
		workers.push(this);
	}
	postMessage(req: PcmCacheRequest, transfer: Transferable[] = []) {
		posted.push({ req, transfer });
		const a = answer(req);
		if (a === "silent") return;
		queueMicrotask(() => {
			if (a === "crash") this.onerror?.(new Error("boom"));
			else this.onmessage?.({ data: { ...a, id: req.id } } as MessageEvent<PcmCacheReply>);
		});
	}
	terminate() {
		this.terminated = true;
	}
}
const buffer = (channels: Float32Array[], sampleRate: number) =>
	({
		numberOfChannels: channels.length,
		sampleRate,
		getChannelData: (i: number) => channels[i]!,
	}) as unknown as AudioBuffer;

describe("pcmCache without OPFS", () => {
	it("is unavailable here (Node: no Worker, no storage) and answers every call without a worker", async () => {
		const cache = new PcmCache();
		expect(cache.available).toBe(false);
		expect(await cache.read("abc")).toBeNull();
		await cache.write("abc", buffer([new Float32Array(4)], 48000));
		expect(await cache.estimate()).toEqual({ bytes: 0, entries: 0, quota: 0 });
	});
});

describe("pcmCache with a worker", () => {
	beforeEach(() => {
		posted = [];
		workers = [];
		answer = () => ({});
		vi.stubGlobal("Worker", FakeWorker);
		vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({}) } });
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("reads a copy back as channels at its own rate", async () => {
		const left = Float32Array.from([0.1, -0.2, 0.3]);
		answer = () => ({ bytes: encodePcmFile([left, left], 44100).buffer as ArrayBuffer });
		const cache = new PcmCache();
		expect(cache.available).toBe(true);
		const got = await cache.read("src_a");
		expect(posted[0]!.req).toMatchObject({ op: "read", key: "src_a" });
		expect(got?.sampleRate).toBe(44100);
		expect(Array.from(got!.channels[1]!)).toEqual(Array.from(left));
	});
	it("a miss, a bad file or an error from the worker reads as null", async () => {
		const cache = new PcmCache();
		answer = () => ({ bytes: null });
		expect(await cache.read("a")).toBeNull();
		answer = () => ({ bytes: new ArrayBuffer(8) });
		expect(await cache.read("b")).toBeNull();
		answer = () => ({ error: "NotAllowedError" });
		expect(await cache.read("c")).toBeNull();
		expect(console.warn).toHaveBeenCalledTimes(1);
	});
	it("writes a copy of the samples, transferred, leaving the buffer's own data whole", async () => {
		const data = Float32Array.from([0.5, 0.25]);
		const cache = new PcmCache();
		await cache.write("src_w", buffer([data], 48000));
		const { req, transfer } = posted[0]!;
		expect(req.op).toBe("write");
		const bytes = (req as { bytes: ArrayBuffer }).bytes;
		expect(transfer).toEqual([bytes]);
		expect(bytes.byteLength).toBe(20 + 2 * 4);
		expect(data.byteLength).toBe(8);
	});
	it("one worker for every request, each answered by its own id", async () => {
		const cache = new PcmCache();
		answer = (req) =>
			req.op === "estimate" ? { estimate: { bytes: 10, entries: 1, quota: 100 } } : {};
		await Promise.all([cache.forget("x"), cache.estimate(), cache.clear()]);
		expect(workers).toHaveLength(1);
		expect(posted.map((p) => p.req.op)).toEqual(["forget", "estimate", "clear"]);
		expect(new Set(posted.map((p) => p.req.id)).size).toBe(3);
		expect(await cache.estimate()).toEqual({ bytes: 10, entries: 1, quota: 100 });
	});
	it("a worker that dies answers a miss and turns the cache off", async () => {
		const cache = new PcmCache();
		answer = () => "crash";
		expect(await cache.read("a")).toBeNull();
		expect(workers[0]!.terminated).toBe(true);
		expect(cache.available).toBe(false);
		expect(await cache.read("b")).toBeNull();
		expect(posted).toHaveLength(1);
	});
	it("stat answers the header and size, and null for a miss or an error", async () => {
		const cache = new PcmCache();
		const stat = { sampleRate: 48000, channels: 2, frames: 96000, bytes: 20 + 2 * 96000 * 4 };
		answer = () => ({ stat });
		expect(await cache.stat("src_s")).toEqual(stat);
		expect(posted[0]!.req).toMatchObject({ op: "stat", key: "src_s" });
		answer = () => ({ stat: null });
		expect(await cache.stat("gone")).toBeNull();
		answer = () => ({ error: "NotFoundError" });
		expect(await cache.stat("x")).toBeNull();
	});
	it("readRange asks for the window and returns views on the one buffer it was handed", async () => {
		const data = new Float32Array([1, 2, 3, -1, -2, -3]).buffer;
		let reply: Omit<PcmCacheReply, "id"> = {
			range: { fromFrame: 10, frames: 3, channels: 2, sampleRate: 44100, data },
		};
		answer = () => reply;
		const cache = new PcmCache();
		const got = await cache.readRange("src_r", 10, 5);
		expect(posted[0]!.req).toMatchObject({
			op: "readRange",
			key: "src_r",
			fromFrame: 10,
			frames: 5,
		});
		expect(got?.fromFrame).toBe(10);
		expect(got?.sampleRate).toBe(44100);
		expect(got!.channels.map((c) => Array.from(c))).toEqual([
			[1, 2, 3],
			[-1, -2, -3],
		]);
		expect(got!.channels.every((c) => c.buffer === data)).toBe(true);
		reply = { range: null };
		expect(await cache.readRange("src_r", 1e9, 5)).toBeNull();
		reply = { range: { fromFrame: 0, frames: 4, channels: 2, sampleRate: 44100, data } };
		expect(await cache.readRange("src_r", 0, 4)).toBeNull();
		reply = { error: "short read" };
		expect(await cache.readRange("src_r", 0, 4)).toBeNull();
	});
	it("stat and readRange are misses after the short read timeout", async () => {
		vi.useFakeTimers();
		const cache = new PcmCache();
		answer = () => "silent";
		const stat = cache.stat("a");
		const range = cache.readRange("a", 0, 100);
		await vi.advanceTimersByTimeAsync(5000);
		expect(await stat).toBeNull();
		expect(await range).toBeNull();
	});
	it("a worker that dies during a range read turns the cache off", async () => {
		const cache = new PcmCache();
		answer = () => "crash";
		expect(await cache.readRange("a", 0, 10)).toBeNull();
		expect(cache.available).toBe(false);
		expect(await cache.stat("a")).toBeNull();
		expect(posted).toHaveLength(1);
	});
	it("a worker that never answers reads as a miss after the timeout", async () => {
		vi.useFakeTimers();
		const cache = new PcmCache();
		answer = () => "silent";
		const read = cache.read("a");
		await vi.advanceTimersByTimeAsync(5000);
		expect(await read).toBeNull();
	});
});
