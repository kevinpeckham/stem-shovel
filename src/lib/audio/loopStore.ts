import type { LoopSource } from "./looper.svelte";

/**
 * The loop kept in the browser (docs/looper.md, "Signed out"): the layers'
 * audio and the loop's settings in IndexedDB (its own database, beside
 * the recorder's pending takes), written a moment after every change and
 * read back when the looper opens, so a reload, a sign-in or a visitor
 * without an account keeps the loop. Audio is stored as Float32Array
 * channels (structured clone), a few megabytes per layer.
 */
export interface StoredLayer {
	id: string;
	label: string;
	source: LoopSource;
	gain: number;
	muted: boolean;
	solo: boolean;
	sampleRate: number;
	channels: Float32Array[];
}
export interface StoredLoop {
	bpm: number;
	beatsPerBar: 3 | 4;
	bars: 1 | 2 | 4 | 8;
	layers: StoredLayer[];
	savedAt: number;
	/** The saved loop this is (docs/looper.md, "Save and Export"): its idea and take on the server, its title, whether it is in the recorder's list, and whether the layers changed since. */
	saved?: {
		ideaId: string | null;
		recordingId: string | null;
		title: string;
		inRecorder: boolean;
		dirty: boolean;
	};
}

const DB_NAME = "stem-shovel-looper";
const STORE = "loops";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const req = run(tx.objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		tx.oncomplete = () => db.close();
	});
}

export async function saveStoredLoop(loop: StoredLoop): Promise<void> {
	if (typeof indexedDB === "undefined") return;
	await withStore("readwrite", (s) => s.put(loop, KEY)).catch(() => undefined);
}
export async function loadStoredLoop(): Promise<StoredLoop | null> {
	if (typeof indexedDB === "undefined") return null;
	return withStore<StoredLoop | undefined>("readonly", (s) => s.get(KEY))
		.then((r) => r ?? null)
		.catch(() => null);
}
export async function clearStoredLoop(): Promise<void> {
	if (typeof indexedDB === "undefined") return;
	await withStore("readwrite", (s) => s.delete(KEY)).catch(() => undefined);
}
