import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The Studio's upload queue (studioQueue.svelte.ts) against a fake
 * IndexedDB: a source is persisted before its upload, uploaded one at a
 * time in order with the reservation the server expects, forgotten once
 * saved; a failure keeps it for Retry; Discard drops it; a new visit
 * restores what an earlier one left, oldest first, without duplicates.
 */
const h = vi.hoisted(() => ({
	uploadStudioSourceFile: vi.fn(),
	postJson: vi.fn(),
}));
vi.mock("#lib/upload.js", () => ({
	uploadStudioSourceFile: h.uploadStudioSourceFile,
	postJson: h.postJson,
}));

const { StudioQueue } = await import("./studioQueue.svelte");
type Pending = Parameters<InstanceType<typeof StudioQueue>["enqueue"]>[0];

const source = (over: Partial<Pending> = {}): Pending => ({
	sourceId: "src-1",
	ideaId: "idea-1",
	kind: "take",
	trackLabel: "Guitar",
	takeNumber: 2,
	durationSeconds: 3.5,
	sampleRate: 48000,
	channels: 2,
	peaks: [0, 0.5, 1],
	createdAt: 1000,
	filename: "guitar.wav",
	blob: new Blob(["wav"], { type: "audio/wav" }),
	...over,
});

/** Every row in the queue's object store, read straight from the fake database. */
function storedRows(): Promise<Pending[]> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("stem-shovel-studio", 1);
		req.onupgradeneeded = () =>
			req.result.createObjectStore("pendingSources", { keyPath: "sourceId" });
		req.onsuccess = () => {
			const db = req.result;
			const get = db
				.transaction("pendingSources", "readonly")
				.objectStore("pendingSources")
				.getAll();
			get.onsuccess = () => {
				db.close();
				resolve(get.result as Pending[]);
			};
			get.onerror = () => reject(get.error);
		};
		req.onerror = () => reject(req.error);
	});
}
function putRow(row: Pending): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("stem-shovel-studio", 1);
		req.onupgradeneeded = () =>
			req.result.createObjectStore("pendingSources", { keyPath: "sourceId" });
		req.onsuccess = () => {
			const db = req.result;
			const tx = db.transaction("pendingSources", "readwrite");
			tx.objectStore("pendingSources").put(row);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
	});
}
const settled = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.resetAllMocks();
	globalThis.indexedDB = new IDBFactory();
	// The upload helper: reserve through the callback it is given, report progress, answer the id.
	h.uploadStudioSourceFile.mockImplementation(
		async (
			_file: File,
			reserve: () => Promise<unknown>,
			_ready: unknown,
			onProgress?: (p: number) => void,
		) => {
			await reserve();
			onProgress?.(40);
			return { sourceId: "src-1" };
		},
	);
	h.postJson.mockResolvedValue({ sourceId: "src-1", pathname: "p" });
});

