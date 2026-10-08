import { postJson, uploadStudioSourceFile, type StudioSourceReservation } from "#lib/upload.js";
import { errorMessage } from "#lib/utils/errorMessage.js";

/**
 * The Studio's upload queue (docs/multitrack-recorder.md): a finished take
 * is written to IndexedDB first, then uploaded as a `studio_source` under
 * the id the engine already uses for it, one file at a time in order. A
 * refresh, a crash or a phone switching apps loses nothing: the page
 * resumes the uploads when it comes back (and the arrangement, autosaved
 * on the server, already names the source). Modelled on the Idea
 * Recorder's TakeQueue.
 */
export interface PendingSource {
	/** The source's id in the arrangement; the server keeps it. */
	sourceId: string;
	ideaId: string;
	kind: "take" | "import";
	trackLabel: string;
	takeNumber: number;
	durationSeconds: number;
	sampleRate: number;
	channels: 1 | 2;
	peaks: number[];
	createdAt: number;
	/** The file's name as reserved ("guitar.wav"; an import keeps its own name and type). */
	filename: string;
	blob: Blob;
}
interface SourceQueueItem extends PendingSource {
	status: "waiting" | "uploading" | "failed";
	progress: number;
	error: string | null;
}

const DB_NAME = "stem-shovel-studio";
const STORE = "pendingSources";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE))
				req.result.createObjectStore(STORE, { keyPath: "sourceId" });
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
const persist = (t: PendingSource) =>
	withStore("readwrite", (s) => s.put(t)).catch(() => undefined);
const forget = (sourceId: string) =>
	withStore("readwrite", (s) => s.delete(sourceId)).catch(() => undefined);
const stored = () =>
	withStore<PendingSource[]>("readonly", (s) => s.getAll() as IDBRequest<PendingSource[]>).catch(
		() => [] as PendingSource[],
	);

export class StudioQueue {
	items = $state<SourceQueueItem[]>([]);
	#running = false;
	#onsaved: (sourceId: string, ideaId: string) => void;

	constructor(opts: { onsaved: (sourceId: string, ideaId: string) => void }) {
		this.#onsaved = opts.onsaved;
	}

	/** Sources left by an earlier visit; their uploads resume at once. */
	async restore() {
		const left = await stored();
		for (const t of left.sort((a, b) => a.createdAt - b.createdAt))
			if (!this.items.some((i) => i.sourceId === t.sourceId))
				this.items.push({ ...t, status: "waiting", progress: 0, error: null });
		void this.#run();
	}
	/** A finished take: on disk first, then in line. Returns at once. */
	enqueue(t: PendingSource) {
		this.items.push({ ...t, status: "waiting", progress: 0, error: null });
		void persist(t);
		void this.#run();
	}
	retry(sourceId: string) {
		const item = this.items.find((i) => i.sourceId === sourceId);
		if (item && item.status === "failed") {
			item.status = "waiting";
			item.error = null;
			void this.#run();
		}
	}
	async discard(sourceId: string) {
		this.items = this.items.filter((i) => i.sourceId !== sourceId);
		await forget(sourceId);
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
					const file = new File([item.blob], item.filename, {
						type: item.blob.type || "audio/wav",
					});
					await uploadStudioSourceFile(
						file,
						() =>
							postJson<StudioSourceReservation>("/api/studio/sources", {
								id: item.sourceId,
								ideaId: item.ideaId,
								kind: item.kind,
								trackLabel: item.trackLabel,
								takeNumber: item.takeNumber,
								filename: file.name,
								sizeBytes: file.size,
								codec: item.kind === "take" ? "pcm" : null,
								sampleRate: item.sampleRate,
								channels: item.channels,
								durationSeconds: item.durationSeconds,
							}),
						{ peaks: item.peaks, durationSeconds: item.durationSeconds },
						(percent) => (item.progress = percent),
					);
					this.items = this.items.filter((i) => i.sourceId !== item.sourceId);
					await forget(item.sourceId);
					this.#onsaved(item.sourceId, item.ideaId);
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
