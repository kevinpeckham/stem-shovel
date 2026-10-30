import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MediaCacheReply, MediaCacheRequest } from "#lib/workers/mediaCache.worker.js";
import { MediaCache } from "./mediaCache";

/**
 * The kept songs' page side (audio/mediaCache.ts): requests to the worker
 * by id, the bytes transferred both ways, and every failure (no OPFS, an
 * error from the worker, a worker that dies or never answers) a miss. The
 * worker is a stand-in that answers as `answer` says; the OPFS work itself
 * (workers/mediaCache.worker.ts) needs a browser.
 */
let posted: { req: MediaCacheRequest; transfer: Transferable[] }[] = [];
let answer: (req: MediaCacheRequest) => Omit<MediaCacheReply, "id"> | "silent" | "crash";
let workers: FakeWorker[] = [];
class FakeWorker {
	onmessage: ((e: MessageEvent<MediaCacheReply>) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	terminated = false;
	constructor() {
		workers.push(this);
	}
	postMessage(req: MediaCacheRequest, transfer: Transferable[] = []) {
		posted.push({ req, transfer });
		const a = answer(req);
		if (a === "silent") return;
		queueMicrotask(() => {
			if (a === "crash") this.onerror?.(new Error("boom"));
			else this.onmessage?.({ data: { ...a, id: req.id } } as MessageEvent<MediaCacheReply>);
		});
	}
	terminate() {
		this.terminated = true;
	}
}

describe("mediaCache without OPFS", () => {
	it("is unavailable here (Node: no Worker, no storage) and answers every call without a worker", async () => {
		const cache = new MediaCache();
		expect(cache.available).toBe(false);
		expect(await cache.read("abc")).toBeNull();
		expect(await cache.stat("abc")).toBeNull();
		expect(await cache.write("abc", new ArrayBuffer(4), "song1")).toBe(false);
		expect(await cache.songs()).toEqual([]);
		expect(await cache.estimate()).toEqual({ bytes: 0, files: 0, quota: 0 });
	});
	it("keys a rendition URL by its file name", () => {
		expect(new MediaCache().keyOf("https://blob/a/s/st-play-1.m4a?sig=x")).toBe("st-play-1");
	});
});

describe("mediaCache with a worker", () => {
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

	it("reads a file's bytes back as they were handed over", async () => {
		const bytes = new Uint8Array([1, 2, 3]).buffer;
		answer = () => ({ bytes });
		const cache = new MediaCache();
		expect(cache.available).toBe(true);
		expect(await cache.read("st-play-1")).toBe(bytes);
		expect(posted[0]!.req).toMatchObject({ op: "read", key: "st-play-1" });
	});
	it("a miss or an error from the worker reads as null, warning once", async () => {
		const cache = new MediaCache();
		answer = () => ({ bytes: null });
		expect(await cache.read("a")).toBeNull();
		answer = () => ({ error: "NotAllowedError" });
		expect(await cache.read("b")).toBeNull();
		expect(await cache.stat("b")).toBeNull();
		expect(console.warn).toHaveBeenCalledTimes(1);
	});
	it("writes the bytes under the song, transferred, and says whether the file was kept", async () => {
		const cache = new MediaCache();
		answer = () => ({ kept: true });
		const bytes = new ArrayBuffer(16);
		expect(await cache.write("st-play-1", bytes, "song1")).toBe(true);
		const { req, transfer } = posted[0]!;
		expect(req).toMatchObject({ op: "write", key: "st-play-1", song: "song1" });
		expect(transfer).toEqual([bytes]);
		answer = () => ({ kept: false });
		expect(await cache.write("st-play-2", new ArrayBuffer(4), "song1")).toBe(false);
		answer = () => ({ error: "QuotaExceededError" });
		expect(await cache.write("st-play-3", new ArrayBuffer(4), "song1")).toBe(false);
	});
	it("one worker for every request, each answered by its own id", async () => {
		const cache = new MediaCache();
		const songs = [{ song: "s1", bytes: 30, keys: ["a", "b"] }];
		answer = (req) =>
			req.op === "songs"
				? { songs }
				: req.op === "estimate"
					? { estimate: { bytes: 30, files: 2, quota: 100 } }
					: {};
		await Promise.all([
			cache.forget("x"),
			cache.forgetSong("s1"),
			cache.prune("s1", ["a"]),
			cache.clear(),
		]);
		expect(workers).toHaveLength(1);
		expect(posted.map((p) => p.req.op)).toEqual(["forget", "forgetSong", "prune", "clear"]);
		expect(posted[2]!.req).toMatchObject({ song: "s1", keep: ["a"] });
		expect(new Set(posted.map((p) => p.req.id)).size).toBe(4);
		expect(await cache.songs()).toEqual(songs);
		expect(await cache.estimate()).toEqual({ bytes: 30, files: 2, quota: 100 });
	});
	it("stat answers the file's size, and null for a miss", async () => {
		const cache = new MediaCache();
		answer = () => ({ stat: { bytes: 42 } });
		expect(await cache.stat("k")).toEqual({ bytes: 42 });
		answer = () => ({ stat: null });
		expect(await cache.stat("k")).toBeNull();
	});
	it("a worker that dies answers a miss and turns the cache off", async () => {
		const cache = new MediaCache();
		answer = () => "crash";
		expect(await cache.read("a")).toBeNull();
		expect(workers[0]!.terminated).toBe(true);
		expect(cache.available).toBe(false);
		expect(await cache.songs()).toEqual([]);
		expect(posted).toHaveLength(1);
	});
	it("a worker that never answers is a miss after the read timeout, and songs after the caller's", async () => {
		vi.useFakeTimers();
		const cache = new MediaCache();
		answer = () => "silent";
		const read = cache.read("a");
		const songs = cache.songs(1000);
		await vi.advanceTimersByTimeAsync(1000);
		expect(await songs).toEqual([]);
		await vi.advanceTimersByTimeAsync(4000);
		expect(await read).toBeNull();
	});
});
