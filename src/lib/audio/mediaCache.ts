import { mediaCacheKey } from "#lib/utils/mediaCacheKey.js";
import type {
	MediaCacheEstimate,
	MediaCacheReply,
	MediaCacheRequest,
	MediaCacheSong,
} from "#lib/workers/mediaCache.worker.js";

export type { MediaCacheEstimate, MediaCacheSong };

/**
 * The Stem Player's kept songs ("keep on this device"): each stem's
 * compressed playback rendition, as it came from Blob, kept in this
 * browser's Origin Private File System by workers/mediaCache.worker.ts,
 * so a kept song's audio never downloads again on this device. Keyed by
 * the rendition's file name (utils/mediaCacheKey.ts), which is unique per
 * rendition and the same however the URL is presigned, and grouped by
 * song so a song is kept, evicted and removed whole. The same contract as
 * audio/pcmCache.ts: it never throws; where there is no OPFS or no Worker
 * (a test, the server, Playwright's WebKit) every read is a miss and every
 * write a no-op, and an error anywhere, or a worker that does not answer
 * in time, is the same.
 *
 * One instance for the page (`mediaCache`), shared by the engine and the
 * player: one worker, one queue, so a keep's writes and a load's reads
 * are ordered against each other.
 */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type Payload = WithoutId<MediaCacheRequest>;

/** How long a read or a stat waits before it counts as a miss. */
const READ_TIMEOUT_MS = 5000;
/** A write, a removal or a listing: a keep's write queues behind the ones before it. */
const OTHER_TIMEOUT_MS = 30_000;

export class MediaCache {
	#worker: Worker | null = null;
	#broken = false;
	#warned = false;
	#nextId = 1;
	#pending = new Map<number, (reply: MediaCacheReply | null) => void>();

	/** Whether this browser could keep songs at all (OPFS and workers). */
	get available(): boolean {
		return (
			!this.#broken &&
			typeof Worker !== "undefined" &&
			typeof navigator !== "undefined" &&
			typeof navigator.storage?.getDirectory === "function"
		);
	}

	/** The cache key for a rendition URL (utils/mediaCacheKey.ts), or null when it has none. */
	keyOf(url: string): string | null {
		return mediaCacheKey(url);
	}

	#warn(why: unknown) {
		if (this.#warned) return;
		this.#warned = true;
		console.warn("Kept songs unavailable; stems load from the network.", why);
	}

	#start(): Worker {
		if (this.#worker) return this.#worker;
		const worker = new Worker(new URL("../workers/mediaCache.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.onmessage = (e: MessageEvent<MediaCacheReply>) => {
			const done = this.#pending.get(e.data.id);
			this.#pending.delete(e.data.id);
			done?.(e.data);
		};
		worker.onerror = (e) => {
			// The worker itself failed (it would not load, say): what it owed is a miss, and the cache stays off for this page.
			this.#warn(e);
			this.#broken = true;
			worker.terminate();
			this.#worker = null;
			const owed = Array.from(this.#pending.values());
			this.#pending.clear();
			for (const done of owed) done(null);
		};
		this.#worker = worker;
		return worker;
	}

	/** One request answered, or null on any failure. */
	#ask(
		payload: Payload,
		transfer: Transferable[],
		timeoutMs: number,
	): Promise<MediaCacheReply | null> {
		if (!this.available) return Promise.resolve(null);
		return new Promise((resolve) => {
			const id = this.#nextId++;
			const timer = setTimeout(() => {
				if (!this.#pending.delete(id)) return;
				this.#warn("timed out");
				resolve(null);
			}, timeoutMs);
			this.#pending.set(id, (reply) => {
				clearTimeout(timer);
				if (reply?.error) {
					this.#warn(reply.error);
					resolve(null);
				} else resolve(reply);
			});
			try {
				this.#start().postMessage({ ...payload, id } as MediaCacheRequest, transfer);
			} catch (e) {
				this.#pending.delete(id);
				clearTimeout(timer);
				this.#warn(e);
				resolve(null);
			}
		});
	}

	/** The file's size, or null when there is no good copy (or one is being written). Marks it used. */
	async stat(key: string, timeoutMs = READ_TIMEOUT_MS): Promise<{ bytes: number } | null> {
		const reply = await this.#ask({ op: "stat", key }, [], timeoutMs);
		return reply?.stat ?? null;
	}

	/** The rendition's bytes, transferred from the worker, or null when there is no good copy. Marks it used. */
	async read(key: string): Promise<ArrayBuffer | null> {
		const reply = await this.#ask({ op: "read", key }, [], READ_TIMEOUT_MS);
		return reply?.bytes ?? null;
	}

	/**
	 * Keeps the bytes as the song's file under `key`. The buffer is
	 * transferred to the worker, so it is detached here: pass a copy of
	 * anything still needed. True when the file is kept once the cache fits
	 * its budget; false on any failure, or when the song is larger than the
	 * budget.
	 */
	async write(key: string, bytes: ArrayBuffer, song: string): Promise<boolean> {
		const reply = await this.#ask({ op: "write", key, bytes, song }, [bytes], OTHER_TIMEOUT_MS);
		return reply?.kept === true;
	}

	/** Drops one file. */
	async forget(key: string): Promise<void> {
		await this.#ask({ op: "forget", key }, [], OTHER_TIMEOUT_MS);
	}

	/** Drops every file of the song. */
	async forgetSong(song: string): Promise<void> {
		await this.#ask({ op: "forgetSong", song }, [], OTHER_TIMEOUT_MS);
	}

	/** Drops the song's files not in `keep` (a replaced stem's old rendition). */
	async prune(song: string, keep: string[]): Promise<void> {
		await this.#ask({ op: "prune", song, keep }, [], OTHER_TIMEOUT_MS);
	}

	/** Every song the cache holds files of, with their size and keys; empty when there is no cache or it did not answer in `timeoutMs`. */
	async songs(timeoutMs = OTHER_TIMEOUT_MS): Promise<MediaCacheSong[]> {
		const reply = await this.#ask({ op: "songs" }, [], timeoutMs);
		return reply?.songs ?? [];
	}

	/** What the cache holds, and the site's quota; zeros when there is no cache. */
	async estimate(): Promise<MediaCacheEstimate> {
		const reply = await this.#ask({ op: "estimate" }, [], OTHER_TIMEOUT_MS);
		return reply?.estimate ?? { bytes: 0, files: 0, quota: 0 };
	}

	/** Everything dropped. */
	async clear(): Promise<void> {
		await this.#ask({ op: "clear" }, [], OTHER_TIMEOUT_MS);
	}
}

export const mediaCache = new MediaCache();
