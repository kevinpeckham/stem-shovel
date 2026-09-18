import { postJson, uploadRecordingFile, type RecordingReservation } from "$lib/upload";
import { errorMessage } from "$lib/utils/errorMessage";

/**
 * Takes are saved in the background so Record is available the moment Stop
 * is pressed (docs/demo-recording.md). A stopped take goes into this queue
 * with its audio; one upload runs at a time in order, so the server's take
 * numbers follow the recording order. Every pending take is also written to
 * IndexedDB first, so a refresh, a crash or a phone switching apps loses
 * nothing: the page resumes the uploads when it comes back.
 */
export interface PendingTake {
	/** A local id until the server names it. */
	localId: string;
	/** The idea it belongs to, or null while the idea is still being created. */
	ideaId: string | null;
	/** The idea's title at the time, to create the idea on resume when it never was. */
	ideaTitle: string;
	name: string;
	durationSeconds: number;
	mimeType: string;
	ext: string;
	createdAt: number;
	blob: Blob;
}
export interface QueueItem extends PendingTake {
	status: "waiting" | "uploading" | "failed";
	progress: number;
	error: string | null;
}
export interface SavedTake {
	localId: string;
	id: string;
	takeNumber: number;
	title: string;
	durationSeconds: number;
}

const DB_NAME = "stem-shovel";
const STORE = "pendingTakes";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) {
				req.result.createObjectStore(STORE, { keyPath: "localId" });
			}
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
const persist = (t: PendingTake) => withStore("readwrite", (s) => s.put(t)).catch(() => undefined);
const forget = (localId: string) =>
	withStore("readwrite", (s) => s.delete(localId)).catch(() => undefined);
const stored = () =>
	withStore<PendingTake[]>("readonly", (s) => s.getAll() as IDBRequest<PendingTake[]>).catch(
		() => [] as PendingTake[],
	);

export class TakeQueue {
	items = $state<QueueItem[]>([]);
	#running = false;
	/** Creates the idea a take belongs to when it has none yet (the page's ensureIdea, or a fresh one on resume). */
	#ideaFor: (item: QueueItem) => Promise<string>;
	#onsaved: (saved: SavedTake) => void;

	constructor(opts: {
		ideaFor: (item: QueueItem) => Promise<string>;
		onsaved: (saved: SavedTake) => void;
	}) {
		this.#ideaFor = opts.ideaFor;
		this.#onsaved = opts.onsaved;
	}

	/** Pending takes left by an earlier visit; their uploads resume at once. */
	async restore() {
		const left = await stored();
		for (const t of left.sort((a, b) => a.createdAt - b.createdAt)) {
			if (!this.items.some((i) => i.localId === t.localId)) {
				this.items.push({ ...t, status: "waiting", progress: 0, error: null });
			}
		}
		void this.#run();
	}

	/** A stopped take: on disk first, then in line for upload. Returns at once. */
	enqueue(t: PendingTake) {
		this.items.push({ ...t, status: "waiting", progress: 0, error: null });
		void persist(t);
		void this.#run();
	}

	retry(localId: string) {
		const item = this.items.find((i) => i.localId === localId);
		if (item && item.status === "failed") {
			item.status = "waiting";
			item.error = null;
			void this.#run();
		}
	}

	/** Drop a pending take (it was never saved). */
	async discard(localId: string) {
		this.items = this.items.filter((i) => i.localId !== localId);
		await forget(localId);
	}

	get pending() {
		return this.items.filter((i) => i.status !== "failed").length;
	}

	async #run() {
		if (this.#running) return;
		this.#running = true;
		try {
			for (;;) {
				const item = this.items.find((i) => i.status === "waiting");
				if (!item) break;
				item.status = "uploading";
				item.progress = 0;
				try {
					if (!item.ideaId) {
						item.ideaId = await this.#ideaFor(item);
						void persist(item);
					}
					const ideaId = item.ideaId;
					const file = new File([item.blob], `take-${item.localId}.${item.ext}`, {
						type: item.mimeType,
					});
					const { recordingId, takeNumber } = await uploadRecordingFile(
						file,
						() =>
							postJson<RecordingReservation>("/api/recordings", {
								ideaId,
								title: item.name,
								filename: file.name,
								sizeBytes: file.size,
							}),
						item.durationSeconds,
						(percent) => (item.progress = percent),
					);
					this.items = this.items.filter((i) => i.localId !== item.localId);
					await forget(item.localId);
					this.#onsaved({
						localId: item.localId,
						id: recordingId,
						takeNumber,
						title: item.name,
						durationSeconds: item.durationSeconds,
					});
				} catch (e) {
					item.status = "failed";
					item.error = errorMessage(e);
				}
			}
		} finally {
			this.#running = false;
		}
	}
}
