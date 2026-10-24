import { STUDIO_PCM_CACHE_BYTES } from "#lib/constants/studio.js";

/**
 * The Studio's disk cache of decoded sources (audio/pcmCache.ts,
 * docs/multitrack-recorder.md "Scale and structure"): one file a source
 * under `stem-shovel/pcm/` in the Origin Private File System, the bytes
 * utils/pcmFile.ts lays out, and `index.json` beside them with each
 * file's size and when it was last read or written. Every file is opened
 * with a sync access handle, here in a worker, since Safari has OPFS and
 * those handles but no `createWritable`. Requests run one at a time (a
 * file takes one sync handle at a time); each answers, with `error` set
 * when anything threw, and the page treats that as a miss.
 */
export type PcmCacheRequest =
	| { id: number; op: "read"; key: string }
	| { id: number; op: "write"; key: string; bytes: ArrayBuffer }
	| { id: number; op: "forget"; key: string }
	| { id: number; op: "estimate" }
	| { id: number; op: "clear" };
export interface PcmCacheEstimate {
	bytes: number;
	entries: number;
	quota: number;
}
export interface PcmCacheReply {
	id: number;
	bytes?: ArrayBuffer | null;
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
type SyncFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };

const INDEX = "index.json";
/** A key is a source id (nanoid): nothing that could name the index or leave the directory. */
const KEY = /^[\w-]{1,64}$/;

let dir: FileSystemDirectoryHandle | null = null;
let index: Index | null = null;

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

async function writeWhole(name: string, bytes: Uint8Array) {
	const file = await fileHandle(name, true);
	const handle = await file!.createSyncAccessHandle();
	try {
		handle.truncate(0);
		handle.write(bytes, { at: 0 });
		handle.flush();
	} finally {
		handle.close();
	}
}

/** The index, read once and squared with the directory: a file it lacks joins as least recently used, an entry without a file goes. */
async function loadIndex(): Promise<Index> {
	if (index) return index;
	let saved: Index = {};
	try {
		const bytes = await readWhole(INDEX);
		if (bytes) saved = JSON.parse(new TextDecoder().decode(bytes)) as Index;
	} catch {
		saved = {};
	}
	const next: Index = {};
	const d = await directory();
	for await (const [name, handle] of (
		d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
	).entries()) {
		if (name === INDEX || handle.kind !== "file") continue;
		next[name] = saved[name] ?? {
			bytes: (await (handle as FileSystemFileHandle).getFile()).size,
			used: 0,
		};
	}
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
	const budget = q > 0 ? Math.min(STUDIO_PCM_CACHE_BYTES, q / 2) : STUDIO_PCM_CACHE_BYTES;
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

async function write(id: number, key: string, bytes: ArrayBuffer): Promise<PcmCacheReply> {
	const idx = await loadIndex();
	try {
		await writeWhole(key, new Uint8Array(bytes));
	} catch (e) {
		// A half-written file (the quota ran out, say) is no copy at all.
		await remove(key).catch(() => undefined);
		throw e;
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

function handle(req: PcmCacheRequest): Promise<PcmCacheReply> {
	if (req.op === "estimate") return estimate(req.id);
	if (req.op === "clear") return clear(req.id);
	if (!KEY.test(req.key)) return Promise.resolve({ id: req.id, error: "bad key" });
	if (req.op === "read") return read(req.id, req.key);
	if (req.op === "write") return write(req.id, req.key, req.bytes);
	return forget(req.id, req.key);
}

let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<PcmCacheRequest>) => {
	const req = e.data;
	chain = chain.then(async () => {
		let reply: PcmCacheReply;
		try {
			reply = await handle(req);
		} catch (err) {
			reply = { id: req.id, error: err instanceof Error ? err.message : String(err) };
		}
		const transfer = reply.bytes ? [reply.bytes] : [];
		(self as unknown as Worker).postMessage(reply, transfer);
	});
};
