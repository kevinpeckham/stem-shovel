import type {
	AlignmentEnvelopeReply,
	AlignmentEnvelopeRequest,
} from "#lib/workers/alignmentEnvelope.worker.js";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { type AlignmentFeaturesRecord, writeAlignmentFeatures } from "./alignmentFeaturesCache.js";
import type { RecordingFeatures } from "./chartAlignment.js";

/**
 * The recording-feature workers both stem readings share: the chart
 * alignment (audio/alignChartInBrowser.ts) and the chartless grid
 * (audio/chartlessGridInBrowser.ts). Each request runs in a worker of its
 * own, an Effect resource (`acquireUseRelease`) terminated however the
 * exchange ends; the kept record (audio/alignmentFeaturesCache.ts) is read
 * the same way by both, so either one's features serve the other.
 */

/** How long a reading's workers may take before it gives up: 90 s, a long song's chromagram and warping with room to spare. */
export const WORKER_TIMEOUT = Duration.seconds(90);

type Answer<R> = Exclude<R, { error: string }>;

/** The message exchange: posts the request (`transfer` moved, not copied) and settles on the worker's answer or its error event. */
function exchange<R extends { id: number }>(
	worker: Worker,
	request: object,
	transfer: Transferable[],
): Effect.Effect<Answer<R>, Error> {
	return Effect.callback<Answer<R>, Error>((resume) => {
		worker.onmessage = (e: MessageEvent<R | { id: number; error: string }>) =>
			resume(
				"error" in e.data
					? Effect.fail(new Error(e.data.error))
					: Effect.succeed(e.data as Answer<R>),
			);
		worker.onerror = () =>
			resume(Effect.fail(new Error("Aligning the chart failed in the browser")));
		worker.postMessage(request, transfer);
	});
}

/** One request in a worker of its own, terminated however the exchange ends. */
export function inWorker<R extends { id: number }>(
	spawn: () => Worker,
	request: object,
	transfer: Transferable[],
) {
	return Effect.acquireUseRelease(
		Effect.sync(spawn),
		(worker) => exchange<R>(worker, request, transfer),
		(worker) => Effect.sync(() => worker.terminate()),
	);
}

const envelopeWorker = () =>
	new Worker(new URL("../workers/alignmentEnvelope.worker.ts", import.meta.url), {
		type: "module",
	});

export type Envelope = { onset: Float32Array; fps: number };

/** What a kept record gives at the mix's rate: the recording's features and its envelope, each null when it lacks them (a record at another rate gives neither). */
export function keptFeatures(cached: AlignmentFeaturesRecord | null, sampleRate: number) {
	if (cached?.sampleRate !== sampleRate) return { features: null, envelope: null };
	const { chroma, frames, hopSec, firstSound, lastSound, onset, fps } = cached;
	const features: RecordingFeatures = { chroma, frames, hopSec, firstSound, lastSound };
	return { features, envelope: onset && fps !== null ? { onset, fps } : null };
}

/** The envelope: the kept one, or its worker on the mix (transferred). */
export function envelopeOf(
	kept: Envelope | null,
	recording: Float32Array | null,
	sampleRate: number,
): Effect.Effect<Envelope, Error> {
	if (kept) return Effect.succeed(kept);
	const request: AlignmentEnvelopeRequest = { id: 1, recording: recording!, sampleRate };
	return inWorker<AlignmentEnvelopeReply>(envelopeWorker, request, [recording!.buffer]);
}

/** Keeps the recording's features and envelope under `cacheKey` (fire and forget): the record both readings write. */
export function keepFeatures(
	cacheKey: string,
	sampleRate: number,
	features: RecordingFeatures,
	{ onset, fps }: Envelope,
): void {
	const record = { key: cacheKey, at: Date.now(), sampleRate, ...features, onset, fps };
	void writeAlignmentFeatures(cacheKey, record);
}
