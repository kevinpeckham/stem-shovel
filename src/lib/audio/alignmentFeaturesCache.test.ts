import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { type Features, recordingFeatures } from "@barmark/listen/features";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readAlignmentFeatures, writeAlignmentFeatures } from "./alignmentFeaturesCache";

/**
 * The alignment features kept in the browser (audio/alignmentFeaturesCache.ts)
 * against a fake IndexedDB: a miss, a write read back with its arrays, a
 * record of the old shape or another version read as a miss, the oldest
 * going past 24, and no IndexedDB at all being a miss and a no-op.
 */
const RATE = 8000;
/** A real features record (@barmark/listen's), of half a second of a tone. */
function features(): Features {
	const samples = Float32Array.from({ length: RATE / 2 }, (_, i) =>
		Math.sin((2 * Math.PI * 440 * i) / RATE),
	);
	const r = recordingFeatures(samples, RATE);
	if (!r.ok) throw new Error(r.refusals[0]!.message);
	return r.value;
}

/** Puts `value` under `key` in the cache's store as it is, as an older app version would have. */
async function putRaw(key: string, value: object) {
	await writeAlignmentFeatures("seed", features());
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open("stem-shovel-alignment");
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction("features", "readwrite");
		tx.objectStore("features").put({ ...value, key });
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("alignment features cache", () => {
	it("misses a key never written", async () => {
		expect(await readAlignmentFeatures("af1:48000:a")).toBeNull();
	});

	it("reads back what it wrote, the arrays as Float32Arrays", async () => {
		const kept = features();
		await writeAlignmentFeatures("af1:8000:a", kept);
		const hit = await readAlignmentFeatures("af1:8000:a");
		expect(hit).toEqual(kept);
		expect(hit?.chroma).toBeInstanceOf(Float32Array);
		expect(hit?.onset).toBeInstanceOf(Float32Array);
	});

	it("a record in the app's old shape is a miss, never an error", async () => {
		await putRaw("af1:8000:old", {
			at: 1,
			sampleRate: 48000,
			chroma: new Float32Array(24),
			frames: 2,
			hopSec: 4096 / 48000,
			firstSound: 0.5,
			lastSound: 140,
			onset: Float32Array.from([0, 1, 0.5]),
			fps: 86,
		});
		expect(await readAlignmentFeatures("af1:8000:old")).toBeNull();
	});

	it("a record of another features version, or one that does not hold together, is a miss", async () => {
		await putRaw("v2", { at: 1, features: { ...features(), version: 2 } });
		expect(await readAlignmentFeatures("v2")).toBeNull();
		await putRaw("bad", { at: 1, features: { ...features(), frames: 3 } });
		expect(await readAlignmentFeatures("bad")).toBeNull();
	});

	it("keeps the 24 newest, the oldest written going first", async () => {
		const kept = features();
		const now = vi.spyOn(Date, "now");
		for (let i = 0; i < 26; i++) {
			now.mockReturnValue(1000 + i);
			await writeAlignmentFeatures(`k${i}`, kept);
		}
		now.mockRestore();
		expect(await readAlignmentFeatures("k0")).toBeNull();
		expect(await readAlignmentFeatures("k1")).toBeNull();
		expect(await readAlignmentFeatures("k2")).not.toBeNull();
		expect(await readAlignmentFeatures("k25")).not.toBeNull();
	});

	it("without IndexedDB every read misses and every write does nothing, without throwing", async () => {
		vi.stubGlobal("indexedDB", undefined);
		await expect(writeAlignmentFeatures("k", features())).resolves.toBeUndefined();
		await expect(readAlignmentFeatures("k")).resolves.toBeNull();
	});

	it("an open that fails is a miss and a no-op", async () => {
		vi.stubGlobal("indexedDB", {
			open: () => {
				throw new Error("SecurityError");
			},
		});
		await expect(writeAlignmentFeatures("k", features())).resolves.toBeUndefined();
		await expect(readAlignmentFeatures("k")).resolves.toBeNull();
	});
});
