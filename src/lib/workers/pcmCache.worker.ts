import { STUDIO_PCM_CACHE_BYTES } from "#lib/constants/studio.js";
import { cacheBudget } from "#lib/utils/cacheBudget.js";
import { createSliceQueue } from "#lib/utils/createSliceQueue.js";
import {
	PCM_HEADER_BYTES,
	type PcmHeader,
	pcmFileBytes,
	pcmPlaneRange,
	readPcmHeader,
} from "#lib/utils/pcmFile.js";

/**
 * The Studio's disk cache of decoded sources (audio/pcmCache.ts,
 * docs/multitrack-recorder.md "Scale and structure"): one file a source
 * under `stem-shovel/pcm/` in the Origin Private File System, the bytes
 * utils/pcmFile.ts lays out, and `index.json` beside them with each
 * file's size and when it was last read or written. Every file is opened
 * with a sync access handle, here in a worker, since Safari has OPFS and
 * those handles but no `createWritable`; a handle is opened per request
 * and closed after it. Each request answers, with `error` set when
 * anything threw, and the page treats that as a miss.
 *
 * Order (utils/createSliceQueue.ts): `read`, `write`, `forget`, `estimate`
 * and `clear` run one at a time in the order they came. `stat` and
 * `readRange`, what a streaming voice asks for as the playhead moves, are
 * quick: they run at once when the worker is idle, and otherwise at the
 * running request's next slice. Only a write slices: it writes about 8 MB
 * at a time and yields to the event loop between, so a voice's windows of
 * other sources are served during a write of hundreds of megabytes (about
 * 25 ms a slice at the 320 MB/s a phone measured). A quick request for the
 * key being written answers null until the write is done. Nothing else
 * runs between slices, so the index and the directory only change under
 * one request at a time.
 *
 * A write goes to `<key>.part` and is moved over the key's file when whole
 * (where the browser has `move`; else to the key's own file, struck from
 * the saved index first). Either way the index lists a file only once it
 * is whole, and opening the cache drops any file the saved index lacks:
 * a write cut off by a closed tab leaves nothing behind.
 */
export type PcmCacheRequest =
	| { id: number; op: "read"; key: string }
	| { id: number; op: "stat"; key: string }
	| { id: number; op: "readRange"; key: string; fromFrame: number; frames: number }
	| { id: number; op: "write"; key: string; bytes: ArrayBuffer }
	| { id: number; op: "forget"; key: string }
	| { id: number; op: "estimate" }
	| { id: number; op: "clear" };
export interface PcmCacheEstimate {
	bytes: number;
	entries: number;
	quota: number;
}
/** A source's header and its file's size, without its samples. */
export interface PcmStat extends PcmHeader {
	bytes: number;
}
/** A window of every channel: `frames` from `fromFrame` (clipped to the file), the planes back to back in `data`. */
export interface PcmRange {
	fromFrame: number;
	frames: number;
	channels: number;
	sampleRate: number;
	data: ArrayBuffer;
}
export interface PcmCacheReply {
	id: number;
	bytes?: ArrayBuffer | null;
	stat?: PcmStat | null;
	range?: PcmRange | null;
	estimate?: PcmCacheEstimate;
	error?: string;
}

type Index = Record<string, { bytes: number; used: number }>;
interface SyncHandle {
	read(buffer: ArrayBufferView, options?: { at?: number }): number;
	write(buffer: ArrayBufferView, options?: { at?: number }): number;
	truncate(size: number): void;
	getSize(): number;
	flush(): void;
	close(): void;
}
type SyncFileHandle = FileSystemFileHandle & {
	createSyncAccessHandle(): Promise<SyncHandle>;
	move(name: string): Promise<void>;
};

const INDEX = "index.json";
/** A key is a source id (nanoid): nothing that could name the index, a part file or leave the directory. */
const KEY = /^[\w-]{1,64}$/;
const PART = ".part";
/** A write's slice: about 25 ms of a phone's disk. */
const SLICE_BYTES = 8 * 1024 * 1024;
/** A range read marks its source used at most this often, not once a window. */
const USED_EVERY_MS = 10_000;

let dir: FileSystemDirectoryHandle | null = null;
let index: Index | null = null;
/** The keys a write is under way for: quick requests for them answer null. */
const writing = new Set<string>();

