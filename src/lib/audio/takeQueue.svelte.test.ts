import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The Idea Recorder's upload queue (takeQueue.svelte.ts) against a fake
 * IndexedDB: a take is persisted before its upload and forgotten once
 * saved; an idea is made for a take that has none; the mix goes first and
 * then each source, with progress spanning them all; a retry after a
 * source failed does not save the mix twice; Discard and restore.
 */
const h = vi.hoisted(() => ({
	uploadRecordingFile: vi.fn(),
	uploadRecordingStemFile: vi.fn(),
	postJson: vi.fn(),
}));
vi.mock("#lib/upload.js", () => ({
	uploadRecordingFile: h.uploadRecordingFile,
	uploadRecordingStemFile: h.uploadRecordingStemFile,
	postJson: h.postJson,
}));

const { TakeQueue } = await import("./takeQueue.svelte");
type Pending = Parameters<InstanceType<typeof TakeQueue>["enqueue"]>[0];

const take = (over: Partial<Pending> = {}): Pending => ({
	localId: "local-1",
	ideaId: "idea-1",
	ideaTitle: "Riff",
	name: "slow one",
	durationSeconds: 12.25,
	mimeType: "audio/webm",
	ext: "webm",
	codec: "opus",
	trimSilence: true,
	createdAt: 1000,
	instruments: { drums: null, piano: null, chords: null } as Pending["instruments"],
	blob: new Blob(["mix"], { type: "audio/webm" }),
	...over,
});
const stem = (label: string): NonNullable<Pending["stems"]>[number] => ({
	label,
	blob: new Blob([label], { type: "audio/wav" }),
	mimeType: "audio/wav",
	ext: "wav",
	codec: "pcm",
});

function storedRows(): Promise<Pending[]> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("stem-shovel", 1);
		req.onupgradeneeded = () =>
			req.result.createObjectStore("pendingTakes", { keyPath: "localId" });
		req.onsuccess = () => {
			const db = req.result;
			const get = db.transaction("pendingTakes", "readonly").objectStore("pendingTakes").getAll();
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
		const req = indexedDB.open("stem-shovel", 1);
		req.onupgradeneeded = () =>
			req.result.createObjectStore("pendingTakes", { keyPath: "localId" });
		req.onsuccess = () => {
			const db = req.result;
			const tx = db.transaction("pendingTakes", "readwrite");
			tx.objectStore("pendingTakes").put(row);
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
	h.uploadRecordingFile.mockImplementation(
		async (
			_file: File,
			reserve: () => Promise<unknown>,
			_d: number,
			onProgress?: (p: number) => void,
		) => {
			await reserve();
			onProgress?.(50);
			return { recordingId: "rec-1", takeNumber: 3 };
		},
	);
	h.uploadRecordingStemFile.mockImplementation(
		async (_id: string, _file: File, _s: unknown, _d: number, onProgress?: (p: number) => void) => {
			onProgress?.(50);
			return { stemId: "stem" };
		},
	);
	h.postJson.mockResolvedValue({ recordingId: "rec-1", takeNumber: 3, pathname: "p" });
});

