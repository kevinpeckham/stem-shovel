import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
	type AlignmentFeaturesRecord,
	readAlignmentFeatures,
	writeAlignmentFeatures,
} from "./alignmentFeaturesCache";

/**
 * The alignment features kept in the browser (audio/alignmentFeaturesCache.ts)
 * against a fake IndexedDB: a miss, a write read back with its arrays, the
 * oldest going past 24, and no IndexedDB at all being a miss and a no-op.
 */
const record = (key: string, at: number): AlignmentFeaturesRecord => ({
	key,
	at,
	sampleRate: 48000,
	chroma: Float32Array.from({ length: 24 }, (_, i) => i / 24),
	frames: 2,
	hopSec: 4096 / 48000,
	firstSound: 0.5,
	lastSound: 140,
	onset: Float32Array.from([0, 1, 0.5]),
	fps: 86,
});

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
		await writeAlignmentFeatures("af1:48000:a", record("af1:48000:a", 1));
		const hit = await readAlignmentFeatures("af1:48000:a");
		expect(hit).toEqual(record("af1:48000:a", 1));
		expect(hit?.chroma).toBeInstanceOf(Float32Array);
		expect(hit?.onset).toBeInstanceOf(Float32Array);
	});

	it("keeps a record without an envelope", async () => {
		await writeAlignmentFeatures("k", { ...record("k", 1), onset: null, fps: null });
		expect((await readAlignmentFeatures("k"))?.onset).toBeNull();
	});

	it("keeps the 24 newest, the oldest written going first", async () => {
		for (let i = 0; i < 26; i++) await writeAlignmentFeatures(`k${i}`, record(`k${i}`, 1000 + i));
		expect(await readAlignmentFeatures("k0")).toBeNull();
		expect(await readAlignmentFeatures("k1")).toBeNull();
		expect(await readAlignmentFeatures("k2")).not.toBeNull();
		expect(await readAlignmentFeatures("k25")).not.toBeNull();
	});

	it("without IndexedDB every read misses and every write does nothing, without throwing", async () => {
		vi.stubGlobal("indexedDB", undefined);
		await expect(writeAlignmentFeatures("k", record("k", 1))).resolves.toBeUndefined();
		await expect(readAlignmentFeatures("k")).resolves.toBeNull();
	});

	it("an open that fails is a miss and a no-op", async () => {
		vi.stubGlobal("indexedDB", {
			open: () => {
				throw new Error("SecurityError");
			},
		});
		await expect(writeAlignmentFeatures("k", record("k", 1))).resolves.toBeUndefined();
		await expect(readAlignmentFeatures("k")).resolves.toBeNull();
	});
});
