import { STEM_MEDIA_CACHE_BYTES } from "#lib/constants/studio.js";
import { cacheBudget } from "#lib/utils/cacheBudget.js";
import { createSliceQueue } from "#lib/utils/createSliceQueue.js";
import { type MediaCacheEntry, mediaCacheEvictions } from "#lib/utils/mediaCacheEvictions.js";

/**
 * The Stem Player's kept songs (audio/mediaCache.ts, "keep on this
 * device"): the stems' compressed playback renditions as they came from
 * Blob, one file a rendition under `stem-shovel/media/` in the Origin
 * Private File System, beside the Studio's `pcm/`, and `index.json` with
 * each file's size, when it was last used and the song it belongs to. The
 * same shape as workers/pcmCache.worker.ts and for the same reasons: a
 * write opens a sync access handle (Safari has OPFS but no
 * `createWritable`), goes to `<key>.part` and is moved over the key's
 * file when whole (where the browser has `move`; else to the key's own
 * file, struck from the saved index first), and the index lists a file
 * only once it is whole; opening the cache drops any file the saved index
 * lacks. Every request answers, with `error` set when anything threw, and
 * the page treats that as a miss.
 *
 * A whole read is a `getFile()`, not a sync handle: it takes no lock, so
 * it never stands in the way of the stream worker (audio/streamWorker.ts),
 * which reads the same files that way. The stream worker never writes;
 * only this worker does.
 *
 * Order (utils/createSliceQueue.ts): `stat` and `read`, what a loading
 * player asks for, are quick and overtake a keep's writes at their next
 * slice; everything else runs one at a time in the order it came, so
 * `songs` answers after every write posted before it.
 */
export type MediaCacheRequest =
	| { id: number; op: "stat"; key: string }
	| { id: number; op: "read"; key: string }
	| { id: number; op: "write"; key: string; bytes: ArrayBuffer; song: string }
	| { id: number; op: "forget"; key: string }
	| { id: number; op: "forgetSong"; song: string }
	| { id: number; op: "prune"; song: string; keep: string[] }
	| { id: number; op: "songs" }
	| { id: number; op: "estimate" }
	| { id: number; op: "clear" };
export interface MediaCacheEstimate {
	bytes: number;
	files: number;
	quota: number;
}
/** What the cache holds of one song. */
export interface MediaCacheSong {
	song: string;
	bytes: number;
	keys: string[];
}
export interface MediaCacheReply {
	id: number;
	stat?: { bytes: number } | null;
	bytes?: ArrayBuffer | null;
	/** A write's file is still there once the cache fits its budget (a song larger than the budget is not kept). */
	kept?: boolean;
	songs?: MediaCacheSong[];
	estimate?: MediaCacheEstimate;
	error?: string;
}

type Index = Record<string, MediaCacheEntry>;
interface SyncHandle {
	write(buffer: ArrayBufferView, options?: { at?: number }): number;
	truncate(size: number): void;
	flush(): void;
	close(): void;
}
type SyncFileHandle = FileSystemFileHandle & {
	createSyncAccessHandle(): Promise<SyncHandle>;
	move(name: string): Promise<void>;
};

const INDEX = "index.json";
/** A key is a rendition's file name without its extension (utils/mediaCacheKey.ts); a song is its id. Nothing that could name the index, a part file or leave the directory. */
const KEY = /^[\w-]{1,64}$/;
const PART = ".part";
/** A write's slice: about 25 ms of a phone's disk. */
const SLICE_BYTES = 8 * 1024 * 1024;
/** A read or a stat marks its file used at most this often. */
const USED_EVERY_MS = 10_000;

let dir: FileSystemDirectoryHandle | null = null;
let index: Index | null = null;
/** The keys a write is under way for: quick requests for them answer null. */
const writing = new Set<string>();

async function directory(): Promise<FileSystemDirectoryHandle> {
	if (dir) return dir;
	const root = await navigator.storage.getDirectory();
	const app = await root.getDirectoryHandle("stem-shovel", { create: true });
	dir = await app.getDirectoryHandle("media", { create: true });
	return dir;
}

async function fileHandle(name: string, create: boolean): Promise<SyncFileHandle | null> {
	try {
		return (await (await directory()).getFileHandle(name, { create })) as SyncFileHandle;
	} catch (e) {
		if ((e as DOMException)?.name === "NotFoundError") return null;
		throw e;
	}
}

async function readWhole(name: string): Promise<ArrayBuffer | null> {
	const file = await fileHandle(name, false);
	return file ? await (await file.getFile()).arrayBuffer() : null;
}

