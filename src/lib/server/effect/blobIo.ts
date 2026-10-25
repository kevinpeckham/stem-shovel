import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BlobError } from "./errors.js";
import { BlobStore } from "./services.js";
import { JobTuning } from "./tuning.js";

/**
 * Worth another try: the store answering 5xx, or the connection failing
 * (undici's `TypeError: fetch failed`, a system error with a `code` such as
 * ECONNRESET mid-stream). A 404 is not, and neither is a plain throw such as
 * `readBlob`'s refusal of a URL outside our stores.
 */
function isTransient(e: BlobError) {
	if (e.status !== undefined) return e.status >= 500;
	const cause = e.cause;
	return (
		cause instanceof TypeError ||
		(typeof cause === "object" &&
			cause !== null &&
			typeof (cause as { code?: unknown }).code === "string")
	);
}

/**
 * Streams a Blob file into `file`, retrying a transient failure up to three
 * times with jittered backoff (`JobTuning.retryBase`). A non-2xx answer is a
 * `BlobError` with its status; interrupting the effect aborts the stream.
 */
export function downloadToFile(
	url: string,
	file: string,
): Effect.Effect<void, BlobError, BlobStore> {
	return Effect.gen(function* () {
		const { retryBase } = yield* JobTuning;
		const once = Effect.gen(function* () {
			const store = yield* BlobStore;
			const res = yield* store.read(url);
			if (!res.ok || !res.body)
				return yield* new BlobError({ op: "read", url, status: res.status });
			const body = res.body;
			yield* Effect.tryPromise({
				try: (signal) =>
					pipeline(Readable.fromWeb(body as never), createWriteStream(file), { signal }),
				catch: (cause) => new BlobError({ op: "read", url, cause }),
			});
		});
		yield* Effect.retry(once, {
			schedule: Schedule.jittered(Schedule.exponential(retryBase)),
			times: 3,
			while: isTransient,
		});
	}).pipe(Effect.withSpan("blob.download", { attributes: { url } }));
}
