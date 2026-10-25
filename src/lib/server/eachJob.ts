import { reportError } from "#lib/server/reportError.js";

/**
 * Runs `work` for each id in turn (serial: one ffmpeg or decode at a time
 * keeps memory flat). A throw is logged and reported to Sentry with the
 * job's kind and the id, and the next id still runs: one bad file no
 * longer drops the rest of its batch.
 */
export async function eachJob(
	kind: string,
	ids: readonly string[],
	work: (id: string) => Promise<void>,
): Promise<void> {
	for (const id of ids) {
		try {
			await work(id);
		} catch (e) {
			console.error("[jobs]", kind, id, e);
			reportError(e, { job: kind }, { id });
		}
	}
}