async function writeWhole(name: string, bytes: Uint8Array, slice?: () => Promise<void>) {
	const file = await fileHandle(name, true);
	const handle = await file!.createSyncAccessHandle();
	try {
		handle.truncate(0);
		for (let at = 0; at < bytes.byteLength; at += SLICE_BYTES) {
			if (at > 0 && slice) await slice();
			const piece = bytes.subarray(at, Math.min(at + SLICE_BYTES, bytes.byteLength));
			if (handle.write(piece, { at }) !== piece.byteLength) throw new Error("short write");
		}
		handle.flush();
	} finally {
		handle.close();
	}
}

/** `index.json` as last saved; empty when it is missing or unreadable. */
async function savedIndex(): Promise<Index> {
	try {
		const bytes = await readWhole(INDEX);
		return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as Index) : {};
	} catch {
		return {};
	}
}

const isEntry = (e: unknown): e is MediaCacheEntry =>
	!!e &&
	typeof (e as MediaCacheEntry).bytes === "number" &&
	typeof (e as MediaCacheEntry).used === "number" &&
	typeof (e as MediaCacheEntry).song === "string" &&
	KEY.test((e as MediaCacheEntry).song);

/** The index, read once and squared with the directory: a file it lacks goes (a cut-off write, a part file), and so does an entry without a file or a song. */
async function loadIndex(): Promise<Index> {
	if (index) return index;
	const saved = await savedIndex();
	const next: Index = {};
	const stray: string[] = [];
	const d = await directory();
	for await (const [name, handle] of (
		d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
	).entries()) {
		if (name === INDEX || handle.kind !== "file") continue;
		const entry = saved[name];
		if (isEntry(entry) && KEY.test(name)) next[name] = entry;
		else stray.push(name);
	}
	for (const name of stray) await d.removeEntry(name).catch(() => undefined);
	index = next;
	return index;
}

async function saveIndex() {
	await writeWhole(INDEX, new TextEncoder().encode(JSON.stringify(index ?? {})));
}

async function remove(key: string) {
	const idx = await loadIndex();
	delete idx[key];
	try {
		await (await directory()).removeEntry(key);
	} catch (e) {
		if ((e as DOMException)?.name !== "NotFoundError") throw e;
	}
}

async function quota(): Promise<number> {
	try {
		return (await navigator.storage.estimate()).quota ?? 0;
	} catch {
		return 0;
	}
}

/** Whole songs out, least recently used first, until the cache fits its budget (utils/mediaCacheEvictions.ts). */
async function evict(song: string) {
	const idx = await loadIndex();
	const budget = cacheBudget(STEM_MEDIA_CACHE_BYTES, await quota());
	for (const key of mediaCacheEvictions(idx, song, budget)) await remove(key);
}

/** Marks a file used, at most every USED_EVERY_MS: a reopened song reads all its stems at once. */
async function touch(key: string) {
	const entry = (await loadIndex())[key];
	if (!entry || Date.now() - entry.used < USED_EVERY_MS) return;
	entry.used = Date.now();
	await saveIndex();
}

async function stat(id: number, key: string): Promise<MediaCacheReply> {
	const entry = (await loadIndex())[key];
	if (writing.has(key) || !entry) return { id, stat: null };
	await touch(key);
	return { id, stat: { bytes: entry.bytes } };
}

async function read(id: number, key: string): Promise<MediaCacheReply> {
	const idx = await loadIndex();
	if (writing.has(key) || !idx[key]) return { id, bytes: null };
	const bytes = await readWhole(key);
	if (!bytes || bytes.byteLength !== idx[key].bytes) {
		// Gone, or not the length that was written: no copy at all.
		await remove(key);
		await saveIndex();
		return { id, bytes: null };
	}
	await touch(key);
	return { id, bytes };
}

/** Whether this browser can rename a file in OPFS (`FileSystemHandle.move`). */
function canMove(): boolean {
	const proto = (globalThis as { FileSystemHandle?: { prototype: object } }).FileSystemHandle
		?.prototype as { move?: unknown } | undefined;
	return typeof proto?.move === "function";
}

/** The bytes into the key's file whole, by a part file moved over it where the browser can move one. */
async function writeFile(key: string, bytes: Uint8Array, slice: () => Promise<void>) {
	const idx = await loadIndex();
	if (!canMove()) {
		// No move: the key's own file, struck from the saved index first so a cut-off write is dropped on the next open.
		if (idx[key]) {
			delete idx[key];
			await saveIndex();
		}
		await writeWhole(key, bytes, slice);
		return;
	}
	try {
		await writeWhole(key + PART, bytes, slice);
		const part = (await fileHandle(key + PART, false))!;
		delete idx[key];
		await remove(key);
		await part.move(key);
	} catch (e) {
		await (await directory()).removeEntry(key + PART).catch(() => undefined);
		throw e;
	}
}

