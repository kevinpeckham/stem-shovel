/**
 * The disk cache worker's order of work (workers/pcmCache.worker.ts): one
 * job at a time, first come first served, except that quick jobs (a
 * streaming voice's header and window reads) overtake. A quick job runs
 * at once when nothing else runs, and otherwise at the running job's next
 * `slice()`: a long job (a write of hundreds of megabytes) calls it
 * between slices of its work, which pauses (`pause`, a yield to the event
 * loop, so requests posted meanwhile arrive) and then serves every quick
 * job queued. Quick jobs never wait behind an ordinary job's whole run,
 * and an ordinary job never runs beside another one.
 */
export interface SliceQueue {
	/** Queues an ordinary job, handed the `slice` it may call between pieces of its work. */
	push<T>(work: (slice: () => Promise<void>) => Promise<T>): Promise<T>;
	/** Queues a quick job, which overtakes ordinary jobs at their next slice. */
	quick<T>(work: () => Promise<T>): Promise<T>;
}

type Job = () => Promise<void>;

export function createSliceQueue(pause: () => Promise<void>): SliceQueue {
	const quick: Job[] = [];
	const ordinary: Job[] = [];
	let running = false;

	async function drainQuick() {
		while (quick.length) await quick.shift()!();
	}
	async function slice() {
		await pause();
		await drainQuick();
	}
	async function pump() {
		if (running) return;
		running = true;
		try {
			for (;;) {
				await drainQuick();
				const next = ordinary.shift();
				if (!next) break;
				await next();
			}
		} finally {
			running = false;
		}
	}
	function enqueue<T>(list: Job[], work: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			list.push(async () => {
				try {
					resolve(await work());
				} catch (e) {
					reject(e);
				}
			});
			void pump();
		});
	}
	return {
		push: (work) => enqueue(ordinary, () => work(slice)),
		quick: (work) => enqueue(quick, work),
	};
}