describe("TakeQueue", () => {
	it("persists the take, reserves it under its idea with its name, codec and trim choice, then forgets it and reports what was saved", async () => {
		const onsaved = vi.fn();
		const ideaFor = vi.fn();
		const q = new TakeQueue({ ideaFor, onsaved });
		h.uploadRecordingFile.mockImplementationOnce(
			async (
				file: File,
				reserve: () => Promise<unknown>,
				duration: number,
				onProgress: (p: number) => void,
			) => {
				expect(file.name).toBe("take-local-1.webm");
				expect(file.type).toBe("audio/webm");
				expect(duration).toBe(12.25);
				expect((await storedRows()).map((r) => r.localId)).toEqual(["local-1"]);
				await reserve();
				onProgress(50);
				expect(q.items[0].progress).toBe(50); // the mix is the whole take: no sources
				return { recordingId: "rec-1", takeNumber: 3 };
			},
		);
		q.enqueue(take());
		expect(q.pending).toBe(1);
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(ideaFor).not.toHaveBeenCalled();
		expect(h.postJson).toHaveBeenCalledWith("/api/recordings", {
			ideaId: "idea-1",
			title: "slow one",
			filename: "take-local-1.webm",
			sizeBytes: 3,
			codec: "opus",
			trimSilence: true,
		});
		expect(onsaved).toHaveBeenCalledWith({
			localId: "local-1",
			id: "rec-1",
			ideaId: "idea-1",
			instruments: { drums: null, piano: null, chords: null },
			takeNumber: 3,
			title: "slow one",
			durationSeconds: 12.25,
		});
		await vi.waitFor(async () => expect(await storedRows()).toEqual([]));
	});
	it("makes the idea first when the take has none, and remembers it on disk", async () => {
		const ideaFor = vi.fn(async (item: { ideaTitle: string }) => `idea-for-${item.ideaTitle}`);
		const q = new TakeQueue({ ideaFor, onsaved: vi.fn() });
		q.enqueue(take({ ideaId: null, codec: undefined, trimSilence: undefined }));
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(ideaFor).toHaveBeenCalledWith(
			expect.objectContaining({ localId: "local-1", ideaTitle: "Riff" }),
		);
		expect(h.postJson).toHaveBeenCalledWith(
			"/api/recordings",
			expect.objectContaining({ ideaId: "idea-for-Riff", codec: null, trimSilence: false }),
		);
	});
	it("uploads the mix, then each source in order with its label and sort order; progress spans them all", async () => {
		const onsaved = vi.fn();
		const q = new TakeQueue({ ideaFor: vi.fn(), onsaved });
		const progress: number[] = [];
		h.uploadRecordingFile.mockImplementationOnce(
			async (
				_f: File,
				reserve: () => Promise<unknown>,
				_d: number,
				onProgress: (p: number) => void,
			) => {
				await reserve();
				onProgress(60);
				progress.push(q.items[0].progress);
				return { recordingId: "rec-1", takeNumber: 3 };
			},
		);
		h.uploadRecordingStemFile.mockImplementation(
			async (_id: string, _f: File, _s: unknown, _d: number, onProgress: (p: number) => void) => {
				onProgress(100);
				progress.push(q.items[0].progress);
				return { stemId: "s" };
			},
		);
		q.enqueue(take({ stems: [stem("Microphone"), stem("Piano")] }));
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(
			h.uploadRecordingStemFile.mock.calls.map((c) => [c[0], (c[1] as File).name, c[2], c[3]]),
		).toEqual([
			["rec-1", "microphone.wav", { label: "Microphone", sortOrder: 0, codec: "pcm" }, 12.25],
			["rec-1", "piano.wav", { label: "Piano", sortOrder: 1, codec: "pcm" }, 12.25],
		]);
		// Three parts: the mix's 60 % is a fifth of the whole, each finished source adds a third.
		expect(progress.map((p) => Math.round(p))).toEqual([20, 67, 100]);
		expect(onsaved).toHaveBeenCalledTimes(1);
	});
	it("after a source fails, Retry resumes at that source without saving the mix again", async () => {
		const onsaved = vi.fn();
		const q = new TakeQueue({ ideaFor: vi.fn(), onsaved });
		h.uploadRecordingStemFile
			.mockResolvedValueOnce({ stemId: "s1" })
			.mockRejectedValueOnce(new Error("Network down"))
			.mockResolvedValueOnce({ stemId: "s2" });
		q.enqueue(take({ stems: [stem("Microphone"), stem("Piano")] }));
		await vi.waitFor(() => expect(q.items[0].status).toBe("failed"));
		expect(q.items[0].error).toBe("Network down");
		expect(q.items[0]).toMatchObject({ savedId: "rec-1", savedTakeNumber: 3, stemsDone: 1 });
		expect(q.pending).toBe(0);
		// The progress survives a reload too.
		await vi.waitFor(async () =>
			expect(await storedRows()).toEqual([
				expect.objectContaining({ savedId: "rec-1", stemsDone: 1 }),
			]),
		);
		q.retry("local-1");
		await vi.waitFor(() => expect(q.items).toHaveLength(0));
		expect(h.uploadRecordingFile).toHaveBeenCalledTimes(1);
		expect(h.uploadRecordingStemFile).toHaveBeenCalledTimes(3);
		expect(h.uploadRecordingStemFile.mock.calls[2][2]).toMatchObject({
			label: "Piano",
			sortOrder: 1,
		});
		expect(onsaved).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-1", takeNumber: 3 }));
	});
	it("keeps a failed mix upload for Retry and Discard drops it from the list and the disk", async () => {
		h.uploadRecordingFile.mockRejectedValueOnce(new Error("Storage is full"));
		const q = new TakeQueue({ ideaFor: vi.fn(), onsaved: vi.fn() });
		q.enqueue(take());
		await vi.waitFor(() => expect(q.items[0].status).toBe("failed"));
		expect(q.items[0].error).toBe("Storage is full");
		expect((await storedRows()).map((r) => r.localId)).toEqual(["local-1"]);
		await q.discard("local-1");
		expect(q.items).toEqual([]);
		expect(await storedRows()).toEqual([]);
	});
	it("uploads takes one at a time in order, and restores an earlier visit's takes oldest first without duplicates", async () => {
		await putRow(take({ localId: "late", createdAt: 3000, name: "late" }));
		await putRow(take({ localId: "early", createdAt: 1000, name: "early" }));
		await putRow(take({ localId: "dup", createdAt: 2000, name: "dup" }));
		const titles: string[] = [];
		h.postJson.mockImplementation(async (_p: string, body: { title: string }) => {
			titles.push(body.title);
			return { recordingId: body.title, takeNumber: 1, pathname: "p" };
		});
		const q = new TakeQueue({ ideaFor: vi.fn(), onsaved: vi.fn() });
		q.items.push({
			...take({ localId: "dup", name: "dup" }),
			status: "failed",
			progress: 0,
			error: "x",
		});
		await q.restore();
		expect(q.items.map((i) => i.localId)).toEqual(["dup", "early", "late"]);
		await vi.waitFor(() => expect(titles).toEqual(["early", "late"]));
		await settled();
		expect(q.items.map((i) => i.localId)).toEqual(["dup"]);
	});
});