describe("StudioQueue", () => {
	it("persists a take before uploading it, reserves it with the server's shape, and forgets it once saved", async () => {
		const onsaved = vi.fn();
		const q = new StudioQueue({ onsaved });
		let reserved = false;
		h.uploadStudioSourceFile.mockImplementationOnce(
			async (
				file: File,
				reserve: () => Promise<unknown>,
				ready: unknown,
				onProgress: (p: number) => void,
			) => {
				expect(file.name).toBe("guitar.wav");
				expect(file.type).toBe("audio/wav");
				expect(ready).toEqual({ peaks: [0, 0.5, 1], durationSeconds: 3.5 });
				// On disk before the bytes leave: a crash now loses nothing.
				expect((await storedRows()).map((r) => r.sourceId)).toEqual(["src-1"]);
				expect(q.items[0].status).toBe("uploading");
				await reserve();
				reserved = true;
				onProgress(40);
				expect(q.items[0].progress).toBe(40);
				return { sourceId: "src-1" };
			},
		);
		q.enqueue(source());
		expect(q.items).toHaveLength(1);
		// The upload starts in the same tick: the item is already past "waiting".
		expect(q.items[0]).toMatchObject({ status: "uploading", progress: 0, error: null });
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(reserved).toBe(true);
		expect(h.postJson).toHaveBeenCalledWith("/api/studio/sources", {
			id: "src-1",
			ideaId: "idea-1",
			kind: "take",
			trackLabel: "Guitar",
			takeNumber: 2,
			filename: "guitar.wav",
			sizeBytes: 3,
			codec: "pcm",
			sampleRate: 48000,
			channels: 2,
			durationSeconds: 3.5,
		});
		expect(onsaved).toHaveBeenCalledWith("src-1", "idea-1");
		await vi.waitFor(async () => expect(await storedRows()).toEqual([]));
	});
	it("reserves an import without a codec", async () => {
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.enqueue(source({ sourceId: "src-2", kind: "import", filename: "loop.mp3" }));
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(h.postJson).toHaveBeenCalledWith(
			"/api/studio/sources",
			expect.objectContaining({ id: "src-2", kind: "import", filename: "loop.mp3", codec: null }),
		);
	});
	it("uploads one source at a time, in the order they were queued", async () => {
		const order: string[] = [];
		let release: () => void = () => {};
		h.uploadStudioSourceFile.mockImplementation(async (file: File) => {
			order.push(`start ${file.name}`);
			await new Promise<void>((r) => (release = r));
			order.push(`end ${file.name}`);
			return { sourceId: file.name };
		});
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.enqueue(source({ sourceId: "a", filename: "a.wav" }));
		q.enqueue(source({ sourceId: "b", filename: "b.wav" }));
		await settled();
		expect(order).toEqual(["start a.wav"]);
		expect(q.items.map((i) => i.status)).toEqual(["uploading", "waiting"]);
		release();
		await vi.waitFor(() => expect(order).toContain("start b.wav"));
		expect(order).toEqual(["start a.wav", "end a.wav", "start b.wav"]);
		release();
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
	});
	it("keeps a failed upload with its message for Retry, and Retry uploads it again", async () => {
		h.uploadStudioSourceFile.mockRejectedValueOnce(new Error("Storage is full"));
		const onsaved = vi.fn();
		const q = new StudioQueue({ onsaved });
		q.enqueue(source());
		await vi.waitFor(() => expect(q.items[0].status).toBe("failed"));
		expect(q.items[0].error).toBe("Storage is full");
		expect(onsaved).not.toHaveBeenCalled();
		// Still on disk: a reload would bring it back.
		expect((await storedRows()).map((r) => r.sourceId)).toEqual(["src-1"]);
		q.retry("src-1");
		expect(q.items[0]).toMatchObject({ status: "uploading", error: null });
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(onsaved).toHaveBeenCalledWith("src-1", "idea-1");
	});
	it("Retry does nothing for a source that is not failed", async () => {
		let release: () => void = () => {};
		h.uploadStudioSourceFile.mockImplementation(
			() => new Promise((r) => (release = () => r({ sourceId: "src-1" }))),
		);
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.enqueue(source());
		await settled();
		q.retry("src-1");
		expect(q.items[0].status).toBe("uploading");
		q.retry("nope");
		release();
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(h.uploadStudioSourceFile).toHaveBeenCalledTimes(1);
	});
	it("Discard drops a failed source from the list and from disk", async () => {
		h.uploadStudioSourceFile.mockRejectedValueOnce(new Error("no"));
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.enqueue(source());
		await vi.waitFor(() => expect(q.items[0].status).toBe("failed"));
		await q.discard("src-1");
		expect(q.items).toEqual([]);
		expect(await storedRows()).toEqual([]);
	});
	it("restores what an earlier visit left, oldest first, skipping what is already queued, and resumes the uploads", async () => {
		await putRow(source({ sourceId: "late", createdAt: 3000, filename: "late.wav" }));
		await putRow(source({ sourceId: "early", createdAt: 1000, filename: "early.wav" }));
		await putRow(source({ sourceId: "dup", createdAt: 2000, filename: "dup.wav" }));
		const uploaded: string[] = [];
		h.uploadStudioSourceFile.mockImplementation(async (file: File) => {
			uploaded.push(file.name);
			return { sourceId: file.name };
		});
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.items.push({ ...source({ sourceId: "dup" }), status: "failed", progress: 0, error: "x" });
		await q.restore();
		await vi.waitFor(() => expect(uploaded).toEqual(["early.wav", "late.wav"]));
		await vi.waitFor(() => expect(q.items.map((i) => i.sourceId)).toEqual(["dup"]));
	});
	it("reports an HttpError-shaped failure through errorMessage", async () => {
		h.uploadStudioSourceFile.mockRejectedValueOnce({ status: 413, body: { message: "Too large" } });
		const q = new StudioQueue({ onsaved: vi.fn() });
		q.enqueue(source());
		await vi.waitFor(() => expect(q.items[0].status).toBe("failed"));
		expect(q.items[0].error).toBe("Too large");
	});
});
