import { decodePcmFile, encodePcmFile } from "#lib/utils/pcmFile.js";
import type {
	PcmCacheEstimate,
	PcmCacheReply,
	PcmCacheRequest,
	PcmStat,
} from "#lib/workers/pcmCache.worker.js";

export type { PcmStat };

/**
 * A disk copy of each decoded source, kept in this browser's Origin
 * Private File System by workers/pcmCache.worker.ts
 * (docs/multitrack-recorder.md "Scale and structure"): a cold source, a
 * reopened song and a recording still uploading come back from disk, not
 * the network. Keyed by the source id, which a file keeps through its
 * upload and the later FLAC conversion (the samples do not change). It
 * never throws: where there is no OPFS or no Worker (a test, the server,
 * Playwright's WebKit) every read is a miss and every write a no-op, and
 * an error anywhere, or a worker that does not answer in time, is the same.
 */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type Payload = WithoutId<PcmCacheRequest>;

/** How long a read (whole, a header or a window) waits before it counts as a miss. */
const READ_TIMEOUT_MS = 5000;
const OTHER_TIMEOUT_MS = 30_000;

export class PcmCache {
	#worker: Worker | null = null;
	#broken = false;
	#warned = false;
	#nextId = 1;
	#pending = new Map<number, (reply: PcmCacheReply | null) => void>();

	/** Whether this browser could keep the cache at all (OPFS and workers). */
	get available(): boolean {
		return (
			!this.#broken &&
			typeof Worker !== "undefined" &&
			typeof navigator !== "undefined" &&
			typeof navigator.storage?.getDirectory === "function"
		);
	}

	#warn(why: unknown) {
		if (this.#warned) return;
		this.#warned = true;
		console.warn("Studio disk cache unavailable; sources load from the network.", why);
	}

	#start(): Worker {
		if (this.#worker) return this.#worker;
		const worker = new Worker(new URL("../workers/pcmCache.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.onmessage = (e: MessageEvent<PcmCacheReply>) => {
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
	): Promise<PcmCacheReply | null> {
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
				this.#start().postMessage({ ...payload, id } as PcmCacheRequest, transfer);
			} catch (e) {
				this.#pending.delete(id);
				clearTimeout(timer);
				this.#warn(e);
				resolve(null);
			}
		});
	}

	/** The source's samples at the rate they were decoded at, or null when there is no good copy. */
	async read(key: string): Promise<{ sampleRate: number; channels: Float32Array[] } | null> {
		const reply = await this.#ask({ op: "read", key }, [], READ_TIMEOUT_MS);
		return reply?.bytes ? decodePcmFile(reply.bytes) : null;
	}

	/** The source's header and file size without its samples, or null when there is no good copy (or one is being written). */
	async stat(key: string): Promise<PcmStat | null> {
		const reply = await this.#ask({ op: "stat", key }, [], READ_TIMEOUT_MS);
		return reply?.stat ?? null;
	}

	/**
	 * A window of the source: up to `frames` of every channel from
	 * `fromFrame`, clipped to the source's end (the channels' length says
	 * how many came), as views on one transferred buffer. Null when there
	 * is no good copy, it is being written, or `fromFrame` is past the end.
	 */
	async readRange(
		key: string,
		fromFrame: number,
		frames: number,
	): Promise<{ fromFrame: number; sampleRate: number; channels: Float32Array[] } | null> {
		const reply = await this.#ask({ op: "readRange", key, fromFrame, frames }, [], READ_TIMEOUT_MS);
		const range = reply?.range;
		if (!range || range.data.byteLength !== range.channels * range.frames * 4) return null;
		return {
			fromFrame: range.fromFrame,
			sampleRate: range.sampleRate,
			channels: Array.from(
				{ length: range.channels },
				(_, i) => new Float32Array(range.data, i * range.frames * 4, range.frames),
			),
		};
	}

	/** Keeps a copy of the buffer's samples (copied, so the buffer's own data is never detached). */
	async write(key: string, buffer: AudioBuffer): Promise<void> {
		if (!this.available) return;
		let bytes: Uint8Array;
		try {
			const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
				buffer.getChannelData(i),
			);
			bytes = encodePcmFile(channels, buffer.sampleRate);
		} catch (e) {
			this.#warn(e);
			return;
		}
		const data = bytes.buffer as ArrayBuffer;
		await this.#ask({ op: "write", key, bytes: data }, [data], OTHER_TIMEOUT_MS);
	}

	/** Drops a source's copy (the source left the song). */
	async forget(key: string): Promise<void> {
		await this.#ask({ op: "forget", key }, [], OTHER_TIMEOUT_MS);
	}

	/** What the cache holds, and the site's quota; zeros when there is no cache. */
	async estimate(): Promise<PcmCacheEstimate> {
		const reply = await this.#ask({ op: "estimate" }, [], OTHER_TIMEOUT_MS);
		return reply?.estimate ?? { bytes: 0, entries: 0, quota: 0 };
	}

	/** Everything dropped. */
	async clear(): Promise<void> {
		await this.#ask({ op: "clear" }, [], OTHER_TIMEOUT_MS);
	}
}

export const pcmCache = new PcmCache();
