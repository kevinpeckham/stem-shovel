import type {
	RecordingFeaturesReply,
	RecordingFeaturesRequest,
} from "#lib/workers/recordingFeatures.worker.js";
import {
	type ChromaPart,
	type Features,
	joinFeatures,
	type OnsetPart,
} from "@barmark/listen/features";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { readAlignmentFeatures, writeAlignmentFeatures } from "./alignmentFeaturesCache.js";
import { monoOfBuffers } from "./monoOfBuffers.js";

/**
 * The recording's features both stem readings share (@barmark/listen's
 * `Features`): the chart alignment (audio/alignChartInBrowser.ts) and the
 * chartless grid (audio/chartlessGridInBrowser.ts). From the browser's
 * cache when it holds a record for the renditions at the mix's rate
 * (audio/alignmentFeaturesCache.ts, read back through `readFeatures`),
 * else from two workers at once on the buffers mixed to mono
 * (workers/recordingFeatures.worker.ts: the chromagram and audible span in
 * one, the onset envelope in the other, each its own copy of the mix),
 * joined here (`joinFeatures`) and kept (fire and forget). Each request
 * runs in a worker of its own, an Effect resource (`acquireUseRelease`)
 * terminated however the exchange ends, so either reading's features serve
 * the other.
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

const featuresWorker = () =>
	new Worker(new URL("../workers/recordingFeatures.worker.ts", import.meta.url), {
		type: "module",
	});

/** One part of the features from its worker, on `recording` (transferred). */
function partOf<P extends "chroma" | "onset">(
	part: P,
	recording: Float32Array,
	sampleRate: number,
): Effect.Effect<P extends "chroma" ? ChromaPart : OnsetPart, Error> {
	const request: RecordingFeaturesRequest = { id: 1, part, recording, sampleRate };
	return inWorker<RecordingFeaturesReply>(featuresWorker, request, [recording.buffer]).pipe(
		// A worker's error became a failure in `exchange`, so the reply carries the part asked for.
		Effect.map(
			(reply) => (reply as unknown as Record<P, P extends "chroma" ? ChromaPart : OnsetPart>)[part],
		),
	);
}

/** The two parts computed at once on the mix and joined: the chroma's worker on a copy, the envelope's on the mix itself. */
function computed(buffers: AudioBuffer[]): Effect.Effect<Features, Error> {
	return Effect.suspend(() => {
		const { samples, sampleRate } = monoOfBuffers(buffers);
		const duration = samples.length / sampleRate;
		return Effect.all(
			[partOf("chroma", samples.slice(), sampleRate), partOf("onset", samples, sampleRate)],
			{ concurrency: "unbounded" },
		).pipe(
			Effect.flatMap(([chroma, onset]) => {
				const joined = joinFeatures(sampleRate, duration, chroma, onset);
				return joined.ok
					? Effect.succeed(joined.value)
					: Effect.fail(new Error(joined.refusals[0]!.message));
			}),
		);
	});
}

/**
 * The recording's features at the first buffer's rate: the kept record
 * under `cacheKey` when there is one at that rate, else computed and kept.
 */
export function recordingFeaturesOf(
	buffers: AudioBuffer[],
	cacheKey: string | null,
): Effect.Effect<Features, Error> {
	const sampleRate = buffers[0]!.sampleRate;
	return Effect.promise(() =>
		cacheKey ? readAlignmentFeatures(cacheKey) : Promise.resolve(null),
	).pipe(
		Effect.flatMap((cached) =>
			cached?.sampleRate === sampleRate
				? Effect.succeed(cached)
				: computed(buffers).pipe(
						Effect.tap((features) =>
							Effect.sync(() => {
								if (cacheKey) void writeAlignmentFeatures(cacheKey, features);
							}),
						),
					),
		),
	);
}
