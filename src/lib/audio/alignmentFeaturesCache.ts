import { openIndexedDb } from "#lib/utils/openIndexedDb.js";

/**
 * The recording features a chart alignment reads, kept per song in this
 * browser (IndexedDB, its own database): the mix's chromagram (flattened,
 * 12 a frame), where its sound starts and ends, and its onset envelope.
 * They depend on the stems alone, not the chart, so a second "Place from
 * chart" after a chart edit skips them (audio/alignChartInBrowser.ts).
 * Keyed by utils/alignmentFeaturesKey.ts (the renditions and the rate,
 * with the feature code's version). At most `KEEP` records, the oldest
 * written going first. The house contract for a browser cache
 * (audio/mediaCache.ts): it never throws; no IndexedDB, a blocked open, a
 * quota error or any other failure is a miss on read and a no-op on write.
 */
export interface AlignmentFeaturesRecord {
	key: string;
	at: number;
	sampleRate: number;
	chroma: Float32Array;
	frames: number;
	hopSec: number;
	firstSound: number;
	lastSound: number;
	/** Null when the envelope's worker failed: the next alignment computes it. */
	onset: Float32Array | null;
	fps: number | null;
}

const DB_NAME = "stem-shovel-alignment";
const STORE = "features";
const BY_AT = "at";
const KEEP = 24;

const openDb = () =>
	openIndexedDb(DB_NAME, (db) => {
		if (!db.objectStoreNames.contains(STORE))
			db.createObjectStore(STORE, { keyPath: "key" }).createIndex(BY_AT, "at");
	});

/** One transaction on the store: `run` starts its requests and resolves the answer; settles when the transaction completes. */
async function inTransaction<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		let value: T;
		const tx = db.transaction(STORE, mode);
		tx.oncomplete = () => {
			db.close();
			resolve(value);
		};
		tx.onerror = tx.onabort = () => {
			db.close();
			reject(tx.error);
		};
		run(tx.objectStore(STORE), (v) => (value = v));
	});
}

/** The record under `key`, or null (a miss, or any failure). */
export async function readAlignmentFeatures(key: string): Promise<AlignmentFeaturesRecord | null> {
	try {
		if (typeof indexedDB === "undefined") return null;
		return await inTransaction<AlignmentFeaturesRecord | null>("readonly", (store, done) => {
			const req = store.get(key);
			req.onsuccess = () => done((req.result as AlignmentFeaturesRecord | undefined) ?? null);
		});
	} catch {
		return null;
	}
}

/** Keeps `record` under `key`, then deletes the oldest beyond `KEEP`; a no-op on any failure. */
export async function writeAlignmentFeatures(
	key: string,
	record: AlignmentFeaturesRecord,
): Promise<void> {
	try {
		if (typeof indexedDB === "undefined") return;
		await inTransaction<void>("readwrite", (store) => {
			store.put({ ...record, key });
			const count = store.count();
			count.onsuccess = () => {
				let excess = count.result - KEEP;
				if (excess <= 0) return;
				const cursor = store.index(BY_AT).openCursor();
				cursor.onsuccess = () => {
					const c = cursor.result;
					if (!c || excess <= 0) return;
					c.delete();
					excess--;
					c.continue();
				};
			};
		});
	} catch {
		// A cache: nothing kept is a miss next time.
	}
}