async function directory(): Promise<FileSystemDirectoryHandle> {
	if (dir) return dir;
	const root = await navigator.storage.getDirectory();
	const app = await root.getDirectoryHandle("stem-shovel", { create: true });
	dir = await app.getDirectoryHandle("pcm", { create: true });
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
	if (!file) return null;
	const handle = await file.createSyncAccessHandle();
	try {
		const out = new Uint8Array(handle.getSize());
		handle.read(out, { at: 0 });
		return out.buffer;
	} finally {
		handle.close();
	}
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

/** The index, read once and squared with the directory: a file it lacks goes (a cut-off write, a part file), and so does an entry without a file. */
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
		if (entry && KEY.test(name)) next[name] = entry;
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

/** Least recently used out until the cache fits its budget: the constant, or half the site's quota when that is less. */
async function evict(keep: string) {
	const idx = await loadIndex();
	const q = await quota();
	const budget = cacheBudget(STUDIO_PCM_CACHE_BYTES, q);
	let total = Object.values(idx).reduce((n, e) => n + e.bytes, 0);
	const oldest = Object.keys(idx)
		.filter((k) => k !== keep)
		.sort((a, b) => idx[a]!.used - idx[b]!.used);
	for (const k of oldest) {
		if (total <= budget) break;
		total -= idx[k]!.bytes;
		await remove(k);
	}
	// One source larger than the whole budget is not kept either.
	if (total > budget && idx[keep]) await remove(keep);
}

async function estimate(id: number): Promise<PcmCacheReply> {
	const entries = Object.values(await loadIndex());
	return {
		id,
		estimate: {
			bytes: entries.reduce((n, e) => n + e.bytes, 0),
			entries: entries.length,
			quota: await quota(),
		},
	};
}

async function clear(id: number): Promise<PcmCacheReply> {
	const d = await directory();
	for (const key of Object.keys(await loadIndex())) await remove(key);
	await d.removeEntry(INDEX).catch(() => undefined);
	index = {};
	return { id };
}

async function read(id: number, key: string): Promise<PcmCacheReply> {
	const idx = await loadIndex();
	if (!idx[key]) return { id, bytes: null };
	const bytes = await readWhole(key);
	if (bytes) idx[key] = { bytes: bytes.byteLength, used: Date.now() };
	else delete idx[key];
	await saveIndex();
	return { id, bytes };
}

/** The file's header and size, or null when it is missing, is not such a file or is not its header's length. */
async function statFile(key: string): Promise<PcmStat | null> {
	const file = await fileHandle(key, false);
	if (!file) return null;
	const handle = await file.createSyncAccessHandle();
	try {
		const head = new Uint8Array(PCM_HEADER_BYTES);
		handle.read(head, { at: 0 });
		const h = readPcmHeader(head.buffer);
		const bytes = handle.getSize();
		return h && bytes === pcmFileBytes(h) ? { ...h, bytes } : null;
	} finally {
		handle.close();
	}
}

async function stat(id: number, key: string): Promise<PcmCacheReply> {
	if (writing.has(key) || !(await loadIndex())[key]) return { id, stat: null };
	return { id, stat: await statFile(key) };
}

/** Marks a source used, at most every USED_EVERY_MS: a voice reads a window every fraction of a second. */
async function touch(key: string) {
	const entry = (await loadIndex())[key];
	if (!entry || Date.now() - entry.used < USED_EVERY_MS) return;
	entry.used = Date.now();
	await saveIndex();
}

/** Every channel's window of an open file, the planes back to back; null when it is not such a file or `fromFrame` is past its end. */
function readWindow(handle: SyncHandle, fromFrame: number, frames: number): PcmRange | null {
	const head = new Uint8Array(PCM_HEADER_BYTES);
	handle.read(head, { at: 0 });
	const h = readPcmHeader(head.buffer);
	if (!h || fromFrame >= h.frames) return null;
	const count = pcmPlaneRange(h, 0, fromFrame, frames).bytes / 4;
	const data = new ArrayBuffer(h.channels * count * 4);
	for (let c = 0; c < h.channels; c++) {
		const { at, bytes } = pcmPlaneRange(h, c, fromFrame, frames);
		if (handle.read(new Uint8Array(data, c * bytes, bytes), { at }) !== bytes)
			throw new Error("short read");
	}
	return { fromFrame, frames: count, channels: h.channels, sampleRate: h.sampleRate, data };
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

async function readRange(
	id: number,
	key: string,
	fromFrame: number,
	frames: number,
): Promise<PcmCacheReply> {
	if (!isCount(fromFrame) || !isCount(frames)) return { id, error: "bad range" };
	const file = writing.has(key) || !(await loadIndex())[key] ? null : await fileHandle(key, false);
	if (!file) return { id, range: null };
	const handle = await file.createSyncAccessHandle();
	let range: PcmRange | null;
	try {
		range = readWindow(handle, fromFrame, frames);
	} finally {
		handle.close();
	}
	if (range) await touch(key);
	return { id, range };
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
	slice: () => Promise<void>,
): Promise<PcmCacheReply> {
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
	idx[key] = { bytes: bytes.byteLength, used: Date.now() };
	await evict(key);
	await saveIndex();
	return { id };
}

async function forget(id: number, key: string): Promise<PcmCacheReply> {
	await remove(key);
	await saveIndex();
	return { id };
}

function handle(req: PcmCacheRequest, slice: () => Promise<void>): Promise<PcmCacheReply> {
	if (req.op === "estimate") return estimate(req.id);
	if (req.op === "clear") return clear(req.id);
	if (!KEY.test(req.key)) return Promise.resolve({ id: req.id, error: "bad key" });
	if (req.op === "read") return read(req.id, req.key);
	if (req.op === "stat") return stat(req.id, req.key);
	if (req.op === "readRange") return readRange(req.id, req.key, req.fromFrame, req.frames);
	if (req.op === "write") return write(req.id, req.key, req.bytes, slice);
	return forget(req.id, req.key);
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

async function answer(req: PcmCacheRequest, slice: () => Promise<void>) {
	let reply: PcmCacheReply;
	try {
		reply = await handle(req, slice);
	} catch (err) {
		reply = { id: req.id, error: err instanceof Error ? err.message : String(err) };
	}
	const transfer = [reply.bytes, reply.range?.data].filter((b): b is ArrayBuffer => !!b);
	(self as unknown as Worker).postMessage(reply, transfer);
}

self.onmessage = (e: MessageEvent<PcmCacheRequest>) => {
	const req = e.data;
	if (req.op === "stat" || req.op === "readRange")
		void queue.quick(() => answer(req, async () => {}));
	else void queue.push((slice) => answer(req, slice));
};
