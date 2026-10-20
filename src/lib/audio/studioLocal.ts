import type { StudioArrangement, StudioSourceView } from "#lib/val/StudioSchema.js";
import type { PendingSource } from "./studioQueue.svelte";

/**
 * A Dawn song kept in the browser (docs/multitrack-recorder.md, "Signed
 * out"): a visitor, or a member of no editing account, records and
 * arranges as anyone does, and the song lives in IndexedDB instead of the
 * server. The arrangement, the title and the notes are one record here;
 * the recordings themselves are the upload queue's pending sources under
 * the idea id `LOCAL_SONG` (studioQueue.svelte.ts keeps them, blobs and
 * all, and holds them back from uploading until a signed-in member
 * adopts them into a song of theirs). Modeled on the looper's loopStore.
 */
export const LOCAL_SONG = "local";

export interface LocalSong {
	title: string;
	notes: string;
	arrangement: StudioArrangement;
	savedAt: number;
}

const DB_NAME = "stem-shovel-studio-local";
const STORE = "song";
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

export async function saveLocalSong(song: LocalSong): Promise<void> {
	if (typeof indexedDB === "undefined") return;
	await withStore("readwrite", (s) => s.put(song, KEY)).catch(() => undefined);
}
export async function loadLocalSong(): Promise<LocalSong | null> {
	if (typeof indexedDB === "undefined") return null;
	return withStore<LocalSong | undefined>("readonly", (s) => s.get(KEY))
		.then((r) => r ?? null)
		.catch(() => null);
}
export async function clearLocalSong(): Promise<void> {
	if (typeof indexedDB === "undefined") return;
	await withStore("readwrite", (s) => s.delete(KEY)).catch(() => undefined);
}

/**
 * The kept recordings as the engine loads sources: each with its blob
 * beside the view (the engine decodes the blob itself; a blob: URL would
 * need the content security policy to allow it, and it does not).
 */
export function localSourceViews(kept: PendingSource[]): (StudioSourceView & { blob: Blob })[] {
	return kept.map((k) => ({
		id: k.sourceId,
		kind: k.kind,
		takeNumber: k.takeNumber,
		trackLabel: k.trackLabel,
		url: "",
		filename: k.filename,
		codec: k.kind === "take" ? "pcm" : null,
		sampleRate: k.sampleRate,
		channels: k.channels,
		durationSeconds: k.durationSeconds,
		sizeBytes: k.blob.size,
		peaks: k.peaks,
		createdAt: new Date(k.createdAt),
		blob: k.blob,
	}));
}