async function write(
	id: number,
	key: string,
	bytes: ArrayBuffer,
	song: string,
	slice: () => Promise<void>,
): Promise<MediaCacheReply> {
	const idx = await loadIndex();
	writing.add(key);
	try {
		await writeFile(key, new Uint8Array(bytes), slice);
	} catch (e) {
		// A half-written file (the quota ran out, say) is no copy at all.
		await remove(key).catch(() => undefined);
		await saveIndex().catch(() => undefined);
		throw e;
	} finally {
		writing.delete(key);
	}
	idx[key] = { bytes: bytes.byteLength, used: Date.now(), song };
	await evict(song);
	await saveIndex();
	return { id, kept: !!idx[key] };
}

async function forget(id: number, key: string): Promise<MediaCacheReply> {
	await remove(key);
	await saveIndex();
	return { id };
}

/** Every file of the song but those in `keep` (with none kept, the whole song). */
async function forgetSong(id: number, song: string, keep: string[] = []): Promise<MediaCacheReply> {
	const idx = await loadIndex();
	const kept = new Set(keep);
	for (const [key, e] of Object.entries(idx))
		if (e.song === song && !kept.has(key)) await remove(key);
	await saveIndex();
	return { id };
}

async function songs(id: number): Promise<MediaCacheReply> {
	const bySong = new Map<string, MediaCacheSong>();
	for (const [key, e] of Object.entries(await loadIndex())) {
		const s = bySong.get(e.song) ?? { song: e.song, bytes: 0, keys: [] };
		s.bytes += e.bytes;
		s.keys.push(key);
		bySong.set(e.song, s);
	}
	return { id, songs: [...bySong.values()] };
}

async function estimate(id: number): Promise<MediaCacheReply> {
	const entries = Object.values(await loadIndex());
	return {
		id,
		estimate: {
			bytes: entries.reduce((n, e) => n + e.bytes, 0),
			files: entries.length,
			quota: await quota(),
		},
	};
}

async function clear(id: number): Promise<MediaCacheReply> {
	const d = await directory();
	for (const key of Object.keys(await loadIndex())) await remove(key);
	await d.removeEntry(INDEX).catch(() => undefined);
	index = {};
	return { id };
}

type Op = MediaCacheRequest["op"];
type Handler<O extends Op> = (
	req: Extract<MediaCacheRequest, { op: O }>,
	slice: () => Promise<void>,
) => Promise<MediaCacheReply>;
const bad = (id: number, what: string) => Promise.resolve({ id, error: `bad ${what}` });

/** Each request's work, its key and song checked against KEY first. */
const handlers: { [O in Op]: Handler<O> } = {
	songs: (req) => songs(req.id),
	estimate: (req) => estimate(req.id),
	clear: (req) => clear(req.id),
	forgetSong: (req) => (KEY.test(req.song) ? forgetSong(req.id, req.song) : bad(req.id, "song")),
	prune: (req) =>
		KEY.test(req.song) && Array.isArray(req.keep)
			? forgetSong(req.id, req.song, req.keep)
			: bad(req.id, "song"),
	stat: (req) => (KEY.test(req.key) ? stat(req.id, req.key) : bad(req.id, "key")),
	read: (req) => (KEY.test(req.key) ? read(req.id, req.key) : bad(req.id, "key")),
	forget: (req) => (KEY.test(req.key) ? forget(req.id, req.key) : bad(req.id, "key")),
	write: (req, slice) =>
		KEY.test(req.key) && KEY.test(req.song)
			? write(req.id, req.key, req.bytes, req.song, slice)
			: bad(req.id, "key or song"),
};

function handle(req: MediaCacheRequest, slice: () => Promise<void>): Promise<MediaCacheReply> {
	const run = handlers[req.op] as Handler<Op> | undefined;
	return run ? run(req as never, slice) : bad(req.id, "op");
}

/** A yield to the event loop with no timer clamp: a message to itself, so requests posted meanwhile are delivered first. */
const tick = new MessageChannel();
const ticking: (() => void)[] = [];
tick.port1.onmessage = () => ticking.shift()?.();
function pause(): Promise<void> {
	return new Promise((resolve) => {
		ticking.push(resolve);
		tick.port2.postMessage(null);
	});
}

const queue = createSliceQueue(pause);

async function answer(req: MediaCacheRequest, slice: () => Promise<void>) {
	let reply: MediaCacheReply;
	try {
		reply = await handle(req, slice);
	} catch (err) {
		reply = { id: req.id, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(reply, reply.bytes ? [reply.bytes] : []);
}

self.onmessage = (e: MessageEvent<MediaCacheRequest>) => {
	const req = e.data;
	if (req.op === "stat" || req.op === "read") void queue.quick(() => answer(req, async () => {}));
	else void queue.push((slice) => answer(req, slice));
};
